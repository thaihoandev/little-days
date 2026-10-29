import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { createMediaStore, type MediaStore } from '../apps/api/src/storage.js';

const db = new Repository();
let store: MediaStore | undefined;
try {
  await db.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  await new AlbumHistory(db).init();
  if (process.argv.includes('--execute')) {
    store = createMediaStore(path.resolve(process.env.DATA_DIR || 'data'));
    await store.ready();
    const cleanup = new AccountDeletion(
      db,
      jobs,
      store,
      path.resolve(process.env.DATA_DIR || 'data'),
    );
    await cleanup.init();
    for (let i = 0; i < 50; i++) {
      const now = await db.now(),
        due = await db.query(
          "SELECT owner FROM account_deletions WHERE state<>'completed' AND available_at<=? AND lease_until<=?",
          [now, now],
        );
      if (!due.length) break;
      await cleanup.tick();
    }
  }
  const exists = await db.query(
    db.driver === 'postgresql'
      ? "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='account_deletions'"
      : "SELECT name FROM sqlite_master WHERE type='table' AND name='account_deletions'",
  );
  const states = exists.length
    ? await db.query('SELECT state,COUNT(*) AS count FROM account_deletions GROUP BY state')
    : [];
  console.log(JSON.stringify({ executed: process.argv.includes('--execute'), states }, null, 2));
} finally {
  store?.close();
  await db.close();
}
