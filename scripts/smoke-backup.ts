import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Repository } from '../apps/api/src/database.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { makeJob } from '../tests/job-fixture.js';
import { startStorageFixture } from './storage-fixture.js';

const root = path.resolve('test-results/backup-smoke', crypto.randomUUID()),
  source = path.join(root, 'source'),
  target = path.join(root, 'restored'),
  archive = path.join(root, 'archive'),
  second = path.join(root, 'cloud-archive');
const fixture = await startStorageFixture(process.env.SMOKE_STORAGE || 'cloudinary');
const sourceUrl = process.env.TEST_BACKUP_SOURCE_URL || '',
  targetUrl = process.env.TEST_BACKUP_TARGET_URL || '';
const db = new Repository({ dataDir: source, databaseUrl: sourceUrl });
await db.init();
const jobs = new JobRepository(db);
await jobs.init();
const history = new AlbumHistory(db);
await history.init();
const store = new LocalMediaStore(source);
await store.ready();
const policy = new ResourcePolicy(db, store, source);
await policy.init();
const owner = crypto.randomUUID(),
  assetId = crypto.randomUUID(),
  audioId = crypto.randomUUID(),
  token = crypto.randomUUID(),
  shareToken = crypto.randomUUID();
const job = makeJob(),
  album = { ...job.snapshot, id: job.albumId };
album.assets = [
  {
    id: assetId,
    name: 'backup.webp',
    width: 40,
    height: 40,
    bytes: 0,
    url: '/api/albums/' + album.id + '/assets/' + assetId,
  },
];
album.pages[0].elements.find((e) => e.type === 'image')!.assetId = assetId;
const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#b7c2a1' } })
  .webp()
  .toBuffer();
album.assets[0].bytes = image.length;
await db.put('album', album.id, owner, album);
await db.compareAndSwap('album', album.id, owner, 0, {
  ...album,
  revision: 1,
  title: 'Bản cần phục hồi',
});
await db.put('session', createHash('sha256').update(token).digest('hex'), owner, {
  userId: owner,
  expires: Date.now() + 3600000,
});
await db.put('share', createHash('sha256').update(shareToken).digest('hex'), owner, {
  id: createHash('sha256').update(shareToken).digest('hex'),
  albumId: album.id,
});
await db.put('audio', audioId, owner, {
  id: audioId,
  albumId: album.id,
  name: 'original.mp3',
  duration: 2,
  bytes: 10,
  url: '/api/albums/' + album.id + '/audio/' + audioId,
});
await store.put('uploads/' + assetId + '.webp', image, 'image/webp');
await store.put('audio/' + audioId + '.mp3', Buffer.from('audio bytes'), 'audio/mpeg');
job.snapshot = album;
await policy.createExport(job, owner, jobs, 15);
const lease = await jobs.claim(30000);
assert.ok(lease);
const videoKey = 'exports/' + job.id + '/' + lease.token + '.mp4';
await store.put(videoKey, Buffer.from('opaque video bytes'), 'video/mp4');
assert.ok(await jobs.complete(lease, videoKey));
await db.close();
store.close();
function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', ...args], {
      env: {
        ...process.env,
        DATABASE_URL: sourceUrl,
        STORAGE_DRIVER: 'local',
        DATA_DIR: source,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, output }));
  });
}
let api: ReturnType<typeof spawn> | undefined;
let logs = '';
try {
  const created = await run(['scripts/backup-data.ts', 'create', '--out', archive]);
  assert.equal(created.code, 0, created.output);
  const verified = await run(['scripts/backup-data.ts', 'verify', '--from', archive]);
  assert.equal(verified.code, 0, verified.output);
  const dry = await run(['scripts/backup-data.ts', 'restore', '--from', archive], {
    ...fixture.env,
    DATA_DIR: target,
    DATABASE_URL: targetUrl,
  });
  assert.equal(dry.code, 0, dry.output);
  assert.match(dry.output, /"executed": false/);
  assert.equal(fixture.requests.length, 0);
  const restored = await run(
    ['scripts/backup-data.ts', 'restore', '--from', archive, '--execute'],
    { ...fixture.env, DATA_DIR: target, DATABASE_URL: targetUrl },
  );
  assert.equal(restored.code, 0, restored.output);
  const cloud = await run(['scripts/backup-data.ts', 'create', '--out', second], {
    ...fixture.env,
    DATA_DIR: target,
    DATABASE_URL: targetUrl,
  });
  assert.equal(cloud.code, 0, cloud.output);
  assert.equal((await run(['scripts/backup-data.ts', 'verify', '--from', second])).code, 0);
  const again = await run(['scripts/backup-data.ts', 'restore', '--from', archive, '--execute'], {
    ...fixture.env,
    DATA_DIR: target,
    DATABASE_URL: targetUrl,
  });
  assert.notEqual(again.code, 0);
  assert.match(again.output, /phải trống/);
  api = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/main.ts'], {
    env: {
      ...process.env,
      ...fixture.env,
      DATABASE_URL: targetUrl,
      DATA_DIR: target,
      PORT: '4357',
      DISABLE_RENDER_WORKER: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  api.stdout!.on('data', (chunk) => (logs += String(chunk)));
  api.stderr!.on('data', (chunk) => (logs += String(chunk)));
  const base = 'http://127.0.0.1:4357/api';
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + '/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, logs);
  const get = (url: string) =>
    fetch(base + url, { headers: { Cookie: 'scrapbook_session=' + token } });
  const usage = await (await get('/usage')).json();
  assert.equal(usage.exportsLast24h, 1, 'Export budget must survive backup/restore');
  assert.ok(usage.storageBytes > 0);
  assert.equal((await (await get('/albums/' + album.id)).json()).title, 'Bản cần phục hồi');
  assert.equal(
    (await (await get('/albums/' + album.id + '/versions/0')).json()).title,
    album.title,
  );
  assert.deepEqual(
    Buffer.from(await (await get('/albums/' + album.id + '/assets/' + assetId)).arrayBuffer()),
    image,
  );
  assert.equal(
    Buffer.from(
      await (await get('/albums/' + album.id + '/audio/' + audioId)).arrayBuffer(),
    ).toString(),
    'audio bytes',
  );
  assert.equal(
    Buffer.from(await (await get('/exports/' + job.id + '/download')).arrayBuffer()).toString(),
    'opaque video bytes',
  );
  assert.equal((await fetch(base + '/shared/' + shareToken)).status, 200);
  assert.equal((await fetch(base + '/albums/' + album.id)).status, 401);
  assert.ok(fixture.requests.every((request) => request.signed));
  const manifest = JSON.parse(await readFile(path.join(second, 'manifest.json'), 'utf8'));
  await writeFile(
    path.join(root, 'result.json'),
    JSON.stringify(
      {
        status: 'passed',
        storage: fixture.driver,
        files: manifest.files.length,
        apiRestore: true,
        privateMedia: true,
        history: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS backup CLI: checksum verification, offline local→' +
      fixture.driver +
      ' restore, cloud backup, empty-target guard, sessions/share/history/private image/audio/export downloads.',
  );
} finally {
  api?.kill('SIGTERM');
  await fixture.close();
}
