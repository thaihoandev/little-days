import { writeFile } from 'node:fs/promises';
export function vercelConfig(input) {
  const origin = new URL(input);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('API origin must be a bare HTTPS origin without credentials.');
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: 'vite',
    installCommand: 'npm ci',
    buildCommand: 'npm run build:web',
    outputDirectory: 'dist',
    headers: [
      {
        source: '/background-removal/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ],
    rewrites: [
      { source: '/api/:path*', destination: origin.origin + '/api/:path*' },
      { source: '/(.*)', destination: '/index.html' },
    ],
  };
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/setup-vercel.mjs')) {
  const args = process.argv.slice(2),
    index = args.indexOf('--api-origin');
  if (index < 0 || !args[index + 1])
    throw new Error('Use npm run setup:vercel -- --api-origin https://your-api.onrender.com');
  const config = vercelConfig(args[index + 1]);
  await writeFile('vercel.json', JSON.stringify(config, null, 2) + '\n', {
    flag: args.includes('--overwrite') ? 'w' : 'wx',
  });
  console.log(
    'Prepared vercel.json. Set APP_ORIGIN on the API to the final Vercel frontend HTTPS URL. No credentials belong in the frontend.',
  );
}
