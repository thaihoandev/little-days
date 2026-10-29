import { readFile, writeFile } from 'node:fs/promises';
try {
  await writeFile('.env.cloud', await readFile('.env.cloud.example', 'utf8'), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    'Created .env.cloud. Fill the same Neon URL and Cloudinary credentials/folder used by the cloud API.',
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Kept existing .env.cloud.');
}
console.log('Existing development .env was preserved.');
