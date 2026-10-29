import path from 'node:path';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { createBackup, restoreBackup, verifyBackup } from '../apps/api/src/backup.js';
const args = process.argv.slice(2),
  index = args.indexOf('--from'),
  source = args[index + 1];
if (index < 0 || !source) throw new Error('Cần --from thư mục backup.');
const { manifest } = await verifyBackup(source);
if (!args.includes('--execute')) {
  console.log(JSON.stringify({ verified: true, files: manifest.files.length, executed: false }));
  process.exit(0);
}
const root = path.resolve('test-results/restore-drill', crypto.randomUUID()),
  target = path.join(root, 'target');
await mkdir(root, { recursive: true });
const databaseUrl = process.env.DRILL_DATABASE_URL || '';
if (databaseUrl && databaseUrl === process.env.DATABASE_URL)
  throw new Error('DRILL_DATABASE_URL phải là database trống riêng.');
const db = new Repository({ dataDir: target, databaseUrl }),
  store = new LocalMediaStore(target),
  started = performance.now();
try {
  await db.init();
  await new JobRepository(db).init();
  await new AlbumHistory(db).init();
  await store.ready();
  const result = await restoreBackup(db, store, source, true);
  const roundtrip = await createBackup(db, store, path.join(root, 'roundtrip'));
  const expected = new Map(
    manifest.files.filter((f) => f.path.startsWith('media/')).map((f) => [f.path, f.sha256]),
  );
  for (const file of roundtrip.files.filter((f) => f.path.startsWith('media/')))
    if (expected.get(file.path) !== file.sha256) throw new Error('Restore checksum mismatch.');
  if (roundtrip.files.length !== manifest.files.length)
    throw new Error('Restore file count mismatch.');
  const report = {
    ...result,
    database: db.driver,
    mediaVerified: expected.size,
    elapsedMs: Math.round(performance.now() - started),
  };
  await writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  store.close();
  await db.close();
}
