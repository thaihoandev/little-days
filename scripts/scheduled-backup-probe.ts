import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { createMediaStore } from '../apps/api/src/storage.js';
import { BackupLock, backupSafeStore } from '../apps/api/src/backup-lock.js';
import { createBackup, verifyBackup } from '../apps/api/src/backup.js';
import { unsealBackup } from '../apps/api/src/backup-encryption.js';
import { makeJob } from '../tests/job-fixture.js';

const project = process.cwd(),
  root = path.resolve('test-results/scheduled-backup', randomUUID());
await mkdir(root, { recursive: true });
const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await admin.connect();
const schema = 'qa_backup_' + randomUUID().replaceAll('-', '');
await admin.query('CREATE SCHEMA ' + schema);
const url = new URL(process.env.TEST_DATABASE_URL!);
url.searchParams.set('options', '-c search_path=' + schema);
const db = new Repository({ databaseUrl: url.toString() }),
  peer = new Repository({ databaseUrl: url.toString() }),
  store = createMediaStore(root);
const key = randomBytes(32),
  lock = new BackupLock(db);
async function run() {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--import',
      pathToFileURL(path.join(project, 'scripts/backup-health-fixture.mjs')).href,
      path.join(project, 'scripts/scheduled-backup.ts'),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        BACKUP_API_ORIGIN: 'https://backup-api.example.test',
        BACKUP_ENCRYPTION_KEY: key.toString('hex'),
        BACKUP_QA_FIXTURE: 'true',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout!.on('data', (d) => (output += String(d)));
  child.stderr!.on('data', (d) => (output += String(d)));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  return { code, output };
}
try {
  await db.init();
  await peer.init();
  await lock.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  await new AlbumHistory(db).init();
  await new AccountDeletion(db, jobs, store, root).init();
  await new ResourcePolicy(db, store, root).init();
  await store.ready();
  const owner = randomUUID(),
    audioId = randomUUID(),
    objectKey = 'audio/' + audioId + '.mp3',
    bytes = Buffer.alloc(1024 * 1024, 0xaa);
  await db.put('audio', audioId, owner, {
    id: audioId,
    albumId: randomUUID(),
    bytes: bytes.length,
  });
  await store.put(objectKey, bytes, 'audio/mpeg');
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => (entered = r)),
    gate = new Promise<void>((r) => (release = r)),
    get = store.get.bind(store);
  store.get = async (k) => {
    const object = await get(k);
    if (k === objectKey) {
      entered();
      await gate;
    }
    return object;
  };
  const token = await lock.acquire();
  const snapshot = createBackup(db, store, path.join(root, 'concurrent'), {
    online: true,
    maxBytes: 10 * 1048576,
  });
  await Promise.race([
    started,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Snapshot did not start')), 10000),
    ),
  ]);
  let deleted = false;
  const removal = backupSafeStore(peer, store)
    .remove(objectKey)
    .then(() => {
      deleted = true;
    });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(deleted, false, 'Media deletion must wait for the snapshot lock');
  release();
  await snapshot;
  await removal;
  await lock.release(token);
  store.get = get;
  await verifyBackup(path.join(root, 'concurrent'));
  assert.deepEqual(await readFile(path.join(root, 'concurrent/media', objectKey)), bytes);
  await store.put(objectKey, bytes, 'audio/mpeg');
  await db.put('account', 'account-fixture', owner, {
    email: 'private@example.test',
    password: 'fixture-hash',
  });
  const result = await run();
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /"restoreDrill":true/);
  assert.ok(!result.output.includes('private@example.test'));
  const artifact = path.join(root, 'backups/artifact/little-days-backup.enc'),
    original = await readFile(artifact);
  await unsealBackup(artifact, path.join(root, 'opened'), key);
  assert.deepEqual(await readFile(path.join(root, 'opened/media', objectKey)), bytes);
  await jobs.create(makeJob(), owner);
  const busy = await run();
  assert.equal(busy.code, 1);
  assert.equal(await lock.paused(), false);
  assert.equal(
    createHash('sha256')
      .update(await readFile(artifact))
      .digest('hex'),
    createHash('sha256').update(original).digest('hex'),
  );
  assert.deepEqual(
    (await readdir(path.join(root, 'backups'))).filter((n) => n.startsWith('job-')),
    [],
  );
  console.log(
    'PASS scheduled backup: PostgreSQL table locks fence media deletion; Cloudinary fixture → encrypted archive → verified SQLite restore; busy jobs preserve previous archive and release maintenance. No production data used.',
  );
} finally {
  store.close();
  await peer.close();
  await db.close();
  if (!/^qa_backup_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe fixture schema');
  await admin.query('DROP SCHEMA ' + schema + ' CASCADE');
  await admin.end();
}
