import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
try {
  await writeFile(
    new URL('../.env', import.meta.url),
    template.replace(
      'POSTGRES_PASSWORD=replace-with-a-random-password',
      `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`,
    ),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Created .env. Fill CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, then run npm run dev.',
  );
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env already exists; preserved without changes.');
  else throw error;
}
