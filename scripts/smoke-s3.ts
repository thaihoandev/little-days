import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startS3Fixture } from './s3-fixture.js';
import { S3MediaStore, ObjectNotFoundError } from '../apps/api/src/storage.js';
const fixture = await startS3Fixture();
const store = new S3MediaStore({
  bucket: fixture.bucket,
  region: 'us-east-1',
  endpoint: fixture.endpoint,
  accessKeyId: 'fixture-access-key',
  secretAccessKey: 'fixture-secret-key',
  forcePathStyle: true,
  prefix: 'contract-test',
});
try {
  await store.ready();
  await store.put('uploads/image.webp', Buffer.from('image bytes'), 'image/webp');
  assert.equal((await store.read('uploads/image.webp')).toString(), 'image bytes');
  await assert.rejects(store.read('uploads/image.webp', 2), /giới hạn/);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/s3-source.mp4', 'video bytes');
  await store.putFile('exports/job/lease.mp4', 'test-results/s3-source.mp4', 'video/mp4');
  assert.equal((await store.read('exports/job/lease.mp4')).toString(), 'video bytes');
  await store.remove('uploads/image.webp');
  await store.remove('uploads/image.webp');
  await assert.rejects(store.get('uploads/image.webp'), ObjectNotFoundError);
  assert.ok(fixture.requests.every((r) => r.signed));
  assert.ok(fixture.objects.has('contract-test/exports/job/lease.mp4'));
  console.log(
    'PASS S3 HTTP contract: signed SDK requests, bucket readiness, buffer/stream upload, bounded reads, private download, prefix and deletion.',
  );
} finally {
  store.close();
  await fixture.close();
}
