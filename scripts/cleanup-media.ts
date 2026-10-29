import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { createMediaStore } from '../apps/api/src/storage.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { cleanWorkspaces } from '../apps/api/src/maintenance.js';
const db = new Repository(),
  root = path.resolve(process.env.DATA_DIR || 'data'),
  store = createMediaStore(root);
try {
  await db.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  await new AlbumHistory(db).init();
  await new AccountDeletion(db, jobs, store, root).init();
  const policy = new ResourcePolicy(db, store, root);
  await policy.init();
  const execute = process.argv.includes('--execute');
  if (execute) {
    await store.ready();
    await policy.reconcile();
  }
  console.log(
    JSON.stringify(
      {
        ...(await policy.cleanup(execute)),
        workspaces: await cleanWorkspaces(db, root, policy.orphanGraceMs, execute),
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
  await db.close();
}
