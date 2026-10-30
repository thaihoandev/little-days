// Explicit test preload. Production workflow never imports this file.
if (process.env.BACKUP_QA_FIXTURE !== 'true')
  throw new Error('Backup test preload requires a fixture process.');
const originalFetch = globalThis.fetch;
const cloudinaryOrigin = new URL(process.env.CLOUDINARY_API_BASE_URL || '');
if (cloudinaryOrigin.protocol !== 'http:' || cloudinaryOrigin.hostname !== '127.0.0.1')
  throw new Error('Backup fixture must use loopback Cloudinary.');
globalThis.fetch = async (url, options) => {
  if (new URL(String(url)).origin === cloudinaryOrigin.origin) return originalFetch(url, options);
  if (String(url) !== 'https://backup-api.example.test/api/health')
    throw new Error('Unexpected network destination in backup fixture.');
  return new Response(JSON.stringify({ backupProtocol: 1 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
