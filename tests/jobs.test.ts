import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { jobFixture, makeJob } from './job-fixture.js';

test('one active owner reservation is atomic, including simultaneous requests', async () => {
  const f = await jobFixture();
  try {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => f.jobs.create(makeJob(), f.owner)),
    );
    assert.equal(results.filter(Boolean).length, 1);
    const job = (await f.jobs.list(f.owner))[0];
    await f.jobs.cancel(job.id, f.owner);
    assert.equal(await f.jobs.create(makeJob(), f.owner), true);
  } finally {
    await f.close();
  }
});
test('worker startup does not reset a live lease; concurrent claims cannot take it', async () => {
  const f = await jobFixture();
  const second = new Repository({
    dataDir: f.dataDir,
    databaseUrl: process.env.TEST_DATABASE_URL || '',
  });
  try {
    await f.create();
    const lease = (await f.jobs.claim(30000))!;
    assert.ok(lease);
    await second.init();
    const jobs2 = new JobRepository(second);
    await jobs2.init();
    assert.equal((await jobs2.get(lease.job.id))?.status, 'preparing');
    assert.equal(await jobs2.claim(30000), undefined);
    assert.equal((await f.jobs.heartbeat(lease, 30000)).valid, true);
  } finally {
    await second.close();
    await f.close();
  }
});
test('expired worker loses update rights; replacement can publish its own output', async () => {
  const f = await jobFixture();
  try {
    await f.create();
    const stale = (await f.jobs.claim(30000))!;
    await f.db.query('UPDATE render_jobs SET lease_until=0 WHERE id=?', [stale.job.id]);
    const current = (await f.jobs.claim(30000))!;
    assert.notEqual(current.token, stale.token);
    assert.equal(current.job.attempts, 2);
    assert.deepEqual(await f.jobs.heartbeat(stale, 30000), { valid: false, canceled: false });
    assert.equal(await f.jobs.progress(stale, 'rendering', 90), false);
    assert.equal(await f.jobs.complete(stale, 'exports/stale.mp4'), false);
    assert.equal(await f.jobs.fail(stale, 'stale failure', false), false);
    assert.equal(
      await f.jobs.complete(current, `exports/${current.job.id}/${current.token}.mp4`),
      true,
    );
    assert.equal(await f.jobs.progress(current, 'rendering', 98), false);
    assert.equal((await f.jobs.get(current.job.id))?.status, 'completed');
  } finally {
    await f.close();
  }
});
test('cancellation wins against completion and cannot be undone by progress', async () => {
  const f = await jobFixture();
  try {
    const job = await f.create();
    const lease = (await f.jobs.claim(30000))!;
    assert.equal(await f.jobs.cancel(job.id, 'someone-else'), undefined);
    await f.jobs.cancel(job.id, f.owner);
    assert.equal((await f.jobs.heartbeat(lease, 30000)).canceled, true);
    assert.equal(await f.jobs.complete(lease, 'exports/invalid.mp4'), false);
    assert.equal(await f.jobs.progress(lease, 'rendering', 99), false);
    await f.jobs.fail(lease, 'canceled', false);
    assert.equal((await f.jobs.get(job.id))?.status, 'canceled');
  } finally {
    await f.close();
  }
});
test('bounded retries, crash recovery, and graceful release preserve lifecycle', async () => {
  const f = await jobFixture();
  try {
    const job = await f.create(undefined, 2);
    const first = (await f.jobs.claim(30000))!;
    await f.jobs.fail(first, 'temporary', true, 0);
    assert.equal((await f.jobs.get(job.id))?.status, 'queued');
    const second = (await f.jobs.claim(30000))!;
    assert.equal(second.job.attempts, 2);
    await f.db.query('UPDATE render_jobs SET lease_until=0 WHERE id=?', [job.id]);
    assert.equal(await f.jobs.claim(30000), undefined);
    assert.equal((await f.jobs.get(job.id))?.status, 'failed');
    const next = await f.create();
    const release = (await f.jobs.claim(30000))!;
    await f.jobs.release(release);
    assert.equal((await f.jobs.get(next.id))?.status, 'queued');
    assert.equal((await f.jobs.get(next.id))?.attempts, 0);
  } finally {
    await f.close();
  }
});
test('legacy exports migrate once, preserve downloads, and never resurrect after deletion', async () => {
  const f = await jobFixture();
  try {
    await f.db.remove('migration', 'render-jobs-v1');
    const legacy = { ...makeJob(), status: 'completed' as const, progress: 100 };
    await f.db.put('export', legacy.id, f.owner, legacy);
    await f.jobs.init();
    assert.equal((await f.jobs.get(legacy.id))?.outputKey, `exports/${legacy.id}.mp4`);
    await f.jobs.remove(legacy.id, f.owner);
    await f.jobs.init();
    assert.equal(await f.jobs.get(legacy.id), undefined);
    // A crash after an old cancellation request must not reserve this owner forever.
    await f.db.remove('migration', 'render-jobs-v1');
    const canceled = { ...makeJob(), status: 'rendering' as const, cancelRequested: true };
    await f.db.put('export', canceled.id, f.owner, canceled);
    await f.jobs.init();
    assert.equal((await f.jobs.get(canceled.id))?.status, 'canceled');
    assert.equal(await f.jobs.create(makeJob(), f.owner), true);
  } finally {
    await f.close();
  }
});
test('separate worker processes sharing SQLite never claim the same live job', async (t) => {
  if (process.env.TEST_DATABASE_URL) {
    t.skip('PostgreSQL processes are covered by test:workers.');
    return;
  }
  const f = await jobFixture('');
  try {
    const job = await f.create();
    const probe = () =>
      new Promise<{ id: string | null; token?: string }>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['--import', 'tsx', 'scripts/claim-worker.ts', f.dataDir],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let output = '',
          error = '';
        child.stdout.on('data', (v) => (output += v));
        child.stderr.on('data', (v) => (error += v));
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)),
        );
      });
    const results = await Promise.all([probe(), probe()]);
    assert.equal(results.filter((r) => r.id === job.id).length, 1);
    assert.equal((await f.jobs.get(job.id))?.attempts, 1);
  } finally {
    await f.close();
  }
});
