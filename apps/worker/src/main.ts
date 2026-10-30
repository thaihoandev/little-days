import path from 'node:path';
import { Repository } from '../../api/src/database.js';
import { JobRepository } from '../../api/src/jobs.js';
import { createMediaStore } from '../../api/src/storage.js';
import { AccountDeletion } from '../../api/src/account-deletion.js';
import { RenderQueue } from '../../api/src/render.js';
import { ResourcePolicy } from '../../api/src/resource-policy.js';
import { AlbumHistory } from '../../api/src/history.js';
import { MaintenanceService } from '../../api/src/maintenance.js';
import { BackupLock, backupSafeStore } from '../../api/src/backup-lock.js';
const dataDir = path.resolve(process.env.DATA_DIR || 'data');
const repository = new Repository();
await repository.init();
const backupLock = new BackupLock(repository);
await backupLock.init();
const jobs = new JobRepository(repository);
await jobs.init();
await new AlbumHistory(repository).init();
const store = backupSafeStore(repository, createMediaStore(dataDir));
await store.ready();
const deletion = new AccountDeletion(repository, jobs, store, dataDir, () => backupLock.paused());
await deletion.init();
const resources = new ResourcePolicy(repository, store, dataDir);
await resources.init();
await resources.reconcile();
await deletion.start();
const queue = new RenderQueue(repository, jobs, store, dataDir, {
  operations: deletion,
  resources,
  paused: () => backupLock.paused(),
});
await queue.start();
const maintenance = new MaintenanceService(repository, resources, dataDir, () =>
  backupLock.paused(),
);
maintenance.start();
console.log(`Render worker ready: ${queue.workerId} (${repository.driver}, ${store.kind})`);
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void queue
      .stop()
      .then(() => deletion.stop())
      .then(() => maintenance.stop())
      .then(() => repository.close())
      .then(() => {
        store.close();
        process.exit(0);
      })
      .catch((error) => {
        console.error(error.message);
        process.exit(1);
      });
  });
