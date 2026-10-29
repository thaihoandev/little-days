import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  LocalMediaStore,
  ObjectNotFoundError,
  validateObjectKey,
} from '../apps/api/src/storage.js';

test('local object storage preserves bytes, streams files, bounds reads, and handles deletion', async () => {
  const root = await mkdtemp(path.resolve('test-results/storage-'));
  const store = new LocalMediaStore(root);
  await store.ready();
  await store.put('uploads/one.webp', Buffer.from('image bytes'), 'image/webp');
  assert.equal((await store.read('uploads/one.webp')).toString(), 'image bytes');
  await assert.rejects(store.read('uploads/one.webp', 2), /giới hạn/);
  const source = path.join(root, 'source.mp4');
  await writeFile(source, 'video bytes');
  await store.putFile('exports/id/token.mp4', source, 'video/mp4');
  const streamed = await store.get('exports/id/token.mp4');
  assert.equal(streamed.size, 11);
  let content = '';
  for await (const chunk of streamed.stream) content += chunk;
  assert.equal(content, 'video bytes');
  await store.remove('uploads/one.webp');
  await assert.rejects(store.get('uploads/one.webp'), ObjectNotFoundError);
  await store.remove('uploads/one.webp');
});
test('storage keys reject traversal and platform-specific escape paths', () => {
  for (const key of [
    '../secret',
    'uploads/../../secret',
    '/etc/passwd',
    'C:/secret',
    'uploads\\secret',
    'uploads//file',
    'uploads/./file',
    'uploads/%2e%2e/file',
    '',
  ])
    assert.throws(() => validateObjectKey(key));
  assert.equal(validateObjectKey('exports/uuid/lease.mp4'), 'exports/uuid/lease.mp4');
});
test('an aborted file upload never publishes an object', async () => {
  const root = await mkdtemp(path.resolve('test-results/storage-'));
  const store = new LocalMediaStore(root);
  await store.ready();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    store.putFile('exports/canceled.mp4', 'nonexistent', 'video/mp4', controller.signal),
  );
  await assert.rejects(store.get('exports/canceled.mp4'), ObjectNotFoundError);
});
