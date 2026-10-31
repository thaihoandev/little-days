import pg from 'pg';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Cần TEST_DATABASE_URL tới PostgreSQL dùng riêng cho kiểm thử.');
const admin = new pg.Client({ connectionString: url });
await admin.connect();
const schemas: string[] = [];
async function isolatedUrl() {
  const name = 'qa_' + crypto.randomUUID().replaceAll('-', '');
  await admin.query('CREATE SCHEMA ' + name);
  schemas.push(name);
  const isolated = new URL(url!);
  isolated.searchParams.set('options', '-c search_path=' + name);
  return isolated.toString();
}
async function run(name: string, args: string[], extra: NodeJS.ProcessEnv = {}) {
  const isolated = await isolatedUrl(),
    started = performance.now();
  const child = spawn(process.execPath, ['--import', 'tsx', ...args], {
    env: { ...process.env, TEST_DATABASE_URL: isolated, ...extra },
    windowsHide: true,
    stdio: 'inherit',
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('exit', resolve);
    child.on('error', reject);
  });
  if (code !== 0) throw new Error('PostgreSQL check failed: ' + name);
  return { name, passed: true, elapsedMs: Math.round(performance.now() - started) };
}
try {
  const results = [];
  results.push(
    await run('transactions-auth-history-deletion-quota', [
      '--test',
      '--test-concurrency=1',
      'tests/jobs.test.ts',
      'tests/history.test.ts',
      'tests/auth.test.ts',
      'tests/account-deletion.test.ts',
      'tests/resource-policy.test.ts',
      'tests/ops-monitor.test.ts',
      'tests/journal.test.ts',
      'tests/timeline-sharing.test.ts',
      'tests/profile-location.test.ts',
      'tests/journal-album.test.ts',
    ]),
  );
  results.push(await run('api', ['scripts/smoke-api.ts']));
  results.push(await run('three-user-render-load', ['scripts/smoke-load.ts']));
  const source = await isolatedUrl(),
    target = await isolatedUrl();
  results.push(
    await run('backup-restore', ['scripts/smoke-backup.ts'], {
      TEST_BACKUP_SOURCE_URL: source,
      TEST_BACKUP_TARGET_URL: target,
    }),
  );
  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/postgresql-result.json',
    JSON.stringify({ status: 'passed', results }, null, 2),
  );
  console.log('PASS PostgreSQL: ' + results.map((r) => r.name).join(', '));
} finally {
  for (const name of schemas.reverse()) {
    if (!/^qa_[a-f0-9]{32}$/.test(name)) throw new Error('Invalid test schema');
    await admin.query('DROP SCHEMA ' + name + ' CASCADE');
  }
  await admin.end();
}
