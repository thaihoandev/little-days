import { hostname } from 'node:os';
import { Repository } from '../../api/src/database.js';
const db = new Repository();
try {
  await db.init();
  const now = await db.now();
  const workers = await db.list<{ host: string; lastSeen: number }>('worker');
  if (!workers.some((worker) => worker.host === hostname() && now - worker.lastSeen < 15000))
    throw new Error('No recent worker heartbeat on this host.');
  console.log('Worker heartbeat healthy.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Worker health failed.');
  process.exitCode = 1;
} finally {
  await db.close();
}
