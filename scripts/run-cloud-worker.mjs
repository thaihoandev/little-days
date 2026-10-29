import { access } from 'node:fs/promises';
if (!process.env.DATABASE_URL?.startsWith('postgres'))
  throw new Error(
    'Configure the cloud PostgreSQL DATABASE_URL in .env.cloud. SQLite is not shared with the hosted API.',
  );
if (
  process.env.STORAGE_DRIVER !== 'cloudinary' ||
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
)
  throw new Error('Configure Cloudinary in .env.cloud.');
if (process.env.DATABASE_URL.includes('USER:PASSWORD@HOST'))
  throw new Error('Replace the sample database URL.');
try {
  await access('build/apps/worker/src/main.js');
} catch {
  throw new Error('Run npm run build first.');
}
await import('../build/apps/worker/src/main.js');
