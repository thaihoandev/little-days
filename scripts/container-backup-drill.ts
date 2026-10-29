import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { createMediaStore, LocalMediaStore } from '../apps/api/src/storage.js';
import { createBackup, restoreBackup, verifyBackup } from '../apps/api/src/backup.js';
if (process.env.QA_FIXTURE !== 'true') throw new Error('Only for an isolated QA container.');
const root = await mkdtemp(path.join(tmpdir(), 'little-days-drill-')),
  db = new Repository(),
  store = createMediaStore(process.env.DATA_DIR || '/app/data');
const target = new Repository({ databaseUrl: '', dataDir: path.join(root, 'restored') }),
  restored = new LocalMediaStore(path.join(root, 'restored'));
try {
  await db.init();
  const manifest = await createBackup(db, store, path.join(root, 'archive'));
  await verifyBackup(path.join(root, 'archive'));
  await target.init();
  await new JobRepository(target).init();
  await new AlbumHistory(target).init();
  await restored.ready();
  await restoreBackup(target, restored, path.join(root, 'archive'), true);
  const second = await createBackup(target, restored, path.join(root, 'roundtrip'));
  const expected = manifest.files
    .filter((f) => f.path.startsWith('media/'))
    .map((f) => f.sha256)
    .sort();
  if (
    JSON.stringify(expected) !==
    JSON.stringify(
      second.files
        .filter((f) => f.path.startsWith('media/'))
        .map((f) => f.sha256)
        .sort(),
    )
  )
    throw new Error('Container restore mismatch');
  console.log(
    'PASS container backup/restore: ' +
      expected.length +
      ' media verified from PostgreSQL to isolated SQLite.',
  );
} finally {
  await db.close();
  await target.close();
  store.close();
  restored.close();
}
