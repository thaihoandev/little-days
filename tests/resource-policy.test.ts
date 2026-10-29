import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile, mkdir, utimes, symlink, readFile } from 'node:fs/promises';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { cleanWorkspaces } from '../apps/api/src/maintenance.js';
import { Observability } from '../apps/api/src/observability.js';
import { makeJob } from './job-fixture.js';
async function fixture() {
  const root = path.resolve('test-results/resources', crypto.randomUUID()),
    db = new Repository({ dataDir: root, databaseUrl: process.env.TEST_DATABASE_URL || '' });
  await db.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  await new AlbumHistory(db).init();
  const store = new LocalMediaStore(root);
  await store.ready();
  const deletion = new AccountDeletion(db, jobs, store, root);
  await deletion.init();
  const policy = new ResourcePolicy(db, store);
  await policy.init();
  const owner = crypto.randomUUID();
  const originalClose = db.close.bind(db);
  db.close = async () => {
    await db.query('DELETE FROM render_jobs WHERE owner=? RETURNING id', [owner]);
    await db.query('DELETE FROM records WHERE owner=? RETURNING id', [owner]);
    await db.query('DELETE FROM album_versions WHERE owner=? RETURNING album_id', [owner]);
    await db.query('DELETE FROM managed_media WHERE owner=? RETURNING object_key', [owner]);
    await db.query('DELETE FROM export_events WHERE owner=? RETURNING job_id', [owner]);
    await originalClose();
  };
  return { db, jobs, store, deletion, policy, owner, root };
}
test('parallel storage reservations cannot overspend and a failed delete remains charged', async () => {
  const f = await fixture();
  try {
    const bytes = f.policy.limits.storageBytes - 1;
    const results = await Promise.allSettled([
      f.policy.reserve(f.owner, 'uploads/' + crypto.randomUUID() + '.webp', bytes),
      f.policy.reserve(f.owner, 'uploads/' + crypto.randomUUID() + '.webp', bytes),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await f.policy.usage(f.owner)).storageBytes, bytes);
    const key = String(
      (await f.db.query('SELECT object_key FROM managed_media WHERE owner=?', [f.owner]))[0]
        .object_key,
    );
    const remove = f.store.remove.bind(f.store);
    f.store.remove = async () => {
      throw new Error('offline');
    };
    await assert.rejects(f.policy.remove(key));
    assert.equal((await f.policy.usage(f.owner)).storageBytes, bytes);
    f.store.remove = remove;
    await f.policy.remove(key);
    assert.equal((await f.policy.usage(f.owner)).storageBytes, 0);
  } finally {
    await f.db.close();
  }
});
test('rolling export quota survives deletion of job history and duplicate requests do not spend twice', async () => {
  const f = await fixture();
  try {
    const job = makeJob();
    assert.ok(await f.policy.createExport(job, f.owner, f.jobs, 15));
    assert.equal(await f.policy.createExport(job, f.owner, f.jobs, 15), false);
    assert.equal((await f.policy.usage(f.owner)).exportsLast24h, 1);
    await f.jobs.cancel(job.id, f.owner);
    await f.jobs.remove(job.id, f.owner);
    for (let i = 1; i < f.policy.limits.exportsPerDay; i++) {
      const next = makeJob();
      await f.policy.createExport(next, f.owner, f.jobs, 1);
      await f.jobs.cancel(next.id, f.owner);
      await f.jobs.remove(next.id, f.owner);
    }
    await assert.rejects(f.policy.createExport(makeJob(), f.owner, f.jobs, 1), /24 giờ/);
    await f.db.query('UPDATE export_events SET created_at=0 WHERE owner=?', [f.owner]);
    assert.ok(await f.policy.createExport(makeJob(), f.owner, f.jobs, 1));
  } finally {
    await f.db.close();
  }
});
test('cleanup dry-run is inert, protects history and active operations, retries failed deletes and expires video', async () => {
  const f = await fixture();
  try {
    const asset = crypto.randomUUID(),
      key = 'uploads/' + asset + '.webp',
      orphan = 'uploads/' + crypto.randomUUID() + '.webp';
    const job = makeJob();
    job.snapshot.assets = [
      { id: asset, name: 'history', width: 1, height: 1, bytes: 5, url: '/private' },
    ];
    await f.db.put('album', job.snapshot.id, f.owner, job.snapshot);
    await f.db.compareAndSwap('album', job.snapshot.id, f.owner, 0, {
      ...job.snapshot,
      revision: 1,
      assets: [],
    });
    await f.store.put(key, Buffer.from('image'), 'image/webp');
    await f.policy.reserve(f.owner, key, 5);
    await f.store.put(orphan, Buffer.from('orphan'), 'image/webp');
    await f.policy.reserve(f.owner, orphan, 6);
    await f.db.query('UPDATE managed_media SET created_at=0 WHERE owner=?', [f.owner]);
    assert.equal((await f.policy.cleanup()).orphans, 1);
    assert.equal((await f.store.read(orphan)).toString(), 'orphan');
    const operation = await f.deletion.begin(f.owner);
    assert.equal((await f.policy.cleanup()).orphans, 0);
    await f.deletion.end(operation);
    const remove = f.store.remove.bind(f.store);
    f.store.remove = async () => {
      throw new Error('offline');
    };
    await assert.rejects(f.policy.cleanup(true));
    f.store.remove = remove;
    assert.equal((await f.policy.cleanup(true)).removed, 1);
    assert.equal((await f.store.read(key)).toString(), 'image');
    const output = 'exports/' + job.id + '/' + crypto.randomUUID() + '.mp4';
    await f.jobs.create(job, f.owner);
    const lease = await f.jobs.claim(30000);
    assert.ok(lease);
    await f.store.put(output, Buffer.from('video'), 'video/mp4');
    await f.policy.reserve(f.owner, output, 5);
    await f.jobs.complete(lease, output);
    await f.db.query('UPDATE render_jobs SET created_at=0 WHERE id=?', [job.id]);
    await f.db.query('UPDATE managed_media SET created_at=0 WHERE object_key=?', [output]);
    assert.equal((await f.policy.cleanup()).expired, 1);
    await f.policy.cleanup(true);
    assert.equal((await f.jobs.get(job.id))?.status, 'failed');
    await assert.rejects(f.store.get(output));
  } finally {
    await f.db.close();
  }
});
test('workspace cleanup protects active attempts and never follows directory symlinks', async () => {
  const f = await fixture();
  try {
    const job = makeJob(),
      target = path.join(f.root, 'work', job.id, crypto.randomUUID());
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'part'), 'test');
    await utimes(target, 0, 0);
    await f.jobs.create(job, f.owner);
    assert.equal(await cleanWorkspaces(f.db, f.root, 3600000, false), 0);
    await f.jobs.cancel(job.id, f.owner);
    const outside = path.join(f.root, 'keep-outside'),
      linked = path.join(f.root, 'work', job.id, crypto.randomUUID());
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, 'keep'), 'private');
    await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(await cleanWorkspaces(f.db, f.root, 3600000, false), 1);
    assert.equal(await cleanWorkspaces(f.db, f.root, 3600000, true), 1);
    assert.equal(await readFile(path.join(outside, 'keep'), 'utf8'), 'private');
    assert.equal(await cleanWorkspaces(f.db, f.root, 3600000, false), 0);
  } finally {
    await f.db.close();
  }
});
test('metrics require a separate operator credential and contain no private account content', async () => {
  const f = await fixture(),
    ops = new Observability(),
    previous = process.env.OPS_TOKEN;
  try {
    process.env.OPS_TOKEN = 'operator-test-credential-12345678901234567890';
    assert.equal(ops.authorized(undefined), false);
    assert.equal(ops.authorized('Bearer wrong'), false);
    assert.equal(ops.authorized('Bearer ' + process.env.OPS_TOKEN), true);
    const job = makeJob();
    job.config.opening = 'private words';
    await f.jobs.create(job, f.owner);
    const metrics = await ops.metrics(f.db);
    assert.match(metrics, /scrapbook_jobs\{state="queued"\}/);
    assert.ok(!metrics.includes('private words'));
    assert.ok(!metrics.includes(f.owner));
  } finally {
    if (previous === undefined) delete process.env.OPS_TOKEN;
    else process.env.OPS_TOKEN = previous;
    await f.db.close();
  }
});
test('storage namespace changes are refused and a second cleanup respects the current lease', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      new ResourcePolicy(f.db, f.store, path.join(f.root, 'different')).init(),
      /Storage target changed/,
    );
    await f.db.query(
      "INSERT INTO maintenance_locks(id,token,lease_until) VALUES('media-cleanup','other',?)",
      [(await f.db.now()) + 60000],
    );
    assert.equal((await f.policy.cleanup(true)).busy, true);
    await f.db.query("DELETE FROM maintenance_locks WHERE id='media-cleanup' RETURNING id");
  } finally {
    await f.db.close();
  }
});
