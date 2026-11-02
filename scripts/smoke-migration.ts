import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { makeJob } from '../tests/job-fixture.js';
import { startStorageFixture } from './storage-fixture.js';
const fixture = await startStorageFixture();
const dataDir = path.resolve('test-results/migration', crypto.randomUUID());
const db = new Repository({ dataDir, databaseUrl: '' });
await db.init();
const source = new LocalMediaStore(dataDir);
await source.ready();
const assetId = crypto.randomUUID();
const audioId = crypto.randomUUID();
const job = { ...makeJob(), status: 'completed' as const, progress: 100 };
const album = {
  ...job.snapshot,
  assets: [
    {
      id: assetId,
      name: 'original.webp',
      width: 20,
      height: 20,
      bytes: 14,
      url: `/api/albums/${job.albumId}/assets/${assetId}`,
    },
  ],
};
await db.put('album', job.albumId, 'fixture-owner', album);
await db.put('export', job.id, 'fixture-owner', job);
await source.put(`uploads/${assetId}.webp`, Buffer.from('original image'), 'image/webp');
await source.put(`exports/${job.id}.mp4`, Buffer.from('original video'), 'video/mp4');
await db.put('audio', audioId, 'fixture-owner', {
  id: audioId,
  albumId: job.albumId,
  name: 'track.mp3',
  duration: 8,
  bytes: 14,
  url: '/api/audio/' + audioId,
});
await source.put('audio/' + audioId + '.mp3', Buffer.from('original audio'), 'audio/mpeg');
const historicalId = crypto.randomUUID(),
  avatarId = crypto.randomUUID();
await db.put('journal-version', crypto.randomUUID(), 'fixture-owner', {
  snapshot: { assets: [{ id: historicalId }] },
});
await db.put('profile', 'fixture-owner', 'fixture-owner', { avatar: { id: avatarId } });
await source.put('journal/' + historicalId + '.jpg', Buffer.from('historical photo'), 'image/jpeg');
await source.put('uploads/' + avatarId + '.webp', Buffer.from('profile avatar'), 'image/webp');
function run(execute = false) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'scripts/migrate-storage.ts', ...(execute ? ['--execute'] : [])],
      {
        env: { ...process.env, ...fixture.env, DATABASE_URL: '', DATA_DIR: dataDir },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, output }));
  });
}
try {
  const dry = await run();
  assert.equal(dry.code, 0, dry.output);
  assert.match(dry.output, /dry-run/);
  assert.equal(fixture.requests.length, 0);
  const first = await run(true);
  assert.equal(first.code, 0, first.output);
  assert.match(first.output, /"copied": 5/);
  assert.equal(
    fixture.objects.get('contract-test/journal/' + historicalId + '.jpg')?.bytes.toString(),
    'historical photo',
  );
  assert.equal(
    fixture.objects.get('contract-test/uploads/' + avatarId + '.webp')?.bytes.toString(),
    'profile avatar',
  );
  assert.equal((await source.read(`uploads/${assetId}.webp`)).toString(), 'original image');
  assert.equal(
    fixture.objects.get(`contract-test/uploads/${assetId}.webp`)?.bytes.toString(),
    'original image',
  );
  assert.equal(
    fixture.objects.get('contract-test/audio/' + audioId + '.mp3')?.bytes.toString(),
    'original audio',
  );
  assert.equal((await source.read('audio/' + audioId + '.mp3')).toString(), 'original audio');
  const second = await run(true);
  assert.equal(second.code, 0, second.output);
  assert.match(second.output, /"skipped": 5/);
  fixture.objects.set(`contract-test/uploads/${assetId}.webp`, {
    bytes: Buffer.from('different data'),
    type: 'image/webp',
  });
  const conflict = await run(true);
  assert.notEqual(conflict.code, 0);
  assert.match(conflict.output, /refusing overwrite/);
  assert.equal((await source.read(`uploads/${assetId}.webp`)).toString(), 'original image');
  console.log(
    'PASS media migration: dry-run makes no cloud requests, verified copy, idempotent rerun, overwrite refusal and original files preserved.',
  );
} finally {
  await db.close();
  source.close();
  await fixture.close();
}
