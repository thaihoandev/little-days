import { createHash } from 'node:crypto';
import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import {
  LocalMediaStore,
  createMediaStore,
  ObjectNotFoundError,
  validateObjectKey,
  type MediaStore,
} from '../apps/api/src/storage.js';
import type { Album, ExportJob, AudioAsset } from '../packages/domain/index.js';
import { storageIdentity } from '../apps/api/src/storage-identity.js';

const execute = process.argv.includes('--execute');
const sourceRoot = path.resolve(process.env.DATA_DIR || 'data');
const db = new Repository();
const source = new LocalMediaStore(sourceRoot);
let target: MediaStore | undefined;
async function digest(store: MediaStore, key: string) {
  const object = await store.get(key);
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of object.stream) {
    const data = Buffer.from(chunk);
    hash.update(data);
    bytes += data.length;
  }
  return { hash: hash.digest('hex'), bytes };
}
try {
  await db.init();
  if (await db.hasTable('account_deletions'))
    if ((await db.query("SELECT owner FROM account_deletions WHERE state<>'completed'")).length)
      throw new Error('Đợi xóa tài khoản hoàn tất trước khi chuyển storage.');
  if (await db.hasTable('owner_operations'))
    if (
      (await db.query('SELECT id FROM owner_operations WHERE expires_at>?', [await db.now()]))
        .length
    )
      throw new Error('Đợi upload/email hoàn tất trước khi chuyển storage.');
  if ((await db.list<{ lastSeen: number }>('worker')).some((w) => Date.now() - w.lastSeen < 15000))
    throw new Error('Dừng worker trước khi chuyển storage.');
  const keys = new Set<string>();
  for (const album of await db.list<Album>('album'))
    for (const asset of album.assets) keys.add(`uploads/${asset.id}.webp`);
  for (const entry of await db.list<{ assets: { id: string }[] }>('journal'))
    for (const asset of entry.assets) keys.add('journal/' + asset.id + '.jpg');
  for (const audio of await db.list<AudioAsset>('audio')) keys.add('audio/' + audio.id + '.mp3');
  if (await db.hasTable('album_versions'))
    for (const row of await db.query('SELECT payload FROM album_versions'))
      for (const asset of (JSON.parse(String(row.payload)) as Album).assets)
        keys.add('uploads/' + asset.id + '.webp');
  const table = await db.query(
    db.driver === 'postgresql'
      ? "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='render_jobs'"
      : "SELECT name FROM sqlite_master WHERE type='table' AND name='render_jobs'",
  );
  const jobs = table.length
    ? await new JobRepository(db).list()
    : await db.list<ExportJob>('export');
  for (const job of jobs)
    if (job.status === 'completed') keys.add(job.outputKey || `exports/${job.id}.mp4`);
  if (jobs.some((job) => !['completed', 'failed', 'canceled'].includes(job.status)))
    throw new Error(
      'Đợi hoặc hủy tác vụ đang chạy, rồi dừng API và worker trước khi chuyển storage.',
    );
  let total = 0;
  for (const key of keys) {
    const object = await source.get(key);
    total += object.size || 0;
    object.stream.destroy();
  }
  console.log(
    JSON.stringify(
      {
        mode: execute ? 'execute' : 'dry-run',
        source: 'local',
        target: process.env.STORAGE_DRIVER === 'cloudinary' ? 'cloudinary' : 's3',
        objects: keys.size,
        bytes: total,
      },
      null,
      2,
    ),
  );
  if (!execute) {
    console.log(
      'Dry run only. No remote requests or copies. Set Cloudinary/S3 configuration, stop API/workers, then run with --execute.',
    );
  } else {
    if (!['s3', 'cloudinary'].includes(process.env.STORAGE_DRIVER || ''))
      throw new Error('STORAGE_DRIVER=cloudinary hoặc s3 is required for migration.');
    target = createMediaStore(sourceRoot);
    await target.ready();
    let copied = 0,
      skipped = 0;
    for (const key of keys) {
      const expected = await digest(source, key);
      let existing: Awaited<ReturnType<typeof digest>> | undefined;
      try {
        existing = await digest(target, key);
      } catch (error) {
        if (!(error instanceof ObjectNotFoundError)) throw error;
      }
      if (existing) {
        if (existing.hash !== expected.hash || existing.bytes !== expected.bytes)
          throw new Error(`Target object differs; refusing overwrite: ${key}`);
        skipped++;
        continue;
      }
      const file = path.resolve(sourceRoot, validateObjectKey(key));
      if (!file.startsWith(sourceRoot + path.sep))
        throw new Error('Source escapes data directory.');
      await target.putFile(
        key,
        file,
        key.endsWith('.mp4')
          ? 'video/mp4'
          : key.endsWith('.mp3')
            ? 'audio/mpeg'
            : key.endsWith('.jpg')
              ? 'image/jpeg'
              : 'image/webp',
      );
      const actual = await digest(target, key);
      if (actual.hash !== expected.hash || actual.bytes !== expected.bytes)
        throw new Error(`Checksum mismatch: ${key}`);
      copied++;
    }
    if (await db.hasTable('maintenance_locks')) {
      await db.transaction(async () => {
        await db.query(
          "INSERT INTO maintenance_locks(id,token,lease_until) VALUES('storage-identity',?,0) ON CONFLICT(id) DO UPDATE SET token=excluded.token RETURNING id",
          [storageIdentity(target!, sourceRoot)],
        );
        if (await db.hasTable('managed_media'))
          for (const row of await db.query('SELECT object_key FROM managed_media'))
            if (!keys.has(String(row.object_key)))
              await db.query('DELETE FROM managed_media WHERE object_key=? RETURNING object_key', [
                String(row.object_key),
              ]);
      });
    }
    console.log(JSON.stringify({ verified: true, copied, skipped, sourceDeleted: false }, null, 2));
  }
} finally {
  source.close();
  target?.close();
  await db.close();
}
