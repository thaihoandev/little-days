import path from 'node:path';
import { lstat, readdir, realpath, rm } from 'node:fs/promises';
import { verifyBackup } from '../apps/api/src/backup.js';
const args = process.argv.slice(2);
const value = (key: string) => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : undefined;
};
const input = value('--root');
if (!input) throw new Error('Cần --root thư mục backup.');
const root = await realpath(path.resolve(input)),
  data = path.resolve(process.env.DATA_DIR || 'data');
if (
  root === data ||
  root.startsWith(data + path.sep) ||
  data.startsWith(root + path.sep) ||
  root === path.parse(root).root
)
  throw new Error('Thư mục backup phải tách khỏi DATA_DIR và filesystem root.');
const days = Number(value('--days') || 14);
if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('days phải từ 1 đến 3650.');
let eligible = 0,
  removed = 0,
  skipped = 0;
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^auto-[a-zA-Z0-9-]+$/.test(entry.name)) continue;
  const target = path.resolve(root, entry.name),
    actual = await realpath(target);
  if (!actual.startsWith(root + path.sep) || (await lstat(target)).isSymbolicLink()) continue;
  try {
    const { manifest } = await verifyBackup(target);
    if (Date.parse(manifest.createdAt) > Date.now() - days * 86400000) continue;
    eligible++;
    if (args.includes('--execute')) {
      await rm(target, { recursive: true, force: true });
      removed++;
    }
  } catch {
    skipped++;
  }
}
console.log(
  JSON.stringify({ executed: args.includes('--execute'), eligible, removed, skipped }, null, 2),
);
