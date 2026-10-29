import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
const db = new Repository({ dataDir: process.argv[2], databaseUrl: '' });
await db.init();
const jobs = new JobRepository(db);
await jobs.init();
try {
  const lease = await jobs.claim(30000);
  console.log(JSON.stringify({ id: lease?.job.id || null, token: lease?.token }));
} finally {
  await db.close();
}
