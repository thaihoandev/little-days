import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createMediaStore, ObjectNotFoundError } from '../apps/api/src/storage.js';
const store = createMediaStore('test-results/cloudinary-probe');
try {
  await store.ready();
  await store.put('uploads/one.webp', Buffer.from('image bytes'), 'image/webp');
  assert.equal((await store.read('uploads/one.webp')).toString(), 'image bytes');
  await assert.rejects(store.read('uploads/one.webp', 2), /giới hạn/);
  await mkdir('test-results', { recursive: true });
  const video = Buffer.alloc(7 * 1024 * 1024, 0x6a);
  await writeFile('test-results/cloudinary-probe.mp4', video);
  await store.putFile('exports/job/lease.mp4', 'test-results/cloudinary-probe.mp4', 'video/mp4');
  assert.deepEqual(await store.read('exports/job/lease.mp4'), video);
  await store.put('audio/track.mp3', Buffer.from('audio bytes'), 'audio/mpeg');
  assert.equal((await store.read('audio/track.mp3')).toString(), 'audio bytes');
  await store.remove('audio/track.mp3');
  await assert.rejects(store.get('audio/track.mp3'), ObjectNotFoundError);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    store.putFile(
      'exports/job/aborted.mp4',
      'test-results/cloudinary-probe.mp4',
      'video/mp4',
      abort.signal,
    ),
  );
  await store.remove('uploads/one.webp');
  await store.remove('uploads/one.webp');
  await assert.rejects(store.get('uploads/one.webp'), ObjectNotFoundError);
  console.log('Cloudinary client contract passed.');
} finally {
  store.close();
}
