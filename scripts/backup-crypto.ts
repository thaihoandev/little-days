import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { encryptionKey, sealBackup, unsealBackup } from '../apps/api/src/backup-encryption.js';
const [command, source, output] = process.argv.slice(2);
if (command === 'key') console.log(randomBytes(32).toString('hex'));
else {
  if (!['seal', 'open'].includes(command) || !source || !output)
    throw new Error(
      'Usage: backup-crypto.ts key | seal SOURCE_DIRECTORY NEW_FILE | open FILE NEW_DIRECTORY',
    );
  const key = encryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  if (command === 'seal')
    console.log(JSON.stringify(await sealBackup(path.resolve(source), path.resolve(output), key)));
  else {
    const manifest = await unsealBackup(path.resolve(source), path.resolve(output), key);
    console.log(JSON.stringify({ verified: true, files: manifest.files.length }));
  }
}
