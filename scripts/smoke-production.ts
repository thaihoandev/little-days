import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
const port = 4313;
let logs = '';
const server = spawn(process.execPath, ['build/apps/api/src/main.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    DATA_DIR: path.resolve('test-results/production-db'),
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
  assert.match(html, /Ngày mình bên nhau/);
  const script = html.match(/src="([^"]+\.js)"/)![1];
  assert.equal((await fetch(`http://127.0.0.1:${port}${script}`)).status, 200);
  const denied = await fetch(`http://127.0.0.1:${port}/api/albums`);
  assert.equal(denied.status, 401);
  const session = await fetch(`http://127.0.0.1:${port}/api/session`);
  assert.ok(session.headers.get('set-cookie')?.includes('HttpOnly'));
  console.log(
    'PASS production: compiled NestJS server, frontend HTML/JS, session cookies and protected API.',
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  server.kill('SIGTERM');
}
