import { randomUUID } from 'node:crypto';
import type { ExportJob } from '../../../packages/domain/index.js';
import { Repository } from './database.js';

type Row = Record<string, unknown>;
export type JobLease = { job: ExportJob; token: string; owner: string };
export class LeaseLostError extends Error {
  constructor() {
    super('Render lease expired or belongs to another worker.');
  }
}
const terminal = ['completed', 'failed', 'canceled'];

/** All lifecycle mutations are conditional SQL updates. Snapshot payload never changes. */
export class JobRepository {
  constructor(private db: Repository) {}
  async init() {
    await this.db.migrate(async () => {
      await this.db.query(`CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, album_id TEXT NOT NULL, payload TEXT NOT NULL,
      queue_state TEXT NOT NULL, phase TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL, available_at BIGINT NOT NULL,
      lease_token TEXT, lease_until BIGINT NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
      cancel_requested INTEGER NOT NULL DEFAULT 0, error TEXT, output_key TEXT
    )`);
      await this.db.query(
        'CREATE INDEX IF NOT EXISTS render_job_claim ON render_jobs(queue_state,available_at,lease_until)',
      );
      await this.db.query(
        'CREATE INDEX IF NOT EXISTS render_job_owner ON render_jobs(owner,album_id)',
      );
      // One-time, idempotent migration: preserve finished downloads and recover old in-flight jobs.
      if (!(await this.db.get('migration', 'render-jobs-v1'))) {
        const legacy = await this.db.list<ExportJob>('export');
        for (const job of legacy) {
          const state = job.cancelRequested
            ? 'canceled'
            : terminal.includes(job.status)
              ? job.status
              : 'queued';
          const owner = await this.db.owner('export', job.id);
          const created = Date.parse(job.createdAt) || (await this.db.now());
          await this.db.query(
            `INSERT INTO render_jobs (id,owner,album_id,payload,queue_state,phase,progress,created_at,available_at,cancel_requested,output_key)
          VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id`,
            [
              job.id,
              owner || 'legacy',
              job.albumId,
              JSON.stringify(job),
              state,
              state,
              state === 'completed' ? 100 : job.progress,
              created,
              created,
              job.cancelRequested ? 1 : 0,
              state === 'completed' ? `exports/${job.id}.mp4` : '',
            ],
          );
        }
        await this.db.put('migration', 'render-jobs-v1', 'system', {
          completedAt: new Date().toISOString(),
        });
      }
      // Preserve excess legacy tasks as failed history before enabling the per-owner limit.
      await this.db
        .query(`UPDATE render_jobs SET queue_state='failed',phase='failed',error='Tác vụ cũ đã dừng khi nâng cấp hàng đợi. Hãy xuất lại.'
      WHERE id IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER(PARTITION BY owner ORDER BY created_at,id) AS rn FROM render_jobs WHERE queue_state IN ('queued','running')) ranked WHERE rn>1) RETURNING id`);
      await this.db.query(
        "CREATE UNIQUE INDEX IF NOT EXISTS render_one_active_per_owner ON render_jobs(owner) WHERE queue_state IN ('queued','running')",
      );
    });
  }
  private decode(row: Row): ExportJob {
    const job = JSON.parse(String(row.payload)) as ExportJob;
    return {
      ...job,
      status: row.phase as ExportJob['status'],
      progress: Number(row.progress),
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
      cancelRequested: !!Number(row.cancel_requested),
      error: row.error ? String(row.error) : undefined,
      outputKey: row.output_key ? String(row.output_key) : undefined,
    };
  }
  async get(id: string, owner?: string) {
    const rows = await this.db.query(
      `SELECT * FROM render_jobs WHERE id=?${owner ? ' AND owner=?' : ''}`,
      owner ? [id, owner] : [id],
    );
    return rows[0] ? this.decode(rows[0]) : undefined;
  }
  async list(owner?: string, albumId?: string): Promise<ExportJob[]> {
    const conditions: string[] = [];
    const values: string[] = [];
    if (owner) {
      conditions.push('owner=?');
      values.push(owner);
    }
    if (albumId) {
      conditions.push('album_id=?');
      values.push(albumId);
    }
    return (
      await this.db.query(
        `SELECT * FROM render_jobs${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''} ORDER BY created_at DESC,id`,
        values,
      )
    ).map((r) => this.decode(r));
  }
  async create(job: ExportJob, owner: string, maxAttempts = 3): Promise<boolean> {
    const now = await this.db.now();
    // A partial unique index reserves the owner's active slot in this same atomic insert.
    return (
      (
        await this.db.query(
          `INSERT INTO render_jobs(id,owner,album_id,payload,queue_state,phase,created_at,available_at,max_attempts)
      VALUES (?,?,?,?,'queued','queued',?,?,?) ON CONFLICT DO NOTHING RETURNING id`,
          [job.id, owner, job.albumId, JSON.stringify(job), now, now, maxAttempts],
        )
      ).length > 0
    );
  }
  async claim(leaseMs: number): Promise<JobLease | undefined> {
    await this.reap();
    const now = await this.db.now();
    const token = randomUUID();
    const eligible =
      "((queue_state='queued' AND available_at<=?) OR (queue_state='running' AND lease_until<=?)) AND cancel_requested=0 AND attempts<max_attempts";
    const rows = await this.db.query(
      `UPDATE render_jobs SET queue_state='running', phase='preparing', progress=0, error=NULL, lease_token=?,lease_until=?,attempts=attempts+1
      WHERE id=(SELECT id FROM render_jobs WHERE ${eligible} ORDER BY created_at,id LIMIT 1) AND ${eligible} RETURNING *`,
      [token, now + leaseMs, now, now, now, now],
    );
    return rows[0] ? { job: this.decode(rows[0]), token, owner: String(rows[0].owner) } : undefined;
  }
  async heartbeat(
    lease: JobLease,
    leaseMs: number,
  ): Promise<{ valid: boolean; canceled: boolean }> {
    const now = await this.db.now();
    const rows = await this.db.query(
      `UPDATE render_jobs SET lease_until=? WHERE id=? AND lease_token=? AND lease_until>? AND queue_state='running' RETURNING cancel_requested`,
      [now + leaseMs, lease.job.id, lease.token, now],
    );
    return { valid: rows.length > 0, canceled: !!Number(rows[0]?.cancel_requested) };
  }
  async progress(
    lease: JobLease,
    phase: 'preparing' | 'rendering' | 'uploading',
    progress: number,
  ): Promise<boolean> {
    const now = await this.db.now();
    return (
      (
        await this.db.query(
          `UPDATE render_jobs SET phase=?,progress=? WHERE id=? AND lease_token=? AND lease_until>? AND queue_state='running' AND cancel_requested=0 RETURNING id`,
          [phase, Math.max(0, Math.min(99, Math.floor(progress))), lease.job.id, lease.token, now],
        )
      ).length > 0
    );
  }
  async complete(lease: JobLease, outputKey: string): Promise<boolean> {
    const now = await this.db.now();
    return (
      (
        await this.db.query(
          `UPDATE render_jobs SET queue_state='completed',phase='completed',progress=100,output_key=?,lease_until=0,lease_token=NULL
      WHERE id=? AND lease_token=? AND lease_until>? AND queue_state='running' AND cancel_requested=0 RETURNING id`,
          [outputKey, lease.job.id, lease.token, now],
        )
      ).length > 0
    );
  }
  async fail(
    lease: JobLease,
    message: string,
    retryable: boolean,
    backoffMs = 2000,
  ): Promise<boolean> {
    const now = await this.db.now();
    const retry = retryable ? 1 : 0;
    return (
      (
        await this.db.query(
          `UPDATE render_jobs SET
      queue_state=CASE WHEN cancel_requested=1 THEN 'canceled' WHEN ?=1 AND attempts<max_attempts THEN 'queued' ELSE 'failed' END,
      phase=CASE WHEN cancel_requested=1 THEN 'canceled' WHEN ?=1 AND attempts<max_attempts THEN 'queued' ELSE 'failed' END,
      error=CASE WHEN cancel_requested=1 THEN NULL ELSE ? END,
      available_at=?,lease_token=NULL,lease_until=0
      WHERE id=? AND lease_token=? AND lease_until>? AND queue_state='running' RETURNING id`,
          [retry, retry, message, now + backoffMs, lease.job.id, lease.token, now],
        )
      ).length > 0
    );
  }
  async release(lease: JobLease): Promise<boolean> {
    const now = await this.db.now();
    return (
      (
        await this.db.query(
          `UPDATE render_jobs SET queue_state=CASE WHEN cancel_requested=1 THEN 'canceled' ELSE 'queued' END,
      phase=CASE WHEN cancel_requested=1 THEN 'canceled' ELSE 'queued' END,lease_token=NULL,lease_until=0,attempts=CASE WHEN attempts>0 THEN attempts-1 ELSE 0 END
      WHERE id=? AND lease_token=? AND lease_until>? AND queue_state='running' RETURNING id`,
          [lease.job.id, lease.token, now],
        )
      ).length > 0
    );
  }
  async cancel(id: string, owner: string): Promise<ExportJob | undefined> {
    await this.db.query(
      `UPDATE render_jobs SET cancel_requested=1,
      phase=CASE WHEN queue_state='queued' THEN 'canceled' ELSE phase END,
      queue_state=CASE WHEN queue_state='queued' THEN 'canceled' ELSE queue_state END
      WHERE id=? AND owner=? AND queue_state IN ('queued','running') RETURNING id`,
      [id, owner],
    );
    return this.get(id, owner);
  }
  async reap() {
    const now = await this.db.now();
    await this.db.query(
      `UPDATE render_jobs SET queue_state=CASE WHEN cancel_requested=1 THEN 'canceled' ELSE 'failed' END,
      phase=CASE WHEN cancel_requested=1 THEN 'canceled' ELSE 'failed' END,
      error=CASE WHEN cancel_requested=1 THEN NULL ELSE 'Worker ngừng phản hồi sau nhiều lần thử. Hãy xuất video lại.' END,lease_token=NULL,lease_until=0
      WHERE queue_state='running' AND lease_until<=? AND (cancel_requested=1 OR attempts>=max_attempts) RETURNING id`,
      [now],
    );
  }
  async remove(id: string, owner: string) {
    await this.db.query(
      "DELETE FROM render_jobs WHERE id=? AND owner=? AND queue_state IN ('completed','failed','canceled') RETURNING id",
      [id, owner],
    );
    await this.db.remove('export', id); // Remove legacy payload, too; migration never resurrects deleted history.
  }
}
