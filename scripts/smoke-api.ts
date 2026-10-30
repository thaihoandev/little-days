import { audioFixture } from '../tests/audio-fixture.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import { type Album } from '../packages/domain/index.js';
import { startStorageFixture } from './storage-fixture.js';
const fixture = ['s3', 'cloudinary'].includes(process.env.SMOKE_STORAGE || '')
  ? await startStorageFixture()
  : undefined;
const port = 4311;
let logs = '';
const server = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/main.ts'], {
  env: {
    ...process.env,
    OPS_ALERT_ENABLED: 'false',
    DATABASE_URL: process.env.TEST_DATABASE_URL || '',
    STORAGE_DRIVER: 'local',
    ...fixture?.env,
    PORT: String(port),
    DATA_DIR: path.resolve('test-results/api-db', crypto.randomUUID()),
    DISABLE_RENDER_WORKER: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (data) => (logs += String(data)));
server.stderr.on('data', (data) => (logs += String(data)));
const base = `http://127.0.0.1:${port}/api`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
function client() {
  let cookie = '';
  return async (route: string, method = 'GET', body?: unknown) => {
    const form = body instanceof FormData;
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(!form && body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? (form ? (body as FormData) : JSON.stringify(body)) : undefined,
    });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return response;
  };
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await pause(250);
  }
  assert.ok(ready, logs);
  const alice = client(),
    bob = client();
  assert.equal((await alice('/albums')).status, 401);
  await alice('/session');
  await bob('/session');
  assert.equal((await (await alice('/render-capacity')).json()).available, false);
  const album: Album = await (await alice('/albums', 'POST', { title: 'Kiểm tra API' })).json();
  const unavailableMusic = await alice('/albums/' + album.id + '/exports', 'POST', {
    expectedRevision: album.revision,
    idempotencyKey: crypto.randomUUID(),
    config: {
      seconds: 15,
      pageIds: [album.pages[0].id],
      opening: 'Ngày của mình',
      closing: 'Hẹn ngày mai',
      musicId: 'warm-piano',
    },
  });
  assert.equal(unavailableMusic.status, 503, 'New music must wait for a compatible worker');
  assert.match((await unavailableMusic.json()).message, /nhạc này chưa sẵn sàng/);
  assert.equal((await bob(`/albums/${album.id}`)).status, 404);
  assert.equal((await bob('/albums/' + album.id + '/versions')).status, 404);
  assert.equal((await bob('/albums/' + album.id + '/versions/0')).status, 404);
  assert.equal(
    (
      await bob('/albums/' + album.id + '/versions', 'POST', {
        expectedRevision: 0,
        label: 'Other owner',
      })
    ).status,
    404,
  );
  assert.equal(
    (await bob('/albums/' + album.id + '/versions/0/restore', 'POST', { expectedRevision: 0 }))
      .status,
    404,
  );
  const templateResponse = await alice('/templates', 'POST', {
    name: 'Mẫu riêng',
    page: album.pages[0],
  });
  assert.equal(templateResponse.status, 201);
  const template = await templateResponse.json();
  assert.ok(template.page.elements.every((e: { assetId: string | null }) => e.assetId === null));
  assert.equal((await (await bob('/templates')).json()).length, 0);
  assert.equal((await bob('/templates/' + template.id, 'DELETE')).status, 404);
  assert.ok(
    (await (await alice('/templates')).json()).some((t: { id: string }) => t.id === template.id),
  );
  assert.equal(
    (await alice('/templates', 'POST', { name: ' ', page: album.pages[0] })).status,
    400,
  );
  assert.equal((await alice('/templates/' + template.id, 'DELETE')).status, 200);
  const { id, revision, assets, createdAt, updatedAt, schemaVersion, ...content } = album;
  const journalContent = {
    title: 'Ngày riêng của Alice',
    date: '2026-10-30',
    note: 'Một lời nhắn',
    kind: 'memory',
    annual: true,
  };
  let journal = await (await alice('/journal', 'POST', journalContent)).json();
  assert.equal(
    (await bob('/journal/' + journal.id, 'PATCH', { expectedRevision: 0, content: journalContent }))
      .status,
    404,
  );
  const journalPhoto = await sharp({
      create: { width: 35, height: 25, channels: 3, background: '#c1b99a' },
    })
      .png()
      .toBuffer(),
    journalForm = new FormData();
  journalForm.append('file', new Blob([journalPhoto]), 'day.png');
  journal = await (await alice('/journal/' + journal.id + '/assets', 'POST', journalForm)).json();
  assert.equal(
    (await alice(journal.assets[0].url.replace('/api', ''))).headers
      .get('content-type')
      ?.split(';')[0],
    'image/jpeg',
  );
  assert.equal((await bob(journal.assets[0].url.replace('/api', ''))).status, 404);
  assert.equal(
    (
      await alice('/journal/' + journal.id, 'PATCH', {
        expectedRevision: 0,
        content: journalContent,
      })
    ).status,
    409,
  );
  assert.equal(
    (await alice('/journal/' + journal.id, 'DELETE', { expectedRevision: journal.revision }))
      .status,
    200,
  );
  const updated: Album = await (
    await alice(`/albums/${id}`, 'PATCH', {
      expectedRevision: revision,
      content: { ...content, title: 'Đã lưu thật' },
    })
  ).json();
  assert.equal(updated.revision, 1);
  const versions = await (await alice('/albums/' + id + '/versions')).json();
  assert.equal(versions.versions[0].revision, 0);
  assert.equal((await (await alice('/albums/' + id + '/versions/0')).json()).title, album.title);
  assert.equal(
    (
      await alice('/albums/' + id + '/versions', 'POST', {
        expectedRevision: 1,
        label: 'Bản quan trọng',
      })
    ).status,
    201,
  );
  assert.equal(
    (await alice('/albums/' + id + '/versions/0/restore', 'POST', { expectedRevision: 0 })).status,
    409,
  );

  assert.equal(
    (await alice(`/albums/${id}`, 'PATCH', { expectedRevision: 0, content })).status,
    409,
  );
  assert.equal(
    (
      await alice(`/albums/${id}`, 'PATCH', {
        expectedRevision: 1,
        content: { ...content, startDate: '2025-02-29' },
      })
    ).status,
    400,
  );
  const png = await sharp({
    create: { width: 600, height: 450, channels: 3, background: '#b6bd9a' },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append('file', new Blob([png]), 'photo.png');
  const uploaded: Album = await (await alice(`/albums/${id}/assets`, 'POST', form)).json();
  assert.equal(uploaded.assets.length, 1);
  assert.equal((await alice(uploaded.assets[0].url.replace('/api', ''))).status, 200);
  assert.equal((await bob(uploaded.assets[0].url.replace('/api', ''))).status, 404);
  const bad = new FormData();
  bad.append('file', new Blob(['not an image'], { type: 'image/png' }), 'fake.png');
  assert.equal((await alice(`/albums/${id}/assets`, 'POST', bad)).status, 400);
  const audioForm = new FormData();
  audioForm.append('file', new Blob([audioFixture()]), 'tone.wav');
  const audioResponse = await alice('/albums/' + id + '/audio', 'POST', audioForm);
  assert.equal(audioResponse.status, 201);
  const audio = await audioResponse.json();
  assert.ok(audio.duration >= 7.9 && audio.duration <= 8.1);
  assert.equal((await bob(audio.url.replace('/api', ''))).status, 404);
  assert.equal((await bob('/albums/' + id + '/audio')).status, 404);
  assert.ok(
    (await (await alice('/albums/' + id + '/audio')).json()).some(
      (a: { id: string }) => a.id === audio.id,
    ),
  );
  assert.equal(
    (await alice(audio.url.replace('/api', ''))).headers.get('content-type'),
    'audio/mpeg',
  );
  const fakeAudio = new FormData();
  fakeAudio.append('file', new Blob(['not music'], { type: 'audio/mpeg' }), 'fake.mp3');
  assert.equal((await alice('/albums/' + id + '/audio', 'POST', fakeAudio)).status, 400);
  const shared = await (await alice(`/albums/${id}/share`, 'POST')).json();
  assert.equal((await bob(`/shared/${shared.token}`)).status, 200);
  await alice(`/albums/${id}/share`, 'DELETE');
  assert.equal((await bob(`/shared/${shared.token}`)).status, 404);
  const email = `smoke-${crypto.randomUUID()}@example.test`,
    password = 'a-long-test-password';
  assert.equal((await alice('/auth/register', 'POST', { email, password })).status, 201);
  const login = client();
  assert.equal((await login('/auth/login', 'POST', { email, password })).status, 201);
  assert.equal((await login(`/albums/${id}`)).status, 200);
  assert.equal(
    (await login('/auth/login', 'POST', { email, password: 'wrong-password' })).status,
    401,
  );
  const idem = crypto.randomUUID();
  const config = {
    seconds: 15,
    pageIds: [uploaded.pages[0].id],
    opening: 'API test',
    closing: 'Done',
    musicId: 'custom',
    audioId: audio.id,
    audioStart: 2,
    audioEnd: 4,
    audioLoop: true,
    audioVolume: 0.5,
    sceneDurations: { [uploaded.pages[0].id]: 3 },
  };
  assert.equal(
    (
      await alice('/albums/' + id + '/exports', 'POST', {
        expectedRevision: uploaded.revision,
        config: { ...config, audioEnd: 99 },
        idempotencyKey: crypto.randomUUID(),
      })
    ).status,
    400,
  );
  const other: Album = await (await alice('/albums', 'POST', { title: 'Album khác' })).json();
  assert.equal(
    (
      await alice('/albums/' + other.id + '/exports', 'POST', {
        expectedRevision: other.revision,
        config: {
          ...config,
          pageIds: [other.pages[0].id],
          sceneDurations: { [other.pages[0].id]: 3 },
        },
        idempotencyKey: crypto.randomUUID(),
      })
    ).status,
    404,
  );
  assert.equal((await bob('/albums/' + id + '/video-settings')).status, 404);
  assert.equal((await bob('/albums/' + id + '/video-settings', 'PATCH', config)).status, 404);
  assert.equal((await alice('/albums/' + id + '/video-settings', 'PATCH', config)).status, 200);
  assert.equal(
    (await (await alice('/albums/' + id + '/video-settings')).json()).config.audioId,
    audio.id,
  );
  const job = await (
    await alice(`/albums/${id}/exports`, 'POST', {
      expectedRevision: uploaded.revision,
      config,
      idempotencyKey: idem,
    })
  ).json();
  assert.equal(job.status, 'queued');
  assert.equal('snapshot' in job, false);
  assert.equal('outputKey' in job, false);
  assert.equal('audioAsset' in job, false);
  assert.equal((await alice('/albums/' + id + '/audio/' + audio.id, 'DELETE')).status, 409);
  const retry = await (
    await alice(`/albums/${id}/exports`, 'POST', {
      expectedRevision: uploaded.revision,
      config,
      idempotencyKey: idem,
    })
  ).json();
  assert.equal(retry.id, idem);
  assert.equal((await bob(`/exports/${idem}`)).status, 404);
  await alice(`/exports/${idem}/cancel`, 'POST');
  assert.equal((await (await alice(`/exports/${idem}`)).json()).status, 'canceled');
  assert.equal((await alice('/albums/' + id + '/audio/' + audio.id, 'DELETE')).status, 200);
  assert.equal((await alice(audio.url.replace('/api', ''))).status, 404);
  assert.equal(
    (await (await alice('/albums/' + id + '/video-settings')).json()).config.musicId,
    'none',
  );
  const current: Album = await (await alice('/albums/' + id)).json();
  const restoredResponse = await alice('/albums/' + id + '/versions/0/restore', 'POST', {
    expectedRevision: current.revision,
  });
  assert.equal(restoredResponse.status, 201);
  const restored: Album = await restoredResponse.json();
  assert.equal(restored.title, album.title);
  assert.equal(restored.assets.length, uploaded.assets.length);
  assert.equal(restored.revision, current.revision + 1);
  assert.equal(
    (await (await alice('/albums/' + id + '/versions/' + current.revision)).json()).revision,
    current.revision,
  );
  assert.equal((await alice(`/albums/${id}`, 'DELETE')).status, 200);
  assert.equal((await alice(`/albums/${id}`)).status, 404);
  console.log(
    'PASS API: sessions, ownership, registration/login, revision conflicts, image processing, private assets/audio, saved video settings, version checkpoints/restore, share revocation, durable export queue, idempotency, cancellation, deletion.',
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  server.kill('SIGTERM');
  await fixture?.close();
}
