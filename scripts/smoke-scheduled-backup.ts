import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { startCloudinaryFixture } from './cloudinary-fixture.js';
if (!process.env.TEST_DATABASE_URL)
  throw new Error('Supply TEST_DATABASE_URL for an isolated QA PostgreSQL server.');
const fixture = await startCloudinaryFixture();
try {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/scheduled-backup-probe.ts'], {
    env: { ...process.env, ...fixture.env },
    windowsHide: true,
    stdio: 'inherit',
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(code, 0);
  assert.ok(fixture.requests.length > 5);
  assert.ok(fixture.requests.every((r) => r.signed));
} finally {
  await fixture.close();
}
