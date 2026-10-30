import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { startCloudinaryFixture } from './cloudinary-fixture.js';
const fixture = await startCloudinaryFixture();
try {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/cloudinary-client-probe.ts'], {
    env: { ...process.env, ...fixture.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout!.on('data', (d) => (output += d));
  child.stderr!.on('data', (d) => (output += d));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
  });
  assert.equal(code, 0, output);
  assert.ok(fixture.requests.length > 5);
  assert.ok(fixture.requests.every((r) => r.signed));
  assert.ok(fixture.requests.some((r) => r.path.includes('/video/upload')));
  const audioUploads = fixture.requests.filter(
    (r) => r.path.endsWith('/video/upload') && r.publicId === 'contract-test/audio/track',
  );
  assert.equal(audioUploads.length, 1);
  assert.equal(
    audioUploads[0].chunked,
    false,
    'Bounded MP3 uploads use a single authenticated stream',
  );
  assert.ok(
    fixture.requests.some(
      (r) =>
        r.path.endsWith('/video/upload') &&
        r.publicId === 'contract-test/exports/job/lease' &&
        r.chunked,
    ),
    'MP4 exports retain chunked uploads',
  );
  assert.ok(fixture.requests.some((r) => r.path.includes('/image/download')));
  assert.equal(
    fixture.objects.get('contract-test/exports/job/lease.mp4')?.bytes.length,
    7 * 1024 * 1024,
  );
  console.log(
    'PASS Cloudinary HTTP contract: SDK signatures, authenticated images/video, chunked upload, signed private downloads, bounded reads, cancellation and deletion.',
  );
} finally {
  await fixture.close();
}
