import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { startHttpMailFixture } from './http-mail-fixture.js';

const root = path.resolve('test-results/auth-api', crypto.randomUUID()),
  base = 'http://127.0.0.1:4359/api';
const driver = process.env.SMOKE_MAIL_DRIVER;
if (driver && !['brevo', 'resend'].includes(driver)) throw new Error('Invalid test mail driver');
const fixture = driver ? await startHttpMailFixture(root, driver as 'brevo' | 'resend') : undefined;
let server: ChildProcess,
  logs = '';
async function start() {
  server = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      ...(fixture ? ['--import', './scripts/http-mail-preload.mjs'] : []),
      'apps/api/src/main.ts',
    ],
    {
      env: {
        ...process.env,
        STORAGE_DRIVER: 'local',
        DATABASE_URL: '',
        DATA_DIR: root,
        PORT: '4359',
        APP_ORIGIN: 'http://127.0.0.1:5359',
        DISABLE_RENDER_WORKER: 'true',
        NODE_ENV: 'development',
        MAIL_DRIVER: driver || 'local',
        MAIL_FROM: 'Little Days <sender@example.test>',
        BREVO_API_KEY: 'fixture-brevo-api-key',
        RESEND_API_KEY: 'fixture-resend-api-key',
        MAIL_FIXTURE_ORIGIN: fixture?.origin || '',
        AUTH_RATE_LIMIT_PER_MINUTE: '200',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  server.stdout!.on('data', (chunk) => (logs += String(chunk)));
  server.stderr!.on('data', (chunk) => (logs += String(chunk)));
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + '/health')).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('API not ready: ' + logs);
}
async function stop() {
  if (server.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    server.once('exit', () => resolve());
    server.kill('SIGTERM');
  });
}
function client() {
  let cookie = '';
  return async (route: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie')!.split(';')[0];
    return response;
  };
}
async function messages() {
  return Promise.all(
    (await readdir(path.join(root, 'mail')))
      .filter((file) => file.endsWith('.json'))
      .map(
        async (file) =>
          JSON.parse(await readFile(path.join(root, 'mail', file), 'utf8')) as {
            createdAt: string;
            subject: string;
            text: string;
          },
      ),
  );
}
async function tokenFor(subject: string) {
  const mail = (await messages())
    .filter((message) => message.subject.includes(subject))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return new URLSearchParams(new URL(mail.text.match(/http[^\s]+/)![0]).hash.slice(1)).get(
    'token',
  )!;
}
try {
  await start();
  const alice = client(),
    bob = client();
  await alice('/session');
  await bob('/session');
  const album = await (await alice('/albums', { title: 'Album vẫn giữ sau reset' })).json();
  const email = 'auth-' + crypto.randomUUID() + '@example.test',
    password = 'original-password-123';
  const registered = await alice('/auth/register', { email, password });
  assert.equal(registered.status, 201);
  const account = await registered.json();
  assert.equal(account.emailVerified, false);
  assert.ok(!('token' in account));
  assert.equal((await (await alice('/albums/' + album.id)).json()).id, album.id);
  const verification = await tokenFor('Xác minh');
  assert.equal(
    (
      await alice('/auth/reset-password', {
        token: verification,
        password: 'not-valid-for-purpose',
      })
    ).status,
    400,
  );
  const verificationResponses = await Promise.all([
    alice('/auth/verify-email', { token: verification }),
    alice('/auth/verify-email', { token: verification }),
  ]);
  assert.deepEqual(verificationResponses.map((response) => response.status).sort(), [201, 400]);
  assert.equal((await (await alice('/session')).json()).emailVerified, true);
  const second = client();
  assert.equal((await second('/auth/login', { email, password })).status, 201);
  const known = await alice('/auth/request-reset', { email }),
    unknown = await bob('/auth/request-reset', { email: 'missing@example.test' });
  assert.equal(known.status, 201);
  assert.deepEqual(await known.json(), await unknown.json());
  const reset = await tokenFor('Đặt lại');
  assert.equal(
    (await bob('/auth/reset-password', { token: reset, password: 'replacement-password-123' }))
      .status,
    201,
  );
  assert.equal((await alice('/albums')).status, 401);
  assert.equal((await second('/albums')).status, 401);
  assert.equal(
    (await bob('/auth/reset-password', { token: reset, password: 'replay-password-123' })).status,
    400,
  );
  const current = client();
  assert.equal((await current('/auth/login', { email, password })).status, 401);
  assert.equal(
    (await current('/auth/login', { email, password: 'replacement-password-123' })).status,
    201,
  );
  const other = client();
  assert.equal(
    (await other('/auth/login', { email, password: 'replacement-password-123' })).status,
    201,
  );
  await current('/auth/request-reset', { email });
  const pending = await tokenFor('Đặt lại');
  assert.equal(
    (
      await current('/auth/change-password', {
        currentPassword: 'wrong-password-123',
        newPassword: 'changed-password-123',
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await current('/auth/change-password', {
        currentPassword: 'replacement-password-123',
        newPassword: 'changed-password-123',
      })
    ).status,
    201,
  );
  assert.equal((await current('/albums/' + album.id)).status, 200);
  assert.equal((await other('/albums')).status, 401);
  assert.equal(
    (await bob('/auth/reset-password', { token: pending, password: 'stale-password-123' })).status,
    400,
  );
  assert.equal((await current('/auth/request-reset', { email })).status, 201);
  const persisted = await tokenFor('Đặt lại');
  await stop();
  await start();
  assert.equal(
    (await bob('/auth/reset-password', { token: persisted, password: 'after-restart-password' }))
      .status,
    201,
  );
  assert.equal(
    (await current('/auth/request-reset', { email })).status,
    429,
    'Email rate limit must survive restart',
  );
  const final = client();
  assert.equal(
    (await final('/auth/login', { email, password: 'after-restart-password' })).status,
    201,
  );
  assert.equal((await final('/albums/' + album.id)).status, 200);
  console.log(
    'PASS auth API (' +
      (driver || 'local mail') +
      '): guest ownership preserved, verification/reset single use, generic recovery response, changed credentials, session revocation, durable tokens/rate limit across restart.',
  );
  if (fixture) assert.ok(fixture.accepted >= 4);
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await stop();
  await fixture?.close();
}
