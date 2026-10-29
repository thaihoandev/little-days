import test from 'node:test';
import assert from 'node:assert/strict';
import { vercelConfig } from '../scripts/setup-vercel.mjs';
test('Vercel static frontend proxies API before SPA fallback and never embeds credentials', () => {
  const config = vercelConfig('https://example-api.onrender.com');
  assert.equal(config.buildCommand, 'npm run build:web');
  assert.equal(config.outputDirectory, 'dist');
  assert.deepEqual(config.rewrites[0], {
    source: '/api/:path*',
    destination: 'https://example-api.onrender.com/api/:path*',
  });
  assert.equal(config.rewrites[1].destination, '/index.html');
  for (const value of [
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com/path',
    'https://example.com?token=secret',
  ])
    assert.throws(() => vercelConfig(value));
});
