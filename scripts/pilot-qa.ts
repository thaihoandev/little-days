import { spawn, type ChildProcess, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { mkdir, writeFile, readdir, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureBrowser } from '@remotion/renderer';

const suites = [
  ['journal', 'scripts/smoke-journal-ui.ts'],
  ['design', 'scripts/smoke-design-ui.ts'],
  ['templates', 'scripts/smoke-templates-ui.ts'],
  ['editor', 'scripts/smoke-ui.ts'],
  ['save-recovery', 'scripts/smoke-save-recovery.ts'],
  ['gestures', 'scripts/smoke-gestures.ts'],
  ['auth', 'scripts/smoke-auth-ui.ts'],
  ['history', 'scripts/smoke-history-ui.ts'],
  ['video', 'scripts/smoke-video-ui.ts'],
  ['deletion', 'scripts/smoke-deletion-ui.ts'],
  ['layout-render', 'scripts/smoke-layout.ts'],
];
const selected = process.argv[2];
if (process.argv.length > 3 || (selected && !suites.some(([name]) => name === selected)))
  throw new Error('Use npm run test:pilot, npm run test:save-recovery or npm run test:gestures.');

const root = path.resolve('test-results/pilot', crypto.randomUUID());
await mkdir(root, { recursive: true });
const started = Date.now(),
  services: ChildProcess[] = [],
  checks: { name: string; passed: boolean; elapsedMs: number }[] = [];
let serviceLogs = '';
async function port() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const p = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return p;
}
const apiPort = await port();
let webPort = await port();
while (webPort === apiPort) webPort = await port();
const origin = 'http://127.0.0.1:' + webPort;
const browser = await ensureBrowser({
  browserExecutable: process.env.BROWSER_EXECUTABLE || undefined,
  logLevel: 'error',
});
if (!('path' in browser)) throw new Error('Run npm run video:browser before pilot QA.');
const env = {
  ...process.env,
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: String(apiPort),
  API_PORT: String(apiPort),
  WEB_PORT: String(webPort),
  APP_ORIGIN: origin,
  DATABASE_URL: '',
  DATA_DIR: path.join(root, 'data'),
  STORAGE_DRIVER: 'local',
  MAIL_DRIVER: 'local',
  OPS_ALERT_ENABLED: 'false',
  OPS_TOKEN: '',
  OPS_TOKEN_FILE: '',
  MAINTENANCE_ENABLED: 'false',
  RENDER_WORKER_MODE: 'external',
  DISABLE_RENDER_WORKER: 'false',
  AUTH_RATE_LIMIT_PER_MINUTE: '200',
  SMOKE_UI_ORIGIN: origin,
  AUTH_UI_DATA_DIR: path.join(root, 'data'),
  BROWSER_EXECUTABLE: browser.path,
};
function service(args: string[]) {
  const child = spawn(process.execPath, args, {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  services.push(child);
  child.stdout!.on('data', (d) => (serviceLogs += String(d)));
  child.stderr!.on('data', (d) => (serviceLogs += String(d)));
  child.on('error', (e) => (serviceLogs += e.message));
  return child;
}
async function ready(url: string) {
  for (let i = 0; i < 180; i++) {
    if (services.some((s) => s.exitCode !== null)) throw new Error('Fixture service exited.');
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Fixture service did not become ready.');
}
async function run(name: string, file: string) {
  const start = Date.now(),
    child = spawn(process.execPath, ['--import', 'tsx', file], {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  let output = '';
  child.stdout!.on('data', (d) => {
    output += String(d);
    process.stdout.write(d);
  });
  child.stderr!.on('data', (d) => (output += String(d)));
  const timeout = setTimeout(() => child.kill('SIGTERM'), 240000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    checks.push({ name, passed: code === 0, elapsedMs: Date.now() - start });
    await writeFile(path.join(root, name + '.log'), output, { mode: 0o600 });
    if (code !== 0)
      throw new Error('Pilot QA failed: ' + name + '. See fixture logs under ' + root);
  } finally {
    clearTimeout(timeout);
  }
}
let passed = false;
try {
  service(['--import', 'tsx', 'apps/api/src/main.ts']);
  await ready('http://127.0.0.1:' + apiPort + '/api/health');
  service(['--import', 'tsx', 'apps/worker/src/main.ts']);
  service(['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts']);
  await ready(origin);
  for (const [name, file] of suites.filter(([name]) => !selected || name === selected))
    await run(name, file);
  passed = true;
} finally {
  for (const child of services.reverse())
    if (child.pid && child.exitCode === null) {
      const exited = new Promise((r) => child.once('exit', r));
      child.kill('SIGTERM');
      await exited;
    }
  await writeFile(path.join(root, 'services.log'), serviceLogs, { mode: 0o600 });
  const screenshots = path.join(root, 'screenshots');
  await mkdir(screenshots);
  for (const file of await readdir('test-results'))
    if (file.endsWith('.png') && (await stat(path.join('test-results', file))).mtimeMs >= started)
      await copyFile(path.join('test-results', file), path.join(screenshots, file));
  let commit = 'unknown';
  let workingTreeDirty = true;
  try {
    commit = (await promisify(execFile)('git', ['rev-parse', 'HEAD'])).stdout.trim();
    workingTreeDirty = !!(
      await promisify(execFile)('git', ['status', '--porcelain'])
    ).stdout.trim();
  } catch {}
  await writeFile(
    path.join(root, 'report.json'),
    JSON.stringify(
      {
        scope: 'isolated-automated-qa',
        realPilotVerified: false,
        fullSuite: !selected,
        passed,
        commit,
        workingTreeDirty,
        createdAt: new Date().toISOString(),
        elapsedMs: Date.now() - started,
        checks,
      },
      null,
      2,
    ),
  );
  console.log('Pilot QA report: ' + path.join(root, 'report.json'));
}
