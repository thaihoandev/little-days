import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { createAlbumContent, type ExportJob } from '../packages/domain/index.js';
export function makeJob(): ExportJob {
  const content = createAlbumContent();
  return {
    id: crypto.randomUUID(),
    albumId: crypto.randomUUID(),
    status: 'queued',
    progress: 0,
    createdAt: new Date().toISOString(),
    snapshot: {
      ...content,
      id: crypto.randomUUID(),
      revision: 0,
      schemaVersion: 1,
      assets: [],
      createdAt: '',
      updatedAt: '',
    },
    config: {
      seconds: 15,
      pageIds: [content.pages[0].id],
      opening: 'Test',
      closing: 'Done',
      musicId: 'none',
    },
    referenceDate: '2026-10-29',
    assetData: {},
  };
}
export async function jobFixture(databaseUrl = process.env.TEST_DATABASE_URL || '') {
  const dataDir = path.resolve('test-results/jobs', crypto.randomUUID());
  const db = new Repository({ dataDir, databaseUrl });
  await db.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  const owner = crypto.randomUUID();
  return {
    db,
    jobs,
    dataDir,
    owner,
    async create(job = makeJob(), attempts = 3) {
      await jobs.create(job, owner, attempts);
      return job;
    },
    async close() {
      for (const job of await jobs.list(owner)) {
        await jobs.cancel(job.id, owner);
        await db.query('UPDATE render_jobs SET lease_until=0 WHERE id=?', [job.id]);
        await jobs.reap();
        await jobs.remove(job.id, owner);
      }
      await db.close();
    },
  };
}
