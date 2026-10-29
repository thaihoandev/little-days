import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { startStorageFixture } from './storage-fixture.js';
const fixture = await startStorageFixture();
const dataDir = path.resolve('test-results/workers', crypto.randomUUID());
const port = 4314;
const env = {
  ...process.env,
  OPS_ALERT_ENABLED: 'false',
  ...fixture.env,
  DATABASE_URL: process.env.TEST_DATABASE_URL || '',
  DATA_DIR: dataDir,
  PORT: String(port),
  RENDER_WORKER_MODE: 'external',
  RENDER_POLL_MS: '300',
  DISABLE_RENDER_WORKER: 'true',
};
const processes: ChildProcess[] = [];
const logs: string[] = [];
function start(file: string) {
  const index = logs.length;
  logs.push('');
  const child = spawn(process.execPath, ['--import', 'tsx', file], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout!.on('data', (d) => (logs[index] += String(d)));
  child.stderr!.on('data', (d) => (logs[index] += String(d)));
  processes.push(child);
  return child;
}
async function waitFor(check: () => Promise<boolean>, message: string, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(message);
}
let db: Repository | undefined;
try {
  start('apps/api/src/main.ts');
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${port}/api/health/ready`)).ok,
    'API not ready',
  );
  start('apps/worker/src/main.ts');
  start('apps/worker/src/main.ts');
  await waitFor(
    async () => (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).workers === 2,
    'Both render workers must be online',
  );
  const health = spawn(process.execPath, ['--import', 'tsx', 'apps/worker/src/health.ts'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.push(health);
  let healthLog = '';
  health.stdout!.on('data', (d) => (healthLog += d));
  health.stderr!.on('data', (d) => (healthLog += d));
  assert.equal(
    await new Promise<number | null>((resolve, reject) => {
      health.on('error', reject);
      health.on('exit', resolve);
    }),
    0,
    healthLog,
  );
  const render = spawn(process.execPath, ['--import', 'tsx', 'scripts/smoke-render.ts'], {
    env: { ...env, SMOKE_ORIGIN: `http://127.0.0.1:${port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.push(render);
  let renderLog = '';
  render.stdout!.on('data', (d) => {
    renderLog += d;
    process.stdout.write(d);
  });
  render.stderr!.on('data', (d) => (renderLog += d));
  const code = await new Promise<number | null>((resolve, reject) => {
    render.on('error', reject);
    render.on('exit', resolve);
  });
  assert.equal(code, 0, renderLog);
  const result = JSON.parse(await readFile('test-results/render-result.json', 'utf8')) as {
    id: string;
    bytes: number;
  };
  db = new Repository({ dataDir, databaseUrl: env.DATABASE_URL });
  await db.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  const job = await jobs.get(result.id);
  assert.ok(job);
  assert.equal(job.status, 'completed');
  assert.equal(job.attempts, 1, 'One job must be claimed by exactly one worker');
  assert.equal(
    job.snapshot.title,
    'Render smoke test',
    'Snapshot is immutable after the live album is edited',
  );
  if (process.env.SMOKE_CUSTOM_VIDEO === 'true') {
    assert.ok(job.audioAsset);
    assert.equal(job.audioAsset.id, job.config.audioId);
    assert.ok(
      [...fixture.objects.keys()].some((key) => key.includes('/audio/')),
      'Audio must use the configured provider',
    );
    assert.equal(job.config.sceneDurations?.[job.config.pageIds[0]], 3);
  }
  assert.ok(job.outputKey);
  const output = fixture.objects.get(`contract-test/${job.outputKey}`);
  assert.ok(output);
  assert.equal(output.bytes.length, result.bytes);
  assert.ok(
    [...fixture.objects.keys()].some((key) => key.includes('/uploads/')),
    'Uploaded photo must be stored through the configured provider',
  );
  await assert.rejects(
    access(path.join(dataDir, 'uploads')),
    'Cloud storage must not silently use local image storage',
  );
  assert.ok(fixture.requests.every((r) => r.signed));
  await writeFile(
    'test-results/workers-result.json',
    JSON.stringify(
      {
        status: 'passed',
        workers: 2,
        attempts: job.attempts,
        storage: `${fixture.driver} HTTP fixture`,
        database: db.driver,
        jobId: job.id,
        bytes: result.bytes,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS separate workers: API + 2 worker processes, private ${fixture.driver} upload/download, one claim, immutable snapshot and real MP4.`,
  );
} catch (error) {
  for (let i = 0; i < logs.length; i++) console.error(`Process ${i}:\n${logs[i]}`);
  throw error;
} finally {
  for (const child of processes) if (child.exitCode === null) child.kill('SIGTERM');
  await db?.close();
  await fixture.close();
}
