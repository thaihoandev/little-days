import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CloudinaryMediaStore, cloudinaryObject } from '../apps/api/src/cloudinary-storage.js';
test('Cloudinary keys preserve stable image/video IDs without exposing delivery URLs', () => {
  const journalKey = 'journal/' + crypto.randomUUID() + '.jpg';
  assert.equal(cloudinaryObject(journalKey, 'private').resourceType, 'image');
  assert.equal(cloudinaryObject(journalKey, 'private').format, 'jpg');
  assert.deepEqual(cloudinaryObject('uploads/photo.webp'), {
    publicId: 'little-days/uploads/photo',
    format: 'webp',
    resourceType: 'image',
  });
  assert.deepEqual(cloudinaryObject('exports/job/lease.mp4', 'my-album'), {
    publicId: 'my-album/exports/job/lease',
    format: 'mp4',
    resourceType: 'video',
  });
  assert.deepEqual(cloudinaryObject('audio/track.mp3'), {
    publicId: 'little-days/audio/track',
    format: 'mp3',
    resourceType: 'video',
  });
  for (const key of ['../private.webp', 'uploads/../../x.webp', 'uploads/test.jpg', '/outside.mp4'])
    assert.throws(() => cloudinaryObject(key));
  assert.throws(() => cloudinaryObject('uploads/image.webp', 'x'.repeat(255)));
});
test('empty or placeholder Cloudinary credentials fail before any network request', () => {
  assert.throws(
    () => new CloudinaryMediaStore({ cloudName: '', apiKey: '', apiSecret: '' }),
    /CLOUDINARY_CLOUD_NAME.*CLOUDINARY_API_KEY.*CLOUDINARY_API_SECRET/,
  );
  assert.throws(
    () =>
      new CloudinaryMediaStore({
        cloudName: 'test-cloud',
        apiKey: 'replace-me',
        apiSecret: 'replace-me',
      }),
    /Điền/,
  );
  assert.throws(
    () =>
      new CloudinaryMediaStore({
        cloudName: 'test-cloud',
        apiKey: 'key',
        apiSecret: 'secret',
        apiBaseUrl: 'http://untrusted.example',
      }),
    /HTTPS/,
  );
});
