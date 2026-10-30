import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
const port = 4313;
let logs = '';
const server = spawn(process.execPath, ['build/apps/api/src/main.js'], {
  env: {
    ...process.env,
    OPS_ALERT_ENABLED: 'false',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    DATABASE_URL: '',
    STORAGE_DRIVER: 'local',
    MAIL_DRIVER: 'disabled',
    DATA_DIR: path.resolve('test-results/production-db', crypto.randomUUID()),
    DISABLE_RENDER_WORKER: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => (logs += String(d)));
server.stderr.on('data', (d) => (logs += String(d)));
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, logs);
  const root = await fetch(`http://127.0.0.1:${port}`);
  assert.equal(root.status, 200);
  const html = await root.text();
  assert.match(html, /<title>Little Days\b[^<]*<\/title>/);
  const script = html.match(/src="([^"]+\.js)"/)![1];
  assert.equal((await fetch(`http://127.0.0.1:${port}${script}`)).status, 200);
  for (const asset of ['/logo.svg', '/favicon-32.png', '/apple-touch-icon.png']) {
    assert.ok(html.includes(`href="${asset}"`), 'HTML must reference ' + asset);
    const response = await fetch(`http://127.0.0.1:${port}${asset}`);
    assert.equal(response.status, 200);
    if (asset.endsWith('.svg')) {
      assert.match(response.headers.get('content-type') || '', /image\/svg\+xml/);
      assert.match(await response.text(), /<svg\b/);
    } else {
      assert.match(response.headers.get('content-type') || '', /image\/png/);
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()).subarray(0, 8),
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    }
  }
  const denied = await fetch(`http://127.0.0.1:${port}/api/albums`);
  const resources = await fetch(`http://127.0.0.1:${port}/background-removal/1.7.0/resources.json`);
  assert.equal(resources.status, 200);
  assert.match(resources.headers.get('cache-control') || '', /immutable/);
  assert.ok((await resources.json())['/models/isnet_quint8']);
  assert.equal(denied.status, 401);
  const session = await fetch(`http://127.0.0.1:${port}/api/session`);
  assert.ok(session.headers.get('set-cookie')?.includes('HttpOnly'));
  console.log(
    'PASS production: compiled NestJS server, Little Days HTML/JS, logo/favicon assets, session cookies and protected API.',
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  server.kill('SIGTERM');
}
