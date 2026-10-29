import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
for (const driver of ['brevo', 'resend']) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/smoke-auth.ts'], {
    env: { ...process.env, SMOKE_MAIL_DRIVER: driver },
    windowsHide: true,
    stdio: 'inherit',
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('exit', resolve);
    child.on('error', reject);
  });
  assert.equal(code, 0, driver + ' HTTP API fixture failed');
}
console.log(
  'PASS HTTPS mail contracts and auth API through loopback HTTP fixtures. No real emails were sent.',
);
