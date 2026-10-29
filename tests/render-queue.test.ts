import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RenderQueue, type JobRenderer } from '../apps/api/src/render.js';
import { PermanentRenderError } from '../apps/api/src/render-engine.js';
import { LocalMediaStore, ObjectNotFoundError } from '../apps/api/src/storage.js';
import { jobFixture } from './job-fixture.js';
import { JobRepository, type JobLease } from '../apps/api/src/jobs.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
const renderer =
  (text: string): JobRenderer =>
  async (_job, ctx) => {
    const file = path.join(ctx.workspace, 'output.mp4');
    await writeFile(file, text);
    ctx.progress(50);
    return file;
  };
test('queue publishes a streamed output and progress never reopens a completed task', async () => {
  const f = await jobFixture('');
  const store = new LocalMediaStore(f.dataDir);
  const queue = new RenderQueue(f.db, f.jobs, store, f.dataDir, {
    renderer: renderer('one result'),
  });
  try {
    const job = await f.create();
    await queue.tick();
    const done = (await f.jobs.get(job.id))!;
    assert.equal(done.status, 'completed');
    assert.equal(done.progress, 100);
    assert.equal((await store.read(done.outputKey!)).toString(), 'one result');
  } finally {
    await queue.stop();
    await f.close();
  }
});
test('stale upload cannot publish over or remove a replacement worker output', async () => {
  const f = await jobFixture('');
  const entered = deferred(),
    release = deferred();
  let oldKey = '';
  class PausingStore extends LocalMediaStore {
    override async putFile(key: string, source: string, type: string, signal?: AbortSignal) {
      await super.putFile(key, source, type, signal);
      if (!oldKey) {
        oldKey = key;
        entered.resolve();
        await release.promise;
      }
    }
  }
  const store = new PausingStore(f.dataDir);
  const oldQueue = new RenderQueue(f.db, f.jobs, store, f.dataDir, { renderer: renderer('old') });
  const newQueue = new RenderQueue(f.db, f.jobs, store, f.dataDir, { renderer: renderer('new') });
  try {
    const job = await f.create();
    const oldTask = oldQueue.tick();
    await entered.promise;
    await f.db.query('UPDATE render_jobs SET lease_until=0 WHERE id=?', [job.id]);
    await newQueue.tick();
    release.resolve();
    await oldTask;
    const done = (await f.jobs.get(job.id))!;
    assert.equal(done.status, 'completed');
    assert.equal(done.attempts, 2);
    assert.notEqual(done.outputKey, oldKey);
    assert.equal((await store.read(done.outputKey!)).toString(), 'new');
    await assert.rejects(store.get(oldKey), ObjectNotFoundError);
  } finally {
    release.resolve();
    await oldQueue.stop();
    await newQueue.stop();
    await f.close();
  }
});
test('graceful shutdown aborts work and returns its task without using a retry', async () => {
  const f = await jobFixture('');
  const entered = deferred();
  const queue = new RenderQueue(f.db, f.jobs, new LocalMediaStore(f.dataDir), f.dataDir, {
    renderer: async (_job, ctx) => {
      entered.resolve();
      await new Promise<void>((_resolve, reject) => {
        ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason), { once: true });
      });
      return '';
    },
  });
  try {
    const job = await f.create();
    const task = queue.tick();
    await entered.promise;
    await queue.stop();
    await task;
    const result = (await f.jobs.get(job.id))!;
    assert.equal(result.status, 'queued');
    assert.equal(result.attempts, 0);
  } finally {
    await queue.stop();
    await f.close();
  }
});
test('missing media is permanent and does not schedule repeated rendering', async () => {
  const f = await jobFixture('');
  const queue = new RenderQueue(f.db, f.jobs, new LocalMediaStore(f.dataDir), f.dataDir, {
    renderer: async () => {
      throw new PermanentRenderError('Missing input');
    },
  });
  try {
    const job = await f.create();
    await queue.tick();
    const result = (await f.jobs.get(job.id))!;
    assert.equal(result.status, 'failed');
    assert.equal(result.attempts, 1);
  } finally {
    await queue.stop();
    await f.close();
  }
});
test('an ambiguous completion response retains the output referenced by the committed job', async () => {
  const f = await jobFixture('');
  const store = new LocalMediaStore(f.dataDir);
  class AmbiguousRepository extends JobRepository {
    override async complete(lease: JobLease, key: string): Promise<boolean> {
      await super.complete(lease, key);
      throw new Error('Connection interrupted after commit');
    }
  }
  const jobs = new AmbiguousRepository(f.db);
  const queue = new RenderQueue(f.db, jobs, store, f.dataDir, {
    renderer: renderer('committed result'),
  });
  try {
    const job = await f.create();
    await queue.tick();
    const result = (await jobs.get(job.id))!;
    assert.equal(result.status, 'completed');
    assert.equal((await store.read(result.outputKey!)).toString(), 'committed result');
  } finally {
    await queue.stop();
    await f.close();
  }
});
