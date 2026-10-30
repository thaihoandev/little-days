import { lstat, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { Repository } from './database.js';
import { ResourcePolicy } from './resource-policy.js';
import { logEvent } from './observability.js';

export async function cleanWorkspaces(
  db: Repository,
  dataDir: string,
  graceMs: number,
  execute: boolean,
) {
  const root = path.resolve(dataDir, 'work');
  let count = 0;
  try {
    if ((await lstat(root)).isSymbolicLink()) return 0;
    const base = await realpath(root);
    for (const job of await readdir(root, { withFileTypes: true })) {
      if (!job.isDirectory() || !/^[a-f0-9-]{36}$/.test(job.name)) continue;
      const jobDir = path.resolve(root, job.name);
      for (const attempt of await readdir(jobDir, { withFileTypes: true })) {
        if (!attempt.isDirectory() || !/^[a-f0-9-]{36}$/.test(attempt.name)) continue;
        const target = path.resolve(jobDir, attempt.name),
          actual = await realpath(target);
        if (!actual.startsWith(base + path.sep) || (await lstat(target)).isSymbolicLink()) continue;
        if ((await lstat(target)).mtimeMs > Date.now() - graceMs) continue;
        if (
          (
            await db.query(
              "SELECT id FROM render_jobs WHERE id=? AND queue_state IN ('queued','running')",
              [job.name],
            )
          ).length
        )
          continue;
        count++;
        if (execute) await rm(target, { recursive: true, force: true });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return count;
}
export class MaintenanceService {
  private timer?: ReturnType<typeof setInterval>;
  private work?: Promise<void>;
  constructor(
    private db: Repository,
    private policy: ResourcePolicy,
    private dataDir: string,
    private paused?: () => Promise<boolean>,
  ) {}
  start() {
    if (process.env.MAINTENANCE_ENABLED === 'false') return;
    const run = () => {
      if (this.work) return;
      this.work = (async () => {
        if (await this.paused?.()) return;
        const result = await this.policy.cleanup(true);
        const workspaces = await cleanWorkspaces(
          this.db,
          this.dataDir,
          this.policy.orphanGraceMs,
          true,
        );
        logEvent('maintenance_completed', { removed: result.removed, workspaces });
      })()
        .catch(() => logEvent('maintenance_failed', { retry: true }))
        .finally(() => {
          this.work = undefined;
        });
    };
    this.timer = setInterval(run, 3600000);
    run();
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.work;
  }
}
