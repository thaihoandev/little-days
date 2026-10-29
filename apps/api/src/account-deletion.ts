import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { type Album, type AudioAsset, type ExportJob } from '../../../packages/domain/index.js';
import { AccountSecurity, AuthError, authHash, passwordMatches, type Account } from './auth.js';
import { Repository } from './database.js';
import { JobRepository } from './jobs.js';
import { type MediaStore, validateObjectKey } from './storage.js';

export const UPLOAD_TIMEOUT_MS = 120000;
export type DeletionStatus = {
  status: 'waiting' | 'deleting' | 'retrying' | 'completed';
  createdAt: string;
  completedAt?: string;
  remainingFiles: number;
};
export class AccountDeletion {
  private timer?: ReturnType<typeof setInterval>;
  private work?: Promise<void>;
  private stopping = false;
  private storageId: string;
  constructor(
    private db: Repository,
    private jobs: JobRepository,
    private store: MediaStore,
    private dataDir: string,
  ) {
    const env = process.env;
    this.storageId = createHash('sha256')
      .update(
        JSON.stringify(
          store.kind === 'local'
            ? { kind: store.kind, root: path.resolve(dataDir) }
            : store.kind === 'cloudinary'
              ? {
                  kind: store.kind,
                  cloud: env.CLOUDINARY_CLOUD_NAME,
                  folder: env.CLOUDINARY_FOLDER || 'little-days',
                  endpoint: env.CLOUDINARY_API_BASE_URL,
                }
              : {
                  kind: store.kind,
                  bucket: env.S3_BUCKET,
                  prefix: env.S3_PREFIX || 'little-days',
                  endpoint: env.S3_ENDPOINT,
                },
        ),
      )
      .digest('hex');
  }
  async init() {
    await this.db.migrate(async () => {
      await this.db.query(
        'CREATE TABLE IF NOT EXISTS auth_tokens(token_hash TEXT PRIMARY KEY,account_key TEXT NOT NULL,owner TEXT NOT NULL,purpose TEXT NOT NULL,expires_at BIGINT NOT NULL,credential_version INTEGER NOT NULL,used_at BIGINT)',
      );
      await this.db.query(
        'CREATE TABLE IF NOT EXISTS auth_rate_limits(rate_key TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at BIGINT NOT NULL)',
      );
      await this.db.query(
        `CREATE TABLE IF NOT EXISTS account_deletions(owner TEXT PRIMARY KEY,receipt_hash TEXT NOT NULL UNIQUE,state TEXT NOT NULL,created_at BIGINT NOT NULL,completed_at BIGINT,available_at BIGINT NOT NULL,lease_token TEXT,lease_until BIGINT NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,manifest_ready INTEGER NOT NULL DEFAULT 0,remaining_keys TEXT NOT NULL DEFAULT '[]',storage_id TEXT NOT NULL)`,
      );
      await this.db.query(
        'CREATE INDEX IF NOT EXISTS account_deletion_claim ON account_deletions(state,available_at,lease_until)',
      );
      await this.db.query(
        'CREATE TABLE IF NOT EXISTS owner_operations(id TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at BIGINT NOT NULL)',
      );
      await this.db.query(
        'CREATE INDEX IF NOT EXISTS owner_operation_expiry ON owner_operations(owner,expires_at)',
      );
      await this.db.query(
        'CREATE TABLE IF NOT EXISTS media_objects(object_key TEXT PRIMARY KEY,owner TEXT NOT NULL)',
      );
      await this.db.query('CREATE INDEX IF NOT EXISTS media_object_owner ON media_objects(owner)');
      if (this.db.driver === 'sqlite') {
        for (const action of ['INSERT', 'UPDATE'])
          await this.db.query(
            `CREATE TRIGGER IF NOT EXISTS reject_deleted_owner_${action.toLowerCase()} BEFORE ${action} ON records WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleting'); END`,
          );
        await this.db.query(
          `CREATE TRIGGER IF NOT EXISTS reject_deleted_export BEFORE INSERT ON render_jobs WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleting'); END`,
        );
        await this.db.query(
          `CREATE TRIGGER IF NOT EXISTS reject_deleted_auth_token BEFORE INSERT ON auth_tokens WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleting'); END`,
        );
      } else {
        await this.db.query(
          `CREATE OR REPLACE FUNCTION little_days_reject_deleted_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM account_deletions WHERE owner=NEW.owner) THEN RAISE EXCEPTION 'account_deleting'; END IF; RETURN NEW; END $$`,
        );
        for (const [table, name, action] of [
          ['records', 'reject_deleted_owner', 'INSERT OR UPDATE'],
          ['render_jobs', 'reject_deleted_export', 'INSERT'],
          ['auth_tokens', 'reject_deleted_auth_token', 'INSERT'],
        ]) {
          await this.db.query('DROP TRIGGER IF EXISTS ' + name + ' ON ' + table);
          await this.db.query(
            'CREATE TRIGGER ' +
              name +
              ' BEFORE ' +
              action +
              ' ON ' +
              table +
              ' FOR EACH ROW EXECUTE FUNCTION little_days_reject_deleted_owner()',
          );
        }
      }
    });
  }
  private async lock(owner: string) {
    if (this.db.driver === 'postgresql')
      await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [
        'owner-operation:' + owner,
      ]);
  }
  async blocked(owner: string) {
    return (
      (await this.db.query('SELECT owner FROM account_deletions WHERE owner=?', [owner])).length > 0
    );
  }
  async begin(owner: string, key?: string) {
    if (key) validateObjectKey(key);
    return this.db.transaction(async () => {
      await this.lock(owner);
      if (await this.blocked(owner)) throw new AuthError(401, 'Tài khoản đang được xóa.');
      const id = randomUUID();
      await this.db.query('INSERT INTO owner_operations(id,owner,expires_at) VALUES(?,?,?)', [
        id,
        owner,
        (await this.db.now()) + 300000,
      ]);
      if (key) await this.track(id, [key]);
      return id;
    });
  }
  async track(operation: string, keys: string[]) {
    const owner = (
      await this.db.query('SELECT owner FROM owner_operations WHERE id=?', [operation])
    )[0]?.owner;
    if (!owner) throw new Error('Operation expired.');
    for (const key of keys) {
      validateObjectKey(key);
      const rows = await this.db.query(
        'INSERT INTO media_objects(object_key,owner) VALUES(?,?) ON CONFLICT(object_key) DO NOTHING RETURNING owner',
        [key, String(owner)],
      );
      if (
        !rows.length &&
        (await this.db.query('SELECT owner FROM media_objects WHERE object_key=?', [key]))[0]
          ?.owner !== owner
      )
        throw new Error('Media owner mismatch.');
    }
  }
  async end(id: string) {
    await this.db.query('DELETE FROM owner_operations WHERE id=? RETURNING id', [id]);
  }
  async request(userId: string, password: string, security: AccountSecurity) {
    await security.rateLimit('delete:' + userId, 5, 60000);
    const original = await security.byUser(userId);
    if (!original || original.deletingAt || !(await passwordMatches(password, original)))
      throw new AuthError(401, 'Mật khẩu hiện tại chưa đúng.');
    const receipt = randomBytes(32).toString('hex');
    await this.db.transaction(async () => {
      await this.lock(userId);
      const row = (
        await this.db.query(
          "SELECT payload,revision FROM records WHERE kind='account' AND id=?" +
            (this.db.driver === 'postgresql' ? ' FOR UPDATE' : ''),
          [authHash(original.email)],
        )
      )[0];
      const current = row ? (JSON.parse(String(row.payload)) as Account) : undefined;
      if (!current || current.password !== original.password || current.deletingAt)
        throw new AuthError(409, 'Tài khoản vừa thay đổi. Hãy đăng nhập lại.');
      const now = await this.db.now(),
        revision = Number(row.revision);
      if (
        !(await this.db.compareAndSwap('account', authHash(current.email), userId, revision, {
          ...current,
          revision: revision + 1,
          deletingAt: new Date(now).toISOString(),
          credentialVersion: (current.credentialVersion ?? 0) + 1,
        }))
      )
        throw new AuthError(409, 'Tài khoản vừa thay đổi.');
      await this.db.query(
        "INSERT INTO account_deletions(owner,receipt_hash,state,created_at,available_at,storage_id) VALUES(?,?,'waiting',?,?,?)",
        [userId, authHash(receipt), now, now, this.storageId],
      );
      await this.db.query(
        "DELETE FROM records WHERE owner=? AND kind IN ('session','share') RETURNING id",
        [userId],
      );
      await this.db.query('DELETE FROM auth_tokens WHERE owner=? RETURNING token_hash', [userId]);
      await this.db.query(
        "UPDATE render_jobs SET cancel_requested=1,phase=CASE WHEN queue_state='queued' THEN 'canceled' ELSE phase END,queue_state=CASE WHEN queue_state='queued' THEN 'canceled' ELSE queue_state END WHERE owner=? AND queue_state IN ('queued','running') RETURNING id",
        [userId],
      );
    });
    return receipt;
  }
  async status(receipt: string): Promise<DeletionStatus> {
    const row = (
      await this.db.query(
        'SELECT state,created_at,completed_at,remaining_keys FROM account_deletions WHERE receipt_hash=?',
        [authHash(receipt)],
      )
    )[0];
    if (!row) throw new AuthError(404, 'Không tìm thấy yêu cầu xóa.');
    return {
      status: String(row.state) as DeletionStatus['status'],
      createdAt: new Date(Number(row.created_at)).toISOString(),
      ...(row.completed_at
        ? { completedAt: new Date(Number(row.completed_at)).toISOString() }
        : {}),
      remainingFiles: (JSON.parse(String(row.remaining_keys)) as string[]).length,
    };
  }
  private async collect(owner: string) {
    const keys = new Set(
      (await this.db.query('SELECT object_key FROM media_objects WHERE owner=?', [owner])).map(
        (row) => String(row.object_key),
      ),
    );
    for (const album of await this.db.list<Album>('album', owner))
      for (const asset of album.assets) keys.add('uploads/' + asset.id + '.webp');
    for (const row of await this.db.query('SELECT payload FROM album_versions WHERE owner=?', [
      owner,
    ]))
      for (const asset of (JSON.parse(String(row.payload)) as Album).assets)
        keys.add('uploads/' + asset.id + '.webp');
    for (const audio of await this.db.list<AudioAsset>('audio', owner))
      keys.add('audio/' + audio.id + '.mp3');
    for (const job of await this.jobs.list(owner)) if (job.outputKey) keys.add(job.outputKey);
    for (const job of await this.db.list<ExportJob>('export', owner))
      if (job.status === 'completed') keys.add(job.outputKey || 'exports/' + job.id + '.mp4');
    for (const key of keys) validateObjectKey(key);
    if (await this.db.hasTable('managed_media'))
      for (const row of await this.db.query('SELECT object_key FROM managed_media WHERE owner=?', [
        owner,
      ])) {
        validateObjectKey(String(row.object_key));
        keys.add(String(row.object_key));
      }
    return [...keys].sort();
  }
  private async removeLocalMail(email: string) {
    const root = path.resolve(this.dataDir, 'mail');
    let files: string[];
    try {
      files = await readdir(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const file of files) {
      if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
      const target = path.resolve(root, file);
      if (!target.startsWith(root + path.sep)) throw new Error('Mail outside data/mail.');
      let mail: { to?: string };
      try {
        mail = JSON.parse(await readFile(target, 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      if (mail.to === email) await unlink(target);
    }
  }
  async tick() {
    if (this.stopping) return;
    if (this.work) return this.work;
    this.work = this.consume().finally(() => {
      this.work = undefined;
    });
    return this.work;
  }
  async start() {
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.tick().catch(() => console.error('Account cleanup deferred.')),
      3000,
    );
    void this.tick().catch(() => console.error('Account cleanup deferred.'));
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.work;
  }
  private async consume() {
    const now = await this.db.now(),
      token = randomUUID();
    const rows = await this.db.query(
      `UPDATE account_deletions SET lease_token=?,lease_until=?,state='deleting' WHERE owner=(SELECT owner FROM account_deletions WHERE state<>'completed' AND available_at<=? AND lease_until<=? ORDER BY created_at LIMIT 1) AND state<>'completed' AND lease_until<=? RETURNING *`,
      [token, now + 60000, now, now, now],
    );
    const job = rows[0];
    if (!job) return;
    const owner = String(job.owner);
    let lost = false;
    const heartbeat = setInterval(
      () =>
        void (async () => {
          const current = await this.db.now();
          const rows = await this.db.query(
            "UPDATE account_deletions SET lease_until=? WHERE owner=? AND lease_token=? AND lease_until>? AND state<>'completed' RETURNING owner",
            [current + 60000, owner, token, current],
          );
          if (!rows.length) lost = true;
        })().catch(() => {
          lost = true;
        }),
      10000,
    );
    const update = async (sql: string, values: (string | number)[]) => {
      if (lost) throw new Error('Deletion lease lost.');
      const result = await this.db.query(
        sql.replace(' RETURNING owner', ' AND lease_until>? RETURNING owner'),
        [...values, owner, token, await this.db.now()],
      );
      if (!result.length) throw new Error('Deletion lease lost.');
    };
    try {
      if (job.storage_id !== this.storageId) throw new Error('Storage target changed.');
      await this.jobs.reap();
      const activeJobs = await this.db.query(
        "SELECT id FROM render_jobs WHERE owner=? AND queue_state IN ('queued','running')",
        [owner],
      );
      const activeOps = await this.db.query(
        'SELECT id FROM owner_operations WHERE owner=? AND expires_at>?',
        [owner, await this.db.now()],
      );
      if (activeJobs.length || activeOps.length) {
        await update(
          "UPDATE account_deletions SET state='waiting',available_at=?,lease_token=NULL,lease_until=0 WHERE owner=? AND lease_token=? RETURNING owner",
          [(await this.db.now()) + 3000],
        );
        return;
      }
      let remaining = JSON.parse(String(job.remaining_keys)) as string[];
      if (!Number(job.manifest_ready)) {
        remaining = await this.collect(owner);
        await update(
          'UPDATE account_deletions SET remaining_keys=?,manifest_ready=1 WHERE owner=? AND lease_token=? RETURNING owner',
          [JSON.stringify(remaining)],
        );
      }
      while (remaining.length) {
        if (lost) throw new Error('Deletion lease lost.');
        await this.store.remove(remaining[0]);
        remaining = remaining.slice(1);
        await update(
          'UPDATE account_deletions SET remaining_keys=? WHERE owner=? AND lease_token=? RETURNING owner',
          [JSON.stringify(remaining)],
        );
      }
      const account = (await this.db.list<Account>('account', owner))[0];
      if (account) await this.removeLocalMail(account.email);
      await this.db.transaction(async () => {
        const valid = await this.db.query(
          'SELECT owner FROM account_deletions WHERE owner=? AND lease_token=? AND lease_until>?' +
            (this.db.driver === 'postgresql' ? ' FOR UPDATE' : ''),
          [owner, token, await this.db.now()],
        );
        if (!valid.length) throw new Error('Deletion lease lost.');
        await this.db.query('DELETE FROM render_jobs WHERE owner=? RETURNING id', [owner]);
        await this.db.query('DELETE FROM album_versions WHERE owner=? RETURNING album_id', [owner]);
        await this.db.query('DELETE FROM auth_tokens WHERE owner=? RETURNING token_hash', [owner]);
        if (account)
          for (const value of [
            'verify:' + owner,
            'reset:' + account.email,
            'change:' + owner,
            'delete:' + owner,
          ])
            await this.db.query(
              'DELETE FROM auth_rate_limits WHERE rate_key=? RETURNING rate_key',
              [authHash(value)],
            );
        await this.db.query('DELETE FROM records WHERE owner=? RETURNING id', [owner]);
        await this.db.query('DELETE FROM owner_operations WHERE owner=? RETURNING id', [owner]);
        await this.db.query('DELETE FROM media_objects WHERE owner=? RETURNING object_key', [
          owner,
        ]);
        if (await this.db.hasTable('managed_media'))
          await this.db.query('DELETE FROM managed_media WHERE owner=? RETURNING object_key', [
            owner,
          ]);
        if (await this.db.hasTable('export_events'))
          await this.db.query('DELETE FROM export_events WHERE owner=? RETURNING job_id', [owner]);
        if (await this.db.hasTable('render_observations'))
          await this.db.query('DELETE FROM render_observations WHERE owner=? RETURNING job_id', [
            owner,
          ]);
        await update(
          "UPDATE account_deletions SET state='completed',completed_at=?,remaining_keys='[]',lease_token=NULL,lease_until=0 WHERE owner=? AND lease_token=? RETURNING owner",
          [await this.db.now()],
        );
      });
    } catch {
      if (!lost)
        await this.db.query(
          "UPDATE account_deletions SET state='retrying',attempts=attempts+1,available_at=?,lease_token=NULL,lease_until=0 WHERE owner=? AND lease_token=? RETURNING owner",
          [
            (await this.db.now()) +
              Math.min(3600000, 5000 * 2 ** Math.min(10, Number(job.attempts))),
            owner,
            token,
          ],
        );
    } finally {
      clearInterval(heartbeat);
    }
  }
}
