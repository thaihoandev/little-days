import { randomUUID } from 'node:crypto';
import { Repository } from './database.js';
import type { MediaStore } from './storage.js';

/** This table is deliberately outside the snapshot transaction's table locks. */
export class BackupLock {
  constructor(private db: Repository) {}
  async init() {
    await this.db.migrate(() =>
      this.db
        .query(
          'CREATE TABLE IF NOT EXISTS backup_lease(id INTEGER PRIMARY KEY,token TEXT NOT NULL,lease_until BIGINT NOT NULL)',
        )
        .then(() => {}),
    );
  }
  async paused() {
    return (
      (
        await this.db.query('SELECT id FROM backup_lease WHERE id=1 AND lease_until>?', [
          await this.db.now(),
        ])
      ).length > 0
    );
  }
  async acquire() {
    const now = await this.db.now(),
      token = randomUUID();
    const rows = await this.db.query(
      'INSERT INTO backup_lease(id,token,lease_until) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE backup_lease.lease_until<=? RETURNING id',
      [token, now + 120000, now],
    );
    if (!rows.length) throw new Error('Another backup is active.');
    return token;
  }
  async renew(token: string) {
    const now = await this.db.now();
    return (
      (
        await this.db.query(
          'UPDATE backup_lease SET lease_until=? WHERE id=1 AND token=? AND lease_until>? RETURNING id',
          [now + 120000, token, now],
        )
      ).length > 0
    );
  }
  async release(token: string) {
    await this.db.query(
      'UPDATE backup_lease SET lease_until=0 WHERE id=1 AND token=? RETURNING id',
      [token],
    );
  }
}

/** Protect remote media while the snapshot holds SHARE locks on records. */
export function backupSafeStore(db: Repository, store: MediaStore): MediaStore {
  return {
    kind: store.kind,
    ready: () => store.ready(),
    close: () => store.close(),
    get: (...args) => store.get(...args),
    read: (...args) => store.read(...args),
    put: (...args) => store.put(...args),
    putFile: (...args) => store.putFile(...args),
    remove: (key) =>
      db.driver !== 'postgresql'
        ? store.remove(key)
        : db.transaction(async () => {
            await db.query('LOCK TABLE records IN ROW EXCLUSIVE MODE');
            await store.remove(key);
          }),
  };
}
