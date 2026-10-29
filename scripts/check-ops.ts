import { readFile } from 'node:fs/promises';
const token = process.env.OPS_TOKEN_FILE
  ? (await readFile(process.env.OPS_TOKEN_FILE, 'utf8')).trim()
  : process.env.OPS_TOKEN;
if (!token || token.length < 32) throw new Error('Configure OPS_TOKEN or OPS_TOKEN_FILE.');
const origin = process.env.OPS_ORIGIN || 'http://127.0.0.1:3001';
const response = await fetch(new URL('/api/ops/status', origin), {
  headers: { Authorization: 'Bearer ' + token },
  signal: AbortSignal.timeout(10000),
});
if (!response.ok) throw new Error('Operator status unavailable: HTTP ' + response.status);
const status = await response.json(),
  alerts: string[] = [];
if (status.workers === 0) alerts.push('worker_unavailable');
if (status.oldestQueuedSeconds > 600) alerts.push('queue_delayed');
if (status.cleanupRetries > 0) alerts.push('account_cleanup_retry');
if (status.storageMaxOwnerRatio > 0.9) alerts.push('storage_near_quota');
if (status.renderFailuresLast24h >= 3) alerts.push('render_failures');
console.log(JSON.stringify({ healthy: alerts.length === 0, alerts, status }, null, 2));
if (alerts.length) process.exitCode = 1;
