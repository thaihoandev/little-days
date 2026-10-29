import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { createMailer } from '../apps/api/src/mail.js';
import { OpsMonitor } from '../apps/api/src/ops-monitor.js';

if (process.argv.slice(2).some((a) => a !== '--retry-uncertain'))
  throw new Error('Usage: npm run ops:monitor -- [--retry-uncertain]');
const db = new Repository(),
  mailer = createMailer(path.resolve(process.env.DATA_DIR || 'data'));
try {
  await db.init();
  const monitor = new OpsMonitor(db, mailer);
  await monitor.init();
  const result = await monitor.check(process.argv.includes('--retry-uncertain'));
  console.log(JSON.stringify(result));
  if ((result as { delivery?: string }).delivery) process.exitCode = 1;
} finally {
  mailer.close();
  await db.close();
}
