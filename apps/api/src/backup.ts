import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { type Album, type AudioAsset, type ExportJob } from '../../../packages/domain/index.js';
import { Repository } from './database.js';
import { type MediaStore, ObjectNotFoundError, validateObjectKey } from './storage.js';

const tables = {
  export_events: ['job_id', 'owner', 'created_at', 'seconds'],
  records: ['kind', 'id', 'owner', 'payload', 'revision'],
  album_versions: [
    'album_id',
    'revision',
    'owner',
    'payload',
    'title',
    'page_count',
    'captured_at',
    'label',
  ],
  render_jobs: [
    'id',
    'owner',
    'album_id',
    'payload',
    'queue_state',
    'phase',
    'progress',
    'created_at',
    'available_at',
    'lease_token',
    'lease_until',
    'attempts',
    'max_attempts',
    'cancel_requested',
    'error',
    'output_key',
  ],
} as const;
type Table = keyof typeof tables;
const cell = z.union([z.string(), z.number().finite(), z.null()]);
const dumpSchema = z.object({
  format: z.literal(1),
  tables: z.object({
    export_events: z.array(z.record(z.string(), cell)).default([]),
    records: z.array(z.record(z.string(), cell)),
    album_versions: z.array(z.record(z.string(), cell)),
    render_jobs: z.array(z.record(z.string(), cell)),
  }),
});
type Dump = z.infer<typeof dumpSchema>;
const fileSchema = z.object({
  path: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const manifestSchema = z.object({
  format: z.literal(1),
  complete: z.literal(true),
  createdAt: z.string().datetime(),
  database: z.enum(['sqlite', 'postgresql']),
  storage: z.enum(['local', 's3', 'cloudinary']),
  files: z.array(fileSchema).min(1),
});
export type BackupManifest = z.infer<typeof manifestSchema>;
const terminal = new Set(['completed', 'failed', 'canceled']);
function mediaKeys(dump: Dump) {
  const keys = new Set<string>();
  for (const row of dump.tables.records) {
    if (row.kind === 'album')
      for (const asset of (JSON.parse(String(row.payload)) as Album).assets)
        keys.add('uploads/' + asset.id + '.webp');
    if (row.kind === 'journal')
      for (const asset of (JSON.parse(String(row.payload)) as Album).assets)
        keys.add('journal/' + asset.id + '.jpg');
    if (row.kind === 'journal-version')
      for (const asset of (JSON.parse(String(row.payload)) as { snapshot: Album }).snapshot.assets)
        keys.add('journal/' + asset.id + '.jpg');
    if (row.kind === 'audio')
      keys.add('audio/' + (JSON.parse(String(row.payload)) as AudioAsset).id + '.mp3');
    if (row.kind === 'profile') {
      const avatar = (JSON.parse(String(row.payload)) as { avatar?: { id: string } }).avatar;
      if (avatar) keys.add('uploads/' + avatar.id + '.webp');
    }
    if (row.kind === 'export') {
      const job = JSON.parse(String(row.payload)) as ExportJob;
      if (job.status === 'completed') keys.add(job.outputKey || 'exports/' + job.id + '.mp4');
    }
  }
  for (const row of dump.tables.album_versions)
    for (const asset of (JSON.parse(String(row.payload)) as Album).assets)
      keys.add('uploads/' + asset.id + '.webp');
  for (const row of dump.tables.render_jobs)
    if (row.queue_state === 'completed') {
      if (!row.output_key) throw new Error('Completed job thiếu output key.');
      keys.add(String(row.output_key));
    }
  for (const key of keys) validateObjectKey(key);
  return keys;
}
function validateDump(dump: Dump) {
  for (const [table, columns] of Object.entries(tables)) {
    const identities = new Set<string>();
    for (const row of dump.tables[table as Table]) {
      if (Object.keys(row).length !== columns.length || columns.some((column) => !(column in row)))
        throw new Error('Cột database không hợp lệ: ' + table);
      if ('payload' in row) JSON.parse(String(row.payload));
      const identity =
        table === 'records'
          ? JSON.stringify([row.kind, row.id])
          : table === 'album_versions'
            ? JSON.stringify([row.album_id, row.revision])
            : table === 'export_events'
              ? String(row.job_id)
              : String(row.id);
      if (identities.has(identity)) throw new Error('Bản ghi bị trùng trong backup.');
      identities.add(identity);
      if (table === 'render_jobs' && !terminal.has(String(row.queue_state)))
        throw new Error('Dừng hoặc hủy tác vụ render trước khi backup.');
      if (table === 'records' && row.kind === 'worker')
        throw new Error('Backup không được chứa trạng thái worker.');
    }
  }
  for (const row of dump.tables.records.filter((r) => r.kind === 'export'))
    if (!terminal.has((JSON.parse(String(row.payload)) as ExportJob).status))
      throw new Error('Backup chứa tác vụ render cũ chưa kết thúc.');
}
async function assertNoCleanup(db: Repository) {
  if (await db.hasTable('maintenance_locks'))
    if (
      (await db.query('SELECT id FROM maintenance_locks WHERE lease_until>?', [await db.now()]))
        .length
    )
      throw new Error('Đợi cleanup hoàn tất trước khi backup/restore.');
  const tables = await db.query(
    db.driver === 'postgresql'
      ? "SELECT table_name AS name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name IN ('account_deletions','owner_operations')"
      : "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('account_deletions','owner_operations')",
  );
  if (
    tables.some((table) => table.name === 'account_deletions') &&
    (await db.query("SELECT owner FROM account_deletions WHERE state<>'completed'")).length
  )
    throw new Error('Đợi tác vụ xóa tài khoản hoàn tất trước khi backup/restore.');
  if (
    tables.some((table) => table.name === 'owner_operations') &&
    (await db.query('SELECT id FROM owner_operations WHERE expires_at>?', [await db.now()])).length
  )
    throw new Error('Đợi upload/email đang xử lý hoàn tất trước khi backup/restore.');
}
async function assertNoWorkers(db: Repository) {
  const now = await db.now();
  if (
    (await db.list<{ lastSeen: number }>('worker')).some((worker) => now - worker.lastSeen < 15000)
  )
    throw new Error('Dừng API và worker trước khi backup/restore; đợi heartbeat cũ hết hạn.');
}
async function digestFile(file: string) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
    bytes += Buffer.byteLength(chunk);
  }
  return { bytes, sha256: hash.digest('hex') };
}
async function safeFile(root: string, relative: string) {
  validateObjectKey(relative);
  const resolved = path.resolve(root, ...relative.split('/'));
  if (!resolved.startsWith(path.resolve(root) + path.sep))
    throw new Error('File nằm ngoài thư mục backup.');
  const info = await lstat(resolved);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Backup chỉ nhận file thường.');
  const real = await realpath(resolved),
    base = await realpath(root);
  if (!real.startsWith(base + path.sep))
    throw new Error('Backup không được trỏ ra ngoài thư mục qua symlink.');
  return resolved;
}
export async function createBackup(
  db: Repository,
  store: MediaStore,
  output: string,
  options: { online?: boolean; maxBytes?: number; signal?: AbortSignal } = {},
): Promise<BackupManifest> {
  if (options.online) {
    if (db.driver !== 'postgresql') throw new Error('Online backup requires PostgreSQL.');
    return db.transaction(async () => {
      await db.query("SET LOCAL lock_timeout = '5s'");
      const names: string[] = [];
      for (const name of [
        ...Object.keys(tables),
        'maintenance_locks',
        'account_deletions',
        'owner_operations',
      ])
        if (await db.hasTable(name)) names.push(name);
      await db.query('LOCK TABLE ' + names.sort().join(',') + ' IN SHARE MODE');
      return writeBackup(db, store, output, options);
    });
  }
  await assertNoWorkers(db);
  if (await db.hasTable('backup_lease'))
    if (
      (await db.query('SELECT id FROM backup_lease WHERE lease_until>?', [await db.now()])).length
    )
      throw new Error('Another backup is active.');
  return writeBackup(db, store, output, options);
}
async function writeBackup(
  db: Repository,
  store: MediaStore,
  output: string,
  options: { maxBytes?: number; signal?: AbortSignal },
): Promise<BackupManifest> {
  await assertNoCleanup(db);
  const dump = await db.maintenanceTransaction(async () => {
    const result: Dump = {
      format: 1,
      tables: { records: [], album_versions: [], render_jobs: [], export_events: [] },
    };
    for (const [table, columns] of Object.entries(tables))
      result.tables[table as Table] = (
        (await db.hasTable(table))
          ? await db.query(
              'SELECT ' +
                columns.join(',') +
                ' FROM ' +
                table +
                (table === 'records' ? " WHERE kind<>'worker'" : ''),
            )
          : []
      ) as Dump['tables']['records'];
    return result;
  }, true);
  validateDump(dump);
  const serialized = JSON.stringify(dump);
  if (Buffer.byteLength(serialized) > 512 * 1024 * 1024)
    throw new Error('Database backup vượt giới hạn 512 MB.');
  const keys = mediaKeys(dump),
    root = path.resolve(output);
  await mkdir(path.dirname(root), { recursive: true });
  await mkdir(root); // Refuse to merge into or overwrite an existing backup.
  const database = path.join(root, 'database.json');
  await writeFile(database, serialized, { flag: 'wx', mode: 0o600 });
  const files: BackupManifest['files'] = [
    { path: 'database.json', ...(await digestFile(database)) },
  ];
  let total = Buffer.byteLength(serialized);
  if (total > (options.maxBytes ?? Number.MAX_SAFE_INTEGER))
    throw new Error('Backup byte limit exceeded.');
  for (const key of [...keys].sort()) {
    options.signal?.throwIfAborted();
    const relative = 'media/' + key,
      outputFile = path.resolve(root, ...relative.split('/'));
    if (!outputFile.startsWith(root + path.sep)) throw new Error('Media nằm ngoài backup.');
    await mkdir(path.dirname(outputFile), { recursive: true });
    const object = await store.get(key),
      hash = createHash('sha256');
    let bytes = 0;
    const meter = new Transform({
      transform(chunk, _encoding, done) {
        hash.update(chunk);
        bytes += chunk.length;
        total += chunk.length;
        if (total > (options.maxBytes ?? Number.MAX_SAFE_INTEGER)) {
          done(new Error('Backup byte limit exceeded.'));
          return;
        }
        done(null, chunk);
      },
    });
    await pipeline(
      object.stream,
      meter,
      createWriteStream(outputFile, { flags: 'wx', mode: 0o600 }),
      { signal: options.signal },
    );
    files.push({ path: relative, bytes, sha256: hash.digest('hex') });
  }
  const manifest: BackupManifest = {
    format: 1,
    complete: true,
    createdAt: new Date().toISOString(),
    database: db.driver,
    storage: store.kind,
    files,
  };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  return manifest;
}
export async function verifyBackup(source: string) {
  const root = path.resolve(source),
    manifestFile = await safeFile(root, 'manifest.json');
  if ((await stat(manifestFile)).size > 16 * 1024 * 1024) throw new Error('Manifest quá lớn.');
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestFile, 'utf8')));
  const paths = new Set<string>();
  for (const file of manifest.files) {
    if (paths.has(file.path)) throw new Error('File backup bị trùng.');
    paths.add(file.path);
    if (file.path !== 'database.json' && !file.path.startsWith('media/'))
      throw new Error('Tên file backup không hợp lệ.');
    const target = await safeFile(root, file.path),
      actual = await digestFile(target);
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256)
      throw new Error('Checksum không khớp: ' + file.path);
  }
  if (!paths.has('database.json')) throw new Error('Backup thiếu database.json.');
  const database = await safeFile(root, 'database.json');
  if ((await stat(database)).size > 512 * 1024 * 1024)
    throw new Error('Database backup vượt giới hạn 512 MB.');
  const dump = dumpSchema.parse(JSON.parse(await readFile(database, 'utf8')));
  validateDump(dump);
  const expected = new Set(['database.json', ...[...mediaKeys(dump)].map((key) => 'media/' + key)]);
  if (expected.size !== paths.size || [...expected].some((file) => !paths.has(file)))
    throw new Error('Manifest không khớp các media được database tham chiếu.');
  return { manifest, dump };
}
async function assertEmpty(db: Repository) {
  for (const table of Object.keys(tables)) {
    if (!(await db.hasTable(table))) continue;
    const where = table === 'records' ? " WHERE NOT (kind='migration' AND owner='system')" : '';
    if (Number((await db.query('SELECT COUNT(*) AS count FROM ' + table + where))[0].count))
      throw new Error(
        'Database đích phải trống. Dùng DATA_DIR hoặc DATABASE_URL mới để khôi phục.',
      );
  }
}
export async function restoreBackup(
  db: Repository,
  store: MediaStore,
  source: string,
  execute = false,
) {
  const { manifest, dump } = await verifyBackup(source);
  await assertNoWorkers(db);
  await assertNoCleanup(db);
  await assertEmpty(db);
  if (await db.hasTable('backup_lease'))
    if (
      (await db.query('SELECT id FROM backup_lease WHERE lease_until>?', [await db.now()])).length
    )
      throw new Error('Another backup is active.');
  if (!execute)
    return { executed: false, files: manifest.files.length, records: dump.tables.records.length };
  for (const file of manifest.files.filter((file) => file.path.startsWith('media/'))) {
    const key = validateObjectKey(file.path.slice(6));
    let existing = false;
    try {
      const object = await store.get(key),
        hash = createHash('sha256');
      let bytes = 0;
      for await (const chunk of object.stream) {
        hash.update(chunk);
        bytes += Buffer.byteLength(chunk);
      }
      if (bytes !== file.bytes || hash.digest('hex') !== file.sha256)
        throw new Error('Media đích khác nội dung; không ghi đè: ' + key);
      existing = true;
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
    if (!existing)
      await store.putFile(
        key,
        await safeFile(path.resolve(source), file.path),
        key.endsWith('.mp3')
          ? 'audio/mpeg'
          : key.endsWith('.mp4')
            ? 'video/mp4'
            : key.endsWith('.jpg')
              ? 'image/jpeg'
              : 'image/webp',
      );
    const object = await store.get(key),
      hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of object.stream) {
      hash.update(chunk);
      bytes += Buffer.byteLength(chunk);
    }
    if (bytes !== file.bytes || hash.digest('hex') !== file.sha256)
      throw new Error('Media đích không khớp checksum: ' + key);
  }
  await db.maintenanceTransaction(async () => {
    await assertEmpty(db);
    await db.query(
      'CREATE TABLE IF NOT EXISTS export_events(job_id TEXT PRIMARY KEY,owner TEXT NOT NULL,created_at BIGINT NOT NULL,seconds INTEGER NOT NULL)',
    );
    // Recovery links are ephemeral and never restored from a backup.
    for (const table of ['auth_tokens', 'auth_rate_limits']) {
      const exists = await db.query(
        db.driver === 'postgresql'
          ? 'SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=?'
          : "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [table],
      );
      if (exists.length)
        await db.query(
          'DELETE FROM ' +
            table +
            ' RETURNING ' +
            (table === 'auth_tokens' ? 'token_hash' : 'rate_key'),
        );
    }
    // Init markers may already exist; replace these only inside the atomic import.
    await db.query("DELETE FROM records WHERE kind='migration' AND owner='system' RETURNING id");
    for (const [table, columns] of Object.entries(tables))
      for (const row of dump.tables[table as Table])
        await db.query(
          'INSERT INTO ' +
            table +
            ' (' +
            columns.join(',') +
            ') VALUES (' +
            columns.map(() => '?').join(',') +
            ') RETURNING ' +
            columns[0],
          columns.map((column) => row[column]) as (string | number)[],
        );
  });
  return { executed: true, files: manifest.files.length, records: dump.tables.records.length };
}
