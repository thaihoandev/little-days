import { readFile, mkdir, writeFile } from 'node:fs/promises';
await mkdir('.secrets', { recursive: true, mode: 0o700 });
try {
  await writeFile(
    '.secrets/aiven-migration.json',
    await readFile('deploy/aiven-migration.example.json', 'utf8'),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Created .secrets/aiven-migration.json. Fill sourceUrl/targetUrl locally and save the Aiven CA as .secrets/aiven-ca.pem. Never paste credentials into chat.',
  );
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
  console.log('Preserved existing private Aiven configuration.');
}
console.log('Existing .env files were preserved.');
