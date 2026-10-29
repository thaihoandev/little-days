import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const project = 'little-days-qa-' + crypto.randomUUID().slice(0, 8),
  image = process.env.QA_IMAGE || 'little-days:qa-20261029';
const args = ['compose', '-p', project, '-f', 'deploy/qa.yaml'],
  env = { ...process.env, QA_IMAGE: image };
async function compose(...input: string[]) {
  const child = spawn('docker', [...args, ...input], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += String(d)));
  child.stderr.on('data', (d) => (output += String(d)));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('exit', resolve);
    child.on('error', reject);
  });
  if (code !== 0) throw new Error(output);
  return output;
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  base = 'http://127.0.0.1:4379/api';
let cookie = '';
async function request(route: string, method = 'GET', body?: unknown) {
  const r = await fetch(base + route, {
    method,
    headers: {
      Cookie: cookie,
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie')!.split(';')[0];
  assert.ok(r.ok, route + ': ' + r.status);
  return r;
}
const started = performance.now();
try {
  await compose('up', '-d', '--wait', '--wait-timeout', '120');
  const health = await (await request('/health')).json();
  assert.equal(health.database, 'postgresql');
  assert.equal(health.workers, 1);
  await request('/session');
  let album = await (await request('/albums', 'POST', { title: 'Container QA fixture' })).json();
  const form = new FormData(),
    photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#aabb88' } })
      .png()
      .toBuffer();
  form.append('file', new Blob([photo]), 'fixture.png');
  album = await (await request('/albums/' + album.id + '/assets', 'POST', form)).json();
  const id = crypto.randomUUID();
  await request('/albums/' + album.id + '/exports', 'POST', {
    idempotencyKey: id,
    expectedRevision: album.revision,
    config: {
      seconds: 15,
      pageIds: [album.pages[0].id],
      opening: 'Ngày mình bên nhau',
      closing: 'Hẹn những ngày đẹp',
      musicId: 'none',
      sceneDurations: { [album.pages[0].id]: 1 },
    },
  });
  let done = false;
  for (let i = 0; i < 180; i++) {
    const job = await (await request('/exports/' + id)).json();
    if (job.status === 'failed') throw new Error(job.error);
    if (job.status === 'completed') {
      done = true;
      break;
    }
    await pause(1000);
  }
  assert.ok(done, 'Container render timed out');
  const video = Buffer.from(await (await request('/exports/' + id + '/download')).arrayBuffer());
  assert.equal(video.toString('ascii', 4, 8), 'ftyp');
  await compose('restart', 'app');
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + '/health/ready')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await pause(500);
  }
  assert.ok(ready);
  assert.equal((await (await request('/albums/' + album.id)).json()).title, album.title);
  assert.equal((await (await request('/usage')).json()).exportsLast24h, 1);
  await compose('stop', 'worker', 'app');
  await pause(16000);
  const backup = await compose(
    'run',
    '--rm',
    '--no-deps',
    'app',
    'node',
    '--import',
    'tsx',
    'scripts/container-backup-drill.ts',
  );
  assert.match(backup, /PASS container backup\/restore/);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/container-recap.mp4', video);
  await writeFile(
    'test-results/container-result.json',
    JSON.stringify(
      {
        status: 'passed',
        image,
        database: 'PostgreSQL 17',
        renderBytes: video.length,
        restartPersistence: true,
        backupRestore: true,
        elapsedMs: Math.round(performance.now() - started),
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS production containers: PostgreSQL, API, external worker, real MP4, restart persistence and backup/restore.',
  );
} catch (error) {
  console.error(await compose('logs', '--tail', '60').catch(() => ''));
  throw error;
} finally {
  if (!/^little-days-qa-[a-f0-9-]{8}$/.test(project)) throw new Error('Invalid QA project');
  await compose('down', '--volumes', '--timeout', '30');
}
