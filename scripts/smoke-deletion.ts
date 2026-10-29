import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { startCloudinaryFixture } from './cloudinary-fixture.js';
import { audioFixture } from '../tests/audio-fixture.js';
import { Repository } from '../apps/api/src/database.js';

const fixture = await startCloudinaryFixture(),
  root = path.resolve('test-results/deletion-api', crypto.randomUUID()),
  base = 'http://127.0.0.1:4360/api';
const env = {
  ...process.env,
  ...fixture.env,
  DATABASE_URL: '',
  DATA_DIR: root,
  PORT: '4360',
  MAIL_DRIVER: 'local',
  DISABLE_RENDER_WORKER: 'true',
  AUTH_RATE_LIMIT_PER_MINUTE: '200',
};
const server = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/main.ts'], {
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let logs = '';
server.stdout.on('data', (chunk) => (logs += String(chunk)));
server.stderr.on('data', (chunk) => (logs += String(chunk)));
function client() {
  let cookie = '';
  return async (route: string, method = 'GET', body?: unknown) => {
    const form = body instanceof FormData,
      response = await fetch(base + route, {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(!form && body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? (form ? (body as FormData) : JSON.stringify(body)) : undefined,
      });
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie')!.split(';')[0];
    return response;
  };
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + '/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, logs);
  const alice = client(),
    bob = client(),
    otherSession = client();
  const a = await (await alice('/session')).json();
  await bob('/session');
  const email = 'delete-' + crypto.randomUUID() + '@example.test',
    password = 'deletion-password-123';
  assert.equal((await alice('/auth/register', 'POST', { email, password })).status, 201);
  assert.equal(
    (
      await bob('/auth/register', 'POST', {
        email: 'other-' + crypto.randomUUID() + '@example.test',
        password: 'other-password-123',
      })
    ).status,
    201,
  );
  await otherSession('/auth/login', 'POST', { email, password });
  const album = await (await alice('/albums', 'POST', { title: 'Album cần xóa' })).json(),
    otherAlbum = await (await bob('/albums', 'POST', { title: 'Album giữ lại' })).json();
  const photo = await sharp({
    create: { width: 40, height: 40, channels: 3, background: '#b7c2a1' },
  })
    .png()
    .toBuffer();
  const form = () => {
    const data = new FormData();
    data.append('file', new Blob([photo]), 'private.png');
    return data;
  };
  const withPhoto = await (await alice('/albums/' + album.id + '/assets', 'POST', form())).json(),
    withOther = await (await bob('/albums/' + otherAlbum.id + '/assets', 'POST', form())).json();
  const music = new FormData();
  music.append('file', new Blob([audioFixture(2)]), 'private.wav');
  const audio = await (await alice('/albums/' + album.id + '/audio', 'POST', music)).json();
  const share = await (await alice('/albums/' + album.id + '/share', 'POST')).json();
  await alice('/templates', 'POST', { name: 'Mẫu sẽ xóa', page: withPhoto.pages[0] });
  const config = {
    seconds: 15,
    pageIds: [album.pages[0].id],
    opening: 'Test',
    closing: 'Done',
    musicId: 'none',
  };
  const completed = await (
    await alice('/albums/' + album.id + '/exports', 'POST', {
      expectedRevision: withPhoto.revision,
      config,
      idempotencyKey: crypto.randomUUID(),
    })
  ).json();
  const seed = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/deletion-seed.ts', a.id, completed.id],
    { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  let seeded = '',
    seedError = '';
  seed.stdout.on('data', (chunk) => (seeded += String(chunk)));
  seed.stderr.on('data', (chunk) => (seedError += String(chunk)));
  assert.equal(
    await new Promise<number | null>((resolve, reject) => {
      seed.on('exit', resolve);
      seed.on('error', reject);
    }),
    0,
    seedError,
  );
  const keys = JSON.parse(seeded.trim().split('\n').at(-1)!);
  const queued = await (
    await alice('/albums/' + album.id + '/exports', 'POST', {
      expectedRevision: withPhoto.revision,
      config,
      idempotencyKey: crypto.randomUUID(),
    })
  ).json();
  assert.equal(queued.status, 'queued');
  assert.equal(
    (
      await alice('/auth/account', 'DELETE', {
        password: 'wrong-password',
        confirmation: 'XÓA TÀI KHOẢN',
      })
    ).status,
    401,
  );
  assert.equal(
    (await alice('/auth/account', 'DELETE', { password, confirmation: 'wrong confirmation' }))
      .status,
    400,
  );
  assert.equal(
    (await bob('/auth/account', 'DELETE', { password, confirmation: 'XÓA TÀI KHOẢN', owner: a.id }))
      .status,
    401,
  );
  const response = await alice('/auth/account', 'DELETE', {
    password,
    confirmation: 'XÓA TÀI KHOẢN',
  });
  assert.equal(response.status, 202);
  const result = await response.json();
  assert.match(result.receipt, /^[a-f0-9]{64}$/);
  assert.equal((await otherSession('/albums')).status, 401);
  assert.equal((await fetch(base + '/shared/' + share.token)).status, 404);
  assert.equal((await otherSession('/auth/login', 'POST', { email, password })).status, 401);
  let status = { status: 'waiting' };
  for (let i = 0; i < 40; i++) {
    status = await (
      await alice('/auth/deletion-status', 'POST', { receipt: result.receipt })
    ).json();
    if (status.status === 'completed') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(status.status, 'completed');
  for (const key of [
    'uploads/' + withPhoto.assets[0].id + '.webp',
    'audio/' + audio.id + '.mp3',
    keys.outputKey,
    keys.orphanKey,
  ])
    assert.ok(!fixture.objects.has('contract-test/' + key), 'Owned object remains after deletion');
  assert.ok(fixture.objects.has('contract-test/uploads/' + withOther.assets[0].id + '.webp'));
  assert.equal((await bob('/albums/' + otherAlbum.id)).status, 200);
  assert.equal((await bob(withOther.assets[0].url.replace('/api', ''))).status, 200);
  const db = new Repository({ dataDir: root, databaseUrl: '' });
  await db.init();
  try {
    assert.equal((await db.query('SELECT id FROM records WHERE owner=?', [a.id])).length, 0);
    assert.equal((await db.query('SELECT id FROM render_jobs WHERE owner=?', [a.id])).length, 0);
    assert.equal(
      (await db.query('SELECT token_hash FROM auth_tokens WHERE owner=?', [a.id])).length,
      0,
    );
  } finally {
    await db.close();
  }
  for (const file of await readdir(path.join(root, 'mail')))
    assert.notEqual(JSON.parse(await readFile(path.join(root, 'mail', file), 'utf8')).to, email);
  assert.equal(
    (await alice('/auth/deletion-status', 'POST', { receipt: '0'.repeat(64) })).status,
    404,
  );
  assert.ok(fixture.requests.every((request) => request.signed));
  console.log(
    'PASS deletion API: password/confirmation, revoked sessions/share, canceled export, removed owned albums/history/templates/auth/mail/media/orphans via Cloudinary fixture, other user preserved.',
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  server.kill('SIGTERM');
  await fixture.close();
}
