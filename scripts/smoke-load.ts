import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { startStorageFixture } from './storage-fixture.js';
import type { Album, JobView } from '../packages/domain/index.js';

const fixture = await startStorageFixture('cloudinary'),
  root = path.resolve('test-results/load', crypto.randomUUID());
await mkdir(root, { recursive: true });
const origin = 'http://127.0.0.1:4371',
  base = origin + '/api',
  token = randomBytes(32).toString('hex');
const env = {
  ...process.env,
  OPS_ALERT_ENABLED: 'false',
  ...fixture.env,
  DATABASE_URL: process.env.TEST_DATABASE_URL || '',
  DATA_DIR: root,
  PORT: '4371',
  HOST: '127.0.0.1',
  APP_ORIGIN: origin,
  MAIL_DRIVER: 'local',
  NODE_ENV: 'development',
  OPS_TOKEN: token,
  OPS_TOKEN_FILE: '',
  RENDER_WORKER_MODE: 'external',
  DISABLE_RENDER_WORKER: 'true',
  RENDER_POLL_MS: '200',
  QUOTA_STORAGE_MB: '1',
  QUOTA_EXPORTS_PER_DAY: '2',
  AUTH_RATE_LIMIT_PER_MINUTE: '200',
  MAINTENANCE_ENABLED: 'false',
};
const processes: ChildProcess[] = [],
  logs: string[] = [];
function start(file: string) {
  let output = '';
  const child = spawn(process.execPath, ['--import', 'tsx', file], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout!.on('data', (d) => {
    output += String(d);
  });
  child.stderr!.on('data', (d) => {
    output += String(d);
  });
  child.on('exit', () => logs.push(output));
  processes.push(child);
  return child;
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(check: () => Promise<boolean>, message: string, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await check()) return;
    } catch {}
    await pause(250);
  }
  throw new Error(message);
}
function client() {
  let cookie = '';
  return async (route: string, method = 'GET', body?: unknown) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        Cookie: cookie,
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie')!.split(';')[0];
    return response;
  };
}
const samples: number[] = [];
let elapsedMs = 0;
try {
  start('apps/api/src/main.ts');
  await wait(async () => (await fetch(base + '/health/ready')).ok, 'API unavailable');
  assert.equal((await fetch(base + '/ops/metrics')).status, 404);
  assert.equal(
    (await fetch(base + '/ops/metrics', { headers: { Authorization: 'Bearer wrong' } })).status,
    404,
  );
  const ops = () => fetch(base + '/ops/status', { headers: { Authorization: 'Bearer ' + token } });
  const users = Array.from({ length: 3 }, client),
    albums: Album[] = [];
  for (const [i, user] of users.entries()) {
    await user('/session');
    assert.equal(
      (
        await user('/auth/register', 'POST', {
          email: crypto.randomUUID() + '@example.test',
          password: 'load-fixture-password',
        })
      ).status,
      201,
    );
    const response = await user('/albums', 'POST', { title: 'Load fixture ' + i });
    assert.equal(response.status, 201);
    albums.push(await response.json());
  }
  const huge = await sharp(randomBytes(2000 * 1600 * 3), {
      raw: { width: 2000, height: 1600, channels: 3 },
    })
      .png()
      .toBuffer(),
    form = new FormData();
  form.append('file', new Blob([huge]), 'large-fixture.png');
  assert.equal((await users[0]('/albums/' + albums[0].id + '/assets', 'POST', form)).status, 413);
  assert.equal((await (await users[0]('/usage')).json()).storageBytes, 0);
  const ids: string[] = [];
  for (const [i, user] of users.entries()) {
    const album = albums[i],
      id = crypto.randomUUID(),
      config = {
        seconds: 15,
        pageIds: [album.pages[0].id],
        opening: 'Ngày mình bên nhau',
        closing: 'Còn nhiều ngày đẹp nữa',
        musicId: 'none',
        sceneDurations: { [album.pages[0].id]: 1 },
      };
    const input = { expectedRevision: album.revision, idempotencyKey: id, config };
    assert.equal((await user('/albums/' + album.id + '/exports', 'POST', input)).status, 201);
    assert.equal((await user('/albums/' + album.id + '/exports', 'POST', input)).status, 201);
    assert.equal((await (await user('/usage')).json()).exportsLast24h, 1);
    ids.push(id);
  }
  assert.equal(
    (await (await ops()).json()).jobs.queued,
    3,
    'Three users must queue without a worker',
  );
  assert.equal((await users[1]('/exports/' + ids[0])).status, 404);
  start('apps/worker/src/main.ts');
  const started = performance.now();
  await wait(
    async () => {
      await Promise.all(
        Array.from({ length: 12 }, async (_, i) => {
          const before = performance.now(),
            r = await users[i % 3]('/albums');
          assert.equal(r.status, 200);
          assert.ok(r.headers.get('x-request-id'));
          samples.push(performance.now() - before);
        }),
      );
      const states = await Promise.all(
        ids.map(async (id, i) => (await (await users[i]('/exports/' + id)).json()) as JobView),
      );
      if (states.some((s) => s.status === 'failed' || s.status === 'canceled'))
        throw new Error('A load export failed');
      return states.every((s) => s.status === 'completed');
    },
    'Three renders failed to complete',
    300000,
  );
  elapsedMs = Math.round(performance.now() - started);
  for (const [i, id] of ids.entries()) {
    const response = await users[i]('/exports/' + id + '/download');
    assert.equal(response.status, 200);
    const video = Buffer.from(await response.arrayBuffer());
    assert.equal(video.toString('ascii', 4, 8), 'ftyp');
    await writeFile(path.join(root, `recap-${i + 1}.mp4`), video);
  }
  await wait(
    async () => (await (await ops()).json()).renders.count === 3,
    'Missing worker measurements',
  );
  const stats = await (await ops()).json(),
    sorted = samples.sort((a, b) => a - b),
    p95 = Math.round(sorted[Math.floor(sorted.length * 0.95)]);
  assert.ok(p95 < 5000, 'API p95 exceeds five seconds under a small render load');
  const metrics = await fetch(base + '/ops/metrics', {
    headers: { Authorization: 'Bearer ' + token },
  });
  assert.equal(metrics.status, 200);
  assert.match(await metrics.text(), /scrapbook_workers_live 1/);
  const album = albums[0],
    input = {
      expectedRevision: album.revision,
      idempotencyKey: crypto.randomUUID(),
      config: {
        seconds: 15,
        pageIds: [album.pages[0].id],
        opening: 'Test',
        closing: 'Test',
        musicId: 'none',
      },
    };
  assert.equal((await users[0]('/albums/' + album.id + '/exports', 'POST', input)).status, 201);
  await users[0]('/exports/' + input.idempotencyKey + '/cancel', 'POST');
  assert.equal(
    (
      await users[0]('/albums/' + album.id + '/exports', 'POST', {
        ...input,
        idempotencyKey: crypto.randomUUID(),
      })
    ).status,
    429,
  );
  const report = {
    status: 'passed',
    database: env.DATABASE_URL ? 'postgresql' : 'sqlite',
    storage: 'Cloudinary HTTP fixture',
    users: 3,
    queuedTogether: 3,
    workers: 1,
    renderSecondsPerVideo: 6,
    totalElapsedMs: elapsedMs,
    requestCount: samples.length,
    apiP95Ms: p95,
    renders: stats.renders,
    limits: '1 MB / 2 exports per rolling 24h',
    notes:
      'Node RSS and CPU exclude Chromium/ffmpeg processes. This is a local smoke load, not production capacity.',
  };
  await writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile('test-results/load-result.json', JSON.stringify(report, null, 2));
  console.log('PASS load: ' + JSON.stringify(report));
} finally {
  for (const child of processes.reverse()) {
    if (child.exitCode !== null) continue;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise<void>((resolve) => child.once('exit', () => resolve())),
      pause(15000),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await fixture.close();
  if (!elapsedMs) console.error(logs.join('\n').slice(-12000));
}
