import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { makeJob } from '../tests/job-fixture.js';

const root = path.resolve('test-results/ops-api', crypto.randomUUID());
const token = 'operator-fixture-key-12345678901234567890';
const env = {
  ...process.env,
  DATABASE_URL: '',
  DATA_DIR: root,
  STORAGE_DRIVER: 'local',
  NODE_ENV: 'development',
  MAIL_DRIVER: 'local',
  OPS_ALERT_ENABLED: 'true',
  OPS_ALERT_EMAIL: 'operator@example.test',
  OPS_TOKEN: token,
  OPS_TOKEN_FILE: '',
  PORT: '4388',
  HOST: '127.0.0.1',
  RENDER_WORKER_MODE: 'external',
  DISABLE_RENDER_WORKER: 'true',
  MAINTENANCE_ENABLED: 'false',
};
const db = new Repository({ dataDir: root, databaseUrl: '' });
await db.init();
let server: ChildProcess | undefined,
  logs = '';
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function start() {
  server = spawn(process.execPath, ['build/apps/api/src/main.js'], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout!.on('data', (d) => (logs += String(d)));
  server.stderr!.on('data', (d) => (logs += String(d)));
  for (let i = 0; i < 300; i++) {
    if (server.exitCode !== null) throw new Error('API exited: ' + logs);
    try {
      const response = await fetch('http://127.0.0.1:4388/api/ops/status', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (response.ok && (await response.json()).notifications?.lastCheck) return;
    } catch {}
    await pause(200);
  }
  throw new Error('API monitor not ready: ' + logs);
}
async function stop() {
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server!.once('exit', r));
    server.kill('SIGTERM');
    await exited;
  }
}
async function check() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/monitor-ops.ts'], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout!.on('data', (d) => (output += String(d)));
  child.stderr!.on('data', (d) => (output += String(d)));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(code, 0, output);
}
async function messages() {
  try {
    return await Promise.all(
      (await readdir(path.join(root, 'mail'))).map(async (f) =>
        JSON.parse(await readFile(path.join(root, 'mail', f), 'utf8')),
      ),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}
try {
  await start();
  assert.equal((await fetch('http://127.0.0.1:4388/api/ops/status')).status, 404);
  const jobs = new JobRepository(db);
  await jobs.init();
  const job = makeJob();
  job.config.opening = 'private fixture text';
  await jobs.create(job, 'private-owner-fixture');
  await check();
  assert.equal((await messages()).length, 0);
  await db.query('UPDATE ops_notifications SET observed_at=0,attempted_at=0 RETURNING id');
  await check();
  assert.equal((await messages()).length, 1);
  const mail = (await messages())[0];
  assert.equal(mail.to, 'operator@example.test');
  assert.match(mail.text, /worker_unavailable/);
  assert.ok(!JSON.stringify(mail).includes('private fixture text'));
  assert.ok(!JSON.stringify(mail).includes('private-owner-fixture'));
  await stop();
  await start();
  await check();
  assert.equal((await messages()).length, 1);
  assert.ok(!logs.includes('operator@example.test'));
  console.log(
    'PASS ops API: opt-in initialization, protected status, local notification, persistent deduplication and restart. No real email sent.',
  );
} finally {
  await stop();
  await db.close();
}
