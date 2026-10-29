import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/smoke-workers.ts'], {
  env: {
    ...process.env,
    SMOKE_CUSTOM_VIDEO: 'true',
    SMOKE_STORAGE: process.env.SMOKE_STORAGE || 'cloudinary',
  },
  stdio: 'inherit',
  windowsHide: true,
});
const code = await new Promise<number | null>((resolve, reject) => {
  child.on('exit', resolve);
  child.on('error', reject);
});
assert.equal(code, 0);
await import('./verify-custom-video.js');
