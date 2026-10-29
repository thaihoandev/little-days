import assert from 'node:assert/strict';
import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { createMediaStore } from '../apps/api/src/storage.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
const [owner, jobId] = process.argv.slice(2),
  root = path.resolve(process.env.DATA_DIR!);
assert.ok(root.includes(path.join('test-results', 'deletion-api')));
const db = new Repository();
await db.init();
const jobs = new JobRepository(db),
  store = createMediaStore(root);
await store.ready();
const lifecycle = new AccountDeletion(db, jobs, store, root);
await lifecycle.init();
try {
  const job = await jobs.get(jobId, owner);
  assert.ok(job);
  const lease = await jobs.claim(30000);
  assert.equal(lease?.job.id, jobId);
  const outputKey = 'exports/' + jobId + '/' + lease!.token + '.mp4',
    orphanKey = 'uploads/' + crypto.randomUUID() + '.webp';
  const operation = await lifecycle.begin(owner, outputKey);
  await lifecycle.track(operation, [orphanKey]);
  await store.put(outputKey, Buffer.from('opaque video output'), 'video/mp4');
  await store.put(orphanKey, Buffer.from('unreferenced upload'), 'image/webp');
  await lifecycle.end(operation);
  assert.ok(await jobs.complete(lease!, outputKey));
  console.log(JSON.stringify({ outputKey, orphanKey }));
} finally {
  store.close();
  await db.close();
}
