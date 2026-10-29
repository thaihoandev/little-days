import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('.secrets', { recursive: true, mode: 0o700 });
try {
  await writeFile('.secrets/ops-token', randomBytes(32).toString('hex') + '\n', {
    flag: 'wx',
    mode: 0o644,
  });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
try {
  const template = await readFile('.env.staging.example', 'utf8');
  await writeFile(
    '.env.staging',
    template.replace('replace-with-generated-hex-password', randomBytes(24).toString('hex')),
    { flag: 'wx', mode: 0o600 },
  );
  console.log('Created .env.staging. Fill domain, storage and SMTP configuration.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Kept existing .env.staging.');
}
console.log('Operator secret prepared. Existing .env and secrets were preserved.');
