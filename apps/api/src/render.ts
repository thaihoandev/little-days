import { mkdir, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { hostname } from 'node:os';
import type { ExportJob } from '../../../packages/domain/index.js';
import { Repository } from './database.js';
import { JobRepository, LeaseLostError, type JobLease } from './jobs.js';
import type { MediaStore } from './storage.js';
import { createRenderer, PermanentRenderError } from './render-engine.js';
import { AuthError } from './auth.js';
import type { ResourcePolicy } from './resource-policy.js';
import { logEvent } from './observability.js';

export type RenderContext = {
  workspace: string;
  signal: AbortSignal;
  progress: (percent: number) => void;
};
export type JobRenderer = (job: ExportJob, context: RenderContext) => Promise<string>;
export type QueueOptions = {
  paused?: () => Promise<boolean>;
  leaseMs?: number;
  pollMs?: number;
  maxRenderMs?: number;
  renderer?: JobRenderer;
  operations?: {
    begin: (owner: string, key?: string) => Promise<string>;
    end: (id: string) => Promise<void>;
  };
  workerId?: string;
  resources?: ResourcePolicy;
};
export class RenderQueue {
  readonly workerId: string;
  private timer?: ReturnType<typeof setInterval>;
  private serviceTimer?: ReturnType<typeof setInterval>;
  private task?: Promise<void>;
  private controller?: AbortController;
  private stopping = false;
  private leaseMs: number;
  private pollMs: number;
  private maxRenderMs: number;
  private renderer: JobRenderer;
  private operations?: QueueOptions['operations'];
  private resources?: ResourcePolicy;
  private paused?: () => Promise<boolean>;
  constructor(
    private db: Repository,
    private jobs: JobRepository,
    private store: MediaStore,
    private dataDir: string,
    options: QueueOptions = {},
  ) {
    this.workerId = options.workerId || randomUUID();
    this.leaseMs = options.leaseMs ?? Number(process.env.RENDER_LEASE_MS || 30000);
    this.pollMs = options.pollMs ?? Number(process.env.RENDER_POLL_MS || 1000);
    this.maxRenderMs = options.maxRenderMs ?? Number(process.env.RENDER_TIMEOUT_MS || 900000);
    if (!Number.isFinite(this.leaseMs) || this.leaseMs < 3000 || this.leaseMs > 300000)
      throw new Error('RENDER_LEASE_MS phải từ 3000 đến 300000.');
    if (!Number.isFinite(this.pollMs) || this.pollMs < 100 || this.pollMs > 60000)
      throw new Error('RENDER_POLL_MS phải từ 100 đến 60000.');
    if (!Number.isFinite(this.maxRenderMs) || this.maxRenderMs < 1000 || this.maxRenderMs > 3600000)
      throw new Error('RENDER_TIMEOUT_MS phải từ 1000 đến 3600000.');
    this.renderer = options.renderer || createRenderer(store);
    this.operations = options.operations;
    this.resources = options.resources;
    this.paused = options.paused;
  }
  private async announce() {
    if (await this.paused?.()) return;
    await this.db.put('worker', this.workerId, 'system', {
      id: this.workerId,
      host: hostname(),
      pid: process.pid,
      lastSeen: await this.db.now(),
      busy: !!this.task,
      backupProtocol: 1,
      musicCatalogVersion: 1,
      photoStylesVersion: 1,
    });
  }
  async start() {
    if (this.timer) return;
    await this.announce();
    this.timer = setInterval(() => {
      void this.tick().catch(() => logEvent('worker_tick_failed'));
    }, this.pollMs);
    this.serviceTimer = setInterval(() => {
      void this.announce().catch(() => logEvent('worker_heartbeat_failed'));
    }, 5000);
    void this.tick().catch(() => logEvent('worker_tick_failed'));
  }
  tick(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.task) return this.task;
    this.task = this.consume().finally(() => {
      this.task = undefined;
    });
    return this.task;
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    if (this.serviceTimer) clearInterval(this.serviceTimer);
    this.controller?.abort(new Error('Worker shutdown'));
    await this.task?.catch(() => logEvent('worker_shutdown_failed'));
    await this.db.remove('worker', this.workerId);
  }
  private async consume() {
    if (await this.paused?.()) return;
    const lease = await this.jobs.claim(this.leaseMs);
    if (!lease) return;
    if (this.stopping) {
      await this.jobs.release(lease);
      return;
    }
    await this.run(lease);
  }
  private async run(lease: JobLease) {
    const started = performance.now(),
      cpuStarted = process.cpuUsage();
    let outputBytes = 0;
    const controller = new AbortController();
    this.controller = controller;
    const workspace = path.join(this.dataDir, 'work', lease.job.id, lease.token);
    let lost = false,
      heartbeatPending = false,
      published = false;
    let outputKey: string | undefined;
    let progressWrites = Promise.resolve();
    let progressError: unknown;
    const abort = (reason: unknown) => {
      if (!controller.signal.aborted) controller.abort(reason);
    };
    const heartbeat = setInterval(
      () => {
        if (heartbeatPending || controller.signal.aborted) return;
        heartbeatPending = true;
        void this.jobs
          .heartbeat(lease, this.leaseMs)
          .then((state) => {
            if (!state.valid) {
              lost = true;
              abort(new LeaseLostError());
            } else if (state.canceled) abort(new Error('User canceled'));
          })
          .catch((error) => {
            lost = true;
            abort(error);
          })
          .finally(() => {
            heartbeatPending = false;
          });
      },
      Math.floor(this.leaseMs / 3),
    );
    const timeout = setTimeout(() => abort(new Error('Render timeout')), this.maxRenderMs);
    const progress = (percent: number) => {
      progressWrites = progressWrites
        .then(async () => {
          controller.signal.throwIfAborted();
          if (!(await this.jobs.progress(lease, 'rendering', percent))) throw new LeaseLostError();
        })
        .catch((error) => {
          progressError ??= error;
          abort(error);
        });
    };
    try {
      await mkdir(workspace, { recursive: true });
      if (!(await this.jobs.progress(lease, 'preparing', 3))) throw new LeaseLostError();
      const file = await this.renderer(lease.job, {
        workspace,
        signal: controller.signal,
        progress,
      });
      await progressWrites;
      if (progressError) throw progressError;
      controller.signal.throwIfAborted();
      if (!(await this.jobs.progress(lease, 'uploading', 97))) throw new LeaseLostError();
      outputKey = `exports/${lease.job.id}/${lease.token}.mp4`;
      const operation = await this.operations?.begin(lease.owner, outputKey);
      try {
        outputBytes = (await stat(file)).size;
        await this.resources?.reserve(lease.owner, outputKey, outputBytes);
        await this.store.putFile(
          outputKey,
          file,
          'video/mp4',
          AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
        );
      } finally {
        if (operation) await this.operations!.end(operation);
      }
      controller.signal.throwIfAborted();
      if (!(await this.jobs.complete(lease, outputKey))) throw new LeaseLostError();
      published = true;
      logEvent('render_completed', { jobId: lease.job.id, attempt: lease.job.attempts || 1 });
    } catch (error) {
      abort(error);
      await progressWrites;
      if (!lost) {
        if (this.stopping) await this.jobs.release(lease);
        else
          await this.jobs.fail(
            lease,
            error instanceof AuthError
              ? error.message
              : error instanceof PermanentRenderError
                ? 'Ảnh nguồn không còn tồn tại hoặc không hợp lệ. Hãy cập nhật ảnh và xuất lại.'
                : 'Có lỗi khi xuất video. Hệ thống thử lại tối đa 3 lần; nếu vẫn lỗi hãy thử lại sau.',
            !(error instanceof PermanentRenderError || error instanceof AuthError),
            Math.min(30000, 2000 * 2 ** Math.max(0, (lease.job.attempts || 1) - 1)),
          );
      }
      logEvent('render_stopped', { jobId: lease.job.id, leaseLost: lost, shutdown: this.stopping });
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      this.controller = undefined;
      const cpu = process.cpuUsage(cpuStarted);
      await this.resources
        ?.recordRender(
          lease.job.id,
          lease.owner,
          Math.round(performance.now() - started),
          Math.round((cpu.user + cpu.system) / 1000),
          outputBytes,
          published,
        )
        .catch(() => console.error('Render measurement deferred.'));
      // Delete only this attempt's artifact; an ambiguous successful commit must retain its object.
      if (outputKey && !published) {
        try {
          const latest = await this.jobs.get(lease.job.id);
          if (latest?.outputKey !== outputKey) {
            await this.store.remove(outputKey);
            await this.resources?.forget(outputKey);
          }
        } catch {
          console.error(`Deferred output cleanup: ${lease.job.id}`);
        }
      }
      const resolved = path.resolve(workspace),
        root = path.resolve(this.dataDir, 'work') + path.sep;
      if (!resolved.startsWith(root)) throw new Error('Render workspace outside data/work.');
      await rm(resolved, { recursive: true, force: true });
    }
  }
}
