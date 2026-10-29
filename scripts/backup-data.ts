import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { createMediaStore } from '../apps/api/src/storage.js';
import { createBackup, restoreBackup, verifyBackup } from '../apps/api/src/backup.js';

const args = process.argv.slice(2),
  command = args[0];
function argument(name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error('Thiếu giá trị ' + name);
  return value;
}
if (!['create', 'verify', 'restore'].includes(command))
  throw new Error(
    'Dùng create [--out folder], verify --from folder, hoặc restore --from folder [--execute].',
  );
const dataDir = path.resolve(process.env.DATA_DIR || 'data');
if (command === 'verify') {
  const source = argument('--from');
  if (!source) throw new Error('Cần --from folder.');
  const { manifest } = await verifyBackup(source);
  console.log(
    JSON.stringify(
      { verified: true, files: manifest.files.length, createdAt: manifest.createdAt },
      null,
      2,
    ),
  );
} else {
  const source = argument('--from');
  if (command === 'restore' && !source) throw new Error('Cần --from folder.');
  if (source) await verifyBackup(source);
  const db = new Repository(),
    store = createMediaStore(dataDir);
  try {
    await db.init();
    await new JobRepository(db).init();
    await new AlbumHistory(db).init();
    if (command === 'create') {
      const output = path.resolve(
        argument('--out') ||
          path.join(
            'backups',
            new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8),
          ),
      );
      if (output === dataDir || output.startsWith(dataDir + path.sep))
        throw new Error('Đặt backup ngoài DATA_DIR.');
      await store.ready();
      const manifest = await createBackup(db, store, output);
      console.log(
        JSON.stringify(
          {
            created: true,
            output,
            files: manifest.files.length,
            bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
          },
          null,
          2,
        ),
      );
    } else {
      const execute = args.includes('--execute');
      if (execute) await store.ready();
      console.log(JSON.stringify(await restoreBackup(db, store, source!, execute), null, 2));
    }
  } finally {
    store.close();
    await db.close();
  }
}
