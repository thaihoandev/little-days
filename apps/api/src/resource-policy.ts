import { randomUUID } from 'node:crypto';
import type { Album, Asset, AudioAsset, ExportJob } from '../../../packages/domain/index.js';
import { Repository } from './database.js';
import { JobRepository } from './jobs.js';
import { AuthError } from './auth.js';
import { videoDurationFrames } from '../../../packages/domain/video.js';
import { storageIdentity } from './storage-identity.js';
import { type MediaStore, ObjectNotFoundError, validateObjectKey } from './storage.js';

const DAY = 86400000;
function limit(name: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error('Invalid ' + name);
  return value;
}
export class ResourcePolicy {
  readonly limits = {
    storageBytes: limit('QUOTA_STORAGE_MB', 512, 1, 1048576) * 1048576,
    exportsPerDay: limit('QUOTA_EXPORTS_PER_DAY', 10, 1, 100000),
    videoSecondsPerDay: limit('QUOTA_VIDEO_SECONDS_PER_DAY', 600, 1, 10000000),
    queueSize: limit('QUOTA_QUEUE_SIZE', 20, 1, 10000),
  };
  readonly retentionDays = limit('VIDEO_RETENTION_DAYS', 30, 0, 3650);
  readonly orphanGraceMs = limit('ORPHAN_GRACE_HOURS', 24, 1, 8760) * 3600000;
  constructor(
    private db: Repository,
    private store: MediaStore,
    private dataDir = process.env.DATA_DIR || 'data',
  ) {}
  async init() {
    await this.db.migrate(async () => {
      await this.db.query(
        'CREATE TABLE IF NOT EXISTS managed_media(object_key TEXT PRIMARY KEY,owner TEXT NOT NULL,bytes BIGINT NOT NULL,created_at BIGINT NOT NULL)',
      );
      await this.db.query('CREATE INDEX IF NOT EXISTS managed_media_owner ON managed_media(owner)');
      await this.db.query(
        'CREATE TABLE IF NOT EXISTS export_events(job_id TEXT PRIMARY KEY,owner TEXT NOT NULL,created_at BIGINT NOT NULL,seconds INTEGER NOT NULL)',
      );
      await this.db.query(
        'CREATE INDEX IF NOT EXISTS export_event_owner ON export_events(owner,created_at)',
      );
      await this.db.query(
        'CREATE TABLE IF NOT EXISTS maintenance_locks(id TEXT PRIMARY KEY,token TEXT NOT NULL,lease_until BIGINT NOT NULL)',
      );
      await this.db.query(
        'CREATE TABLE IF NOT EXISTS render_observations(job_id TEXT PRIMARY KEY,owner TEXT NOT NULL,elapsed_ms BIGINT NOT NULL,cpu_ms BIGINT NOT NULL,rss_bytes BIGINT NOT NULL,output_bytes BIGINT NOT NULL,completed INTEGER NOT NULL)',
      );
      const id = storageIdentity(this.store, this.dataDir);
      await this.db.query(
        "INSERT INTO maintenance_locks(id,token,lease_until) VALUES('storage-identity',?,0) ON CONFLICT(id) DO NOTHING RETURNING id",
        [id],
      );
      const existing = (
        await this.db.query("SELECT token FROM maintenance_locks WHERE id='storage-identity'")
      )[0];
      if (existing.token !== id)
        throw new Error(
          'Storage target changed. Complete the explicit storage migration before starting services.',
        );
    });
  }
  private async lock(id: string) {
    if (this.db.driver === 'postgresql')
      await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [id]);
  }
  async usage(owner: string) {
    const now = await this.db.now();
    const media = (
      await this.db.query(
        'SELECT COALESCE(SUM(bytes),0) AS bytes,COUNT(*) AS files FROM managed_media WHERE owner=?',
        [owner],
      )
    )[0];
    const exports = (
      await this.db.query(
        'SELECT COUNT(*) AS count,COALESCE(SUM(seconds),0) AS seconds,MIN(created_at) AS oldest FROM export_events WHERE owner=? AND created_at>?',
        [owner, now - DAY],
      )
    )[0];
    return {
      storageBytes: Number(media.bytes),
      files: Number(media.files),
      exportsLast24h: Number(exports.count),
      videoSecondsLast24h: Number(exports.seconds),
      nextExportResetAt: exports.oldest
        ? new Date(Number(exports.oldest) + DAY).toISOString()
        : null,
      limits: this.limits,
      videoRetentionDays: this.retentionDays,
    };
  }
  async reserve(owner: string, key: string, bytes: number) {
    validateObjectKey(key);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid media size.');
    await this.db.transaction(async () => {
      await this.lock('owner-operation:' + owner);
      const existing = (
        await this.db.query('SELECT owner,bytes FROM managed_media WHERE object_key=?', [key])
      )[0];
      if (existing) {
        if (existing.owner !== owner || Number(existing.bytes) !== bytes)
          throw new Error('Media reservation mismatch.');
        return;
      }
      if ((await this.usage(owner)).storageBytes + bytes > this.limits.storageBytes)
        throw new AuthError(
          413,
          'Dung lượng tài khoản đã đạt giới hạn. Hãy xóa media hoặc video cũ.',
        );
      await this.db.query(
        'INSERT INTO managed_media(object_key,owner,bytes,created_at) VALUES(?,?,?,?)',
        [key, owner, bytes, await this.db.now()],
      );
    });
  }
  async forget(key: string) {
    await this.db.query('DELETE FROM managed_media WHERE object_key=? RETURNING object_key', [key]);
  }
  async recordRender(
    jobId: string,
    owner: string,
    elapsedMs: number,
    cpuMs: number,
    bytes: number,
    completed: boolean,
  ) {
    await this.db.transaction(async () => {
      await this.lock('owner-operation:' + owner);
      if (
        (await this.db.query('SELECT owner FROM account_deletions WHERE owner=?', [owner])).length
      )
        return;
      await this.db.query(
        'INSERT INTO render_observations(job_id,owner,elapsed_ms,cpu_ms,rss_bytes,output_bytes,completed) VALUES(?,?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET elapsed_ms=render_observations.elapsed_ms+excluded.elapsed_ms,cpu_ms=render_observations.cpu_ms+excluded.cpu_ms,rss_bytes=excluded.rss_bytes,output_bytes=excluded.output_bytes,completed=excluded.completed RETURNING job_id',
        [jobId, owner, elapsedMs, cpuMs, process.memoryUsage().rss, bytes, completed ? 1 : 0],
      );
    });
  }
  async remove(key: string) {
    await this.store.remove(key);
    await this.forget(key);
  }
  async createExport(job: ExportJob, owner: string, jobs: JobRepository, seconds: number) {
    return this.db.transaction(async () => {
      // Serialize the global queue cap, then the per-owner rolling window.
      await this.lock('quota-export-queue');
      await this.lock('owner-operation:' + owner);
      if (await jobs.get(job.id, owner)) return false;
      const usage = await this.usage(owner);
      if (
        usage.exportsLast24h >= this.limits.exportsPerDay ||
        usage.videoSecondsLast24h + seconds > this.limits.videoSecondsPerDay
      )
        throw new AuthError(429, 'Đã đạt hạn mức xuất video trong 24 giờ. Hãy thử lại sau.');
      if (usage.storageBytes >= this.limits.storageBytes)
        throw new AuthError(413, 'Dung lượng tài khoản đã đạt giới hạn.');
      const active = (
        await this.db.query(
          "SELECT COUNT(*) AS count FROM render_jobs WHERE queue_state IN ('queued','running')",
        )
      )[0];
      if (Number(active.count) >= this.limits.queueSize)
        throw new AuthError(429, 'Hàng đợi đang đầy, hãy thử lại sau.');
      if (!(await jobs.create(job, owner))) return false;
      await this.db.query(
        'INSERT INTO export_events(job_id,owner,created_at,seconds) VALUES(?,?,?,?)',
        [job.id, owner, await this.db.now(), seconds],
      );
      return true;
    });
  }
  async references() {
    const refs = new Map<string, { owner: string; bytes?: number }>();
    const add = (key: string, owner: string, bytes?: number) => {
      validateObjectKey(key);
      const previous = refs.get(key);
      if (previous && previous.owner !== owner) throw new Error('Referenced media owner mismatch.');
      refs.set(key, { owner, bytes: bytes ?? previous?.bytes });
    };
    const albums = await this.db.query(
      "SELECT owner,payload FROM records WHERE kind='album' UNION ALL SELECT owner,payload FROM album_versions",
    );
    for (const row of albums)
      for (const asset of (JSON.parse(String(row.payload)) as Album).assets)
        add('uploads/' + asset.id + '.webp', String(row.owner), asset.bytes);
    for (const row of await this.db.query("SELECT owner,payload FROM records WHERE kind='journal'"))
      for (const asset of (JSON.parse(String(row.payload)) as Album).assets)
        add('journal/' + asset.id + '.jpg', String(row.owner), asset.bytes);
    for (const row of await this.db.query("SELECT owner,payload FROM records WHERE kind='audio'")) {
      const audio = JSON.parse(String(row.payload)) as AudioAsset;
      add('audio/' + audio.id + '.mp3', String(row.owner), audio.bytes);
    }
    for (const row of await this.db.query(
      "SELECT owner,payload FROM records WHERE kind='profile'",
    )) {
      const avatar = (JSON.parse(String(row.payload)) as { avatar?: Asset }).avatar;
      if (avatar) add('uploads/' + avatar.id + '.webp', String(row.owner), avatar.bytes);
    }
    for (const row of await this.db.query(
      'SELECT owner,payload,output_key,queue_state FROM render_jobs',
    )) {
      if (row.output_key) add(String(row.output_key), String(row.owner));
      if (['queued', 'running'].includes(String(row.queue_state))) {
        const job = JSON.parse(String(row.payload)) as ExportJob;
        for (const asset of job.snapshot.assets)
          add('uploads/' + asset.id + '.webp', String(row.owner), asset.bytes);
        if (job.audioAsset)
          add('audio/' + job.audioAsset.id + '.mp3', String(row.owner), job.audioAsset.bytes);
      }
    }
    return refs;
  }
  /** Backfill referenced legacy objects; never scans/deletes a shared provider bucket. */
  async reconcile() {
    if (await this.db.hasTable('media_objects')) {
      for (const row of await this.db.query('SELECT object_key,owner FROM media_objects')) {
        const key = String(row.object_key);
        if (
          (await this.db.query('SELECT object_key FROM managed_media WHERE object_key=?', [key]))
            .length
        )
          continue;
        try {
          const object = await this.store.get(key);
          let bytes = object.size;
          if (bytes === undefined) {
            bytes = 0;
            for await (const chunk of object.stream) bytes += Buffer.byteLength(chunk);
          } else object.stream.destroy();
          await this.db.query(
            'INSERT INTO managed_media(object_key,owner,bytes,created_at) VALUES(?,?,?,?) ON CONFLICT(object_key) DO NOTHING RETURNING object_key',
            [key, String(row.owner), bytes, await this.db.now()],
          );
        } catch (error) {
          if (!(error instanceof ObjectNotFoundError)) throw error;
        }
      }
    }
    for (const [key, ref] of await this.references()) {
      if (
        (await this.db.query('SELECT object_key FROM managed_media WHERE object_key=?', [key]))
          .length
      )
        continue;
      let bytes = ref.bytes;
      if (bytes === undefined) {
        try {
          const object = await this.store.get(key);
          if (object.size !== undefined) {
            bytes = object.size;
            object.stream.destroy();
          } else {
            bytes = 0;
            for await (const chunk of object.stream) bytes += Buffer.byteLength(chunk);
          }
        } catch (error) {
          if (error instanceof ObjectNotFoundError) continue;
          throw error;
        }
      }
      await this.db.query(
        'INSERT INTO managed_media(object_key,owner,bytes,created_at) VALUES(?,?,?,?) ON CONFLICT(object_key) DO NOTHING RETURNING object_key',
        [key, ref.owner, bytes, await this.db.now()],
      );
    }
    // Keep recent legacy attempts in the rolling export budget after upgrading.
    const jobs = await this.db.query(
      'SELECT id,owner,created_at,payload FROM render_jobs WHERE created_at>?',
      [(await this.db.now()) - DAY],
    );
    for (const row of jobs) {
      const job = JSON.parse(String(row.payload)) as ExportJob;
      await this.db.query(
        'INSERT INTO export_events(job_id,owner,created_at,seconds) VALUES(?,?,?,?) ON CONFLICT(job_id) DO NOTHING RETURNING job_id',
        [
          String(row.id),
          String(row.owner),
          Number(row.created_at),
          Math.ceil(videoDurationFrames(job.config) / 30),
        ],
      );
    }
  }
  async candidates() {
    const now = await this.db.now();
    const expired = this.retentionDays
      ? await this.db.query(
          "SELECT id,owner,output_key FROM render_jobs WHERE queue_state='completed' AND created_at<? AND output_key IS NOT NULL AND output_key<>''",
          [now - this.retentionDays * DAY],
        )
      : [];
    const refs = await this.references();
    const orphans = [];
    for (const row of await this.db.query(
      'SELECT object_key,owner FROM managed_media WHERE created_at<?',
      [now - this.orphanGraceMs],
    )) {
      if (refs.has(String(row.object_key))) continue;
      if (
        (
          await this.db.query('SELECT id FROM owner_operations WHERE owner=? AND expires_at>?', [
            String(row.owner),
            now,
          ])
        ).length
      )
        continue;
      if (
        (
          await this.db.query('SELECT owner FROM account_deletions WHERE owner=? AND state<>?', [
            String(row.owner),
            'completed',
          ])
        ).length
      )
        continue;
      orphans.push(row);
    }
    return { expired, orphans };
  }
  async cleanup(execute = false) {
    if (!execute) {
      const c = await this.candidates();
      return { executed: false, expired: c.expired.length, orphans: c.orphans.length, removed: 0 };
    }
    const token = randomUUID(),
      now = await this.db.now();
    const claimed = await this.db.query(
      "INSERT INTO maintenance_locks(id,token,lease_until) VALUES('media-cleanup',?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE maintenance_locks.lease_until<=? RETURNING id",
      [token, now + 60000, now],
    );
    if (!claimed.length) return { executed: true, busy: true, removed: 0 };
    let removed = 0;
    try {
      const c = await this.candidates();
      // Retire output metadata first; tracked bytes remain charged until deletion succeeds.
      for (const row of c.expired.slice(0, 50)) {
        await this.db.query(
          "UPDATE render_jobs SET queue_state='failed',phase='failed',output_key=NULL,error='Video đã hết thời gian lưu trữ. Bạn có thể xuất lại.' WHERE id=? AND queue_state='completed' RETURNING id",
          [String(row.id)],
        );
        await this.db.remove('export', String(row.id));
      }
      for (const row of (await this.candidates()).orphans.slice(0, 50)) {
        const renewed = await this.db.query(
          "UPDATE maintenance_locks SET lease_until=? WHERE id='media-cleanup' AND token=? AND lease_until>? RETURNING id",
          [(await this.db.now()) + 60000, token, await this.db.now()],
        );
        if (!renewed.length) break;
        await this.remove(String(row.object_key));
        removed++;
      }
      await this.db.query('DELETE FROM export_events WHERE created_at<? RETURNING job_id', [
        (await this.db.now()) - DAY,
      ]);
      return { executed: true, expired: c.expired.length, orphans: c.orphans.length, removed };
    } finally {
      await this.db.query(
        "DELETE FROM maintenance_locks WHERE id='media-cleanup' AND token=? RETURNING id",
        [token],
      );
    }
  }
}
