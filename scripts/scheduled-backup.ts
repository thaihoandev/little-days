import path from 'node:path';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { Repository } from '../apps/api/src/database.js';
import { BackupLock } from '../apps/api/src/backup-lock.js';
import { createBackup, restoreBackup } from '../apps/api/src/backup.js';
import { encryptionKey, sealBackup, unsealBackup } from '../apps/api/src/backup-encryption.js';
import { createMediaStore, LocalMediaStore } from '../apps/api/src/storage.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { storageIdentity } from '../apps/api/src/storage-identity.js';

// This job intentionally never reads .env or accepts production restore targets.
const key = encryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
if (!process.env.DATABASE_URL || process.env.STORAGE_DRIVER !== 'cloudinary')
  throw new Error('Scheduled backup requires PostgreSQL and Cloudinary.');
const origin = new URL(process.env.BACKUP_API_ORIGIN || '');
if (!process.env.CLOUDINARY_FOLDER)
  throw new Error('Configure the exact Cloudinary folder used by the API.');
if (origin.protocol !== 'https:' || origin.username || origin.password)
  throw new Error('Configure the HTTPS API origin.');
const ready = await fetch(new URL('/api/health', origin), {
  redirect: 'error',
  signal: AbortSignal.timeout(60000),
});
if (!ready.ok || (await ready.json()).backupProtocol !== 1)
  throw new Error('Deploy the backup-aware API before enabling the schedule.');
const base = path.resolve('backups');
await mkdir(base, { recursive: true });
const workspace = await mkdtemp(path.join(base, 'job-'));
const db = new Repository(),
  store = createMediaStore(workspace),
  controller = new AbortController();
let token: string | undefined, timer: ReturnType<typeof setInterval> | undefined;
const lock = new BackupLock(db);
let stage = 'configuration';
try {
  await db.init();
  await lock.init();
  await store.ready();
  const identity = (
    await db.query("SELECT token FROM maintenance_locks WHERE id='storage-identity'")
  )[0];
  if (!identity || String(identity.token) !== storageIdentity(store, workspace))
    throw new Error('Backup storage target does not match the database.');
  const workers = await db.list<{ lastSeen: number; backupProtocol?: number }>('worker'),
    now = await db.now();
  if (workers.some((w) => now - w.lastSeen < 15000 && w.backupProtocol !== 1))
    throw new Error('Update or stop the existing worker before backing up.');
  token = await lock.acquire();
  stage = 'snapshot';
  timer = setInterval(
    () =>
      void lock
        .renew(token!)
        .then((ok) => {
          if (!ok) controller.abort();
        })
        .catch(() => controller.abort()),
    20000,
  );
  const snapshot = path.join(workspace, 'snapshot');
  const manifest = await createBackup(db, store, snapshot, {
    online: true,
    maxBytes: 100 * 1048576,
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10 * 60000)]),
  });
  if (!(await lock.renew(token))) throw new Error('Backup lease expired.');
  await lock.release(token);
  token = undefined;
  clearInterval(timer);
  timer = undefined;
  const archive = path.join(workspace, 'little-days-backup.enc');
  stage = 'encryption';
  const sealed = await sealBackup(snapshot, archive, key);
  const verified = path.join(workspace, 'verified');
  await unsealBackup(archive, verified, key, 100 * 1048576 + 1048576);
  const target = path.join(workspace, 'restore-drill'),
    drill = new Repository({ dataDir: target, databaseUrl: '' }),
    local = new LocalMediaStore(target);
  try {
    stage = 'restore-drill';
    await drill.init();
    await new JobRepository(drill).init();
    await new AlbumHistory(drill).init();
    await local.ready();
    await restoreBackup(drill, local, verified, true);
    const roundtrip = await createBackup(drill, local, path.join(workspace, 'roundtrip'));
    stage = 'compare';
    const media = (m: typeof manifest) =>
      m.files
        .filter((f) => f.path.startsWith('media/'))
        .map((f) => f.path + ':' + f.bytes + ':' + f.sha256)
        .sort();
    if (JSON.stringify(media(manifest)) !== JSON.stringify(media(roundtrip)))
      throw new Error('Restore media checksum mismatch.');
    const normalized = (dump: { tables: Record<string, Record<string, unknown>[]> }) =>
      JSON.stringify(
        Object.entries(dump.tables)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([table, rows]) => [
            table,
            rows
              .map((row) =>
                JSON.stringify(
                  Object.entries(row)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([k, v]) => [k, v === null ? null : String(v)]),
                ),
              )
              .sort(),
          ]),
      );
    if (
      normalized(JSON.parse(await readFile(path.join(snapshot, 'database.json'), 'utf8'))) !==
      normalized(
        JSON.parse(await readFile(path.join(workspace, 'roundtrip/database.json'), 'utf8')),
      )
    )
      throw new Error('Restore database mismatch.');
  } finally {
    local.close();
    await drill.close();
  }
  await mkdir(path.join(base, 'artifact'), { recursive: true });
  stage = 'publish';
  const { copyFile, constants } = await import('node:fs/promises');
  await copyFile(
    archive,
    path.join(base, 'artifact/little-days-backup.enc'),
    constants.COPYFILE_EXCL,
  );
  console.log(
    JSON.stringify({
      verified: true,
      restoreDrill: true,
      files: sealed.files,
      encryptedBytes: sealed.bytes,
    }),
  );
} catch {
  console.error(JSON.stringify({ event: 'scheduled_backup_failed', stage }));
  console.error(
    'Scheduled backup failed or is busy. No verified artifact was published. Check configuration and active jobs/cleanup.',
  );
  process.exitCode = 1;
} finally {
  if (timer) clearInterval(timer);
  if (token) await lock.release(token).catch(() => {});
  store.close();
  await db.close();
  const resolved = path.resolve(workspace);
  if (!resolved.startsWith(base + path.sep)) throw new Error('Unsafe backup workspace.');
  await rm(resolved, { recursive: true, force: true });
}
