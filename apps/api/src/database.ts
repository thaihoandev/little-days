import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

/** Small durable repository: SQLite locally, PostgreSQL with DATABASE_URL. */
export class Repository {
  private sqlite?: DatabaseSync;
  private postgres?: pg.Pool;
  private migrationClient = new AsyncLocalStorage<pg.PoolClient>();
  private sqliteContext = new AsyncLocalStorage<boolean>();
  private sqliteQueue: Promise<void> = Promise.resolve();
  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.sqliteQueue;
    let release!: () => void;
    this.sqliteQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }
  constructor(private options: { dataDir?: string; databaseUrl?: string } = {}) {}
  get driver() {
    return (this.options.databaseUrl ?? process.env.DATABASE_URL) ? 'postgresql' : 'sqlite';
  }
  async init() {
    if (this.driver === 'postgresql') {
      this.postgres = new pg.Pool({
        connectionString: this.options.databaseUrl ?? process.env.DATABASE_URL,
      });
      await this.migrate(() =>
        this.query(
          'CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, owner TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,id))',
        ).then(() => undefined),
      );
    } else {
      const dataDir = this.options.dataDir || process.env.DATA_DIR || 'data';
      mkdirSync(dataDir, { recursive: true });
      this.sqlite = new DatabaseSync(path.resolve(dataDir, 'scrapbook.sqlite'));
      this.sqlite.exec(
        'PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, owner TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,id)); CREATE INDEX IF NOT EXISTS records_owner ON records(kind,owner);',
      );
    }
  }
  async query(sql: string, values: (string | number)[] = []): Promise<Record<string, unknown>[]> {
    if (this.postgres) {
      let i = 0;
      return (
        await (this.migrationClient.getStore() || this.postgres).query(
          sql.replace(/\?/g, () => `$${++i}`),
          values,
        )
      ).rows;
    }
    const execute = async () =>
      this.sqlite!.prepare(sql).all(...values) as Record<string, unknown>[];
    return this.sqliteContext.getStore() ? execute() : this.exclusive(execute);
  }
  async transaction<T>(action: () => Promise<T>, readOnly = false): Promise<T> {
    if (this.postgres) {
      if (this.migrationClient.getStore()) return action();
      const client = await this.postgres.connect();
      try {
        await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
        const result = await this.migrationClient.run(client, action);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    if (this.sqliteContext.getStore()) return action();
    return this.exclusive(() =>
      this.sqliteContext.run(true, async () => {
        this.sqlite!.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
        try {
          const result = await action();
          this.sqlite!.exec('COMMIT');
          return result;
        } catch (error) {
          this.sqlite!.exec('ROLLBACK');
          throw error;
        }
      }),
    );
  }
  async migrate(action: () => Promise<void>) {
    if (!this.postgres) {
      await this.transaction(action);
      return;
    }
    const client = await this.postgres.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(730219410)');
      await this.migrationClient.run(client, action);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async now() {
    const expression =
      this.driver === 'postgresql'
        ? 'CAST(EXTRACT(EPOCH FROM clock_timestamp()) * 1000 AS BIGINT)'
        : "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
    return Number((await this.query(`SELECT ${expression} AS now_ms`))[0].now_ms);
  }
  /** Dedicated maintenance connection only; never call on a shared HTTP repository. */
  async hasTable(name: string) {
    return (
      (
        await this.query(
          this.driver === 'postgresql'
            ? 'SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=?'
            : "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          [name],
        )
      ).length > 0
    );
  }
  async maintenanceTransaction<T>(action: () => Promise<T>, readOnly = false): Promise<T> {
    if (this.postgres) {
      const client = await this.postgres.connect();
      try {
        await client.query(`BEGIN ISOLATION LEVEL REPEATABLE READ${readOnly ? ' READ ONLY' : ''}`);
        const result = await this.migrationClient.run(client, action);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    return this.transaction(action, readOnly);
  }
  async get<T>(kind: string, id: string): Promise<T | undefined> {
    const rows = await this.query('SELECT payload FROM records WHERE kind=? AND id=?', [kind, id]);
    return rows[0] ? (JSON.parse(String(rows[0].payload)) as T) : undefined;
  }
  async owner(kind: string, id: string): Promise<string | undefined> {
    return (await this.query('SELECT owner FROM records WHERE kind=? AND id=?', [kind, id]))[0]
      ?.owner as string | undefined;
  }
  async list<T>(kind: string, owner?: string): Promise<T[]> {
    const rows = await this.query(
      `SELECT payload FROM records WHERE kind=?${owner ? ' AND owner=?' : ''}`,
      owner ? [kind, owner] : [kind],
    );
    return rows.map((r) => JSON.parse(String(r.payload)) as T);
  }
  async put(kind: string, id: string, owner: string, value: unknown, revision = 0) {
    await this.query(
      'INSERT INTO records (kind,id,owner,payload,revision) VALUES (?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload, revision=excluded.revision, owner=excluded.owner RETURNING id',
      [kind, id, owner, JSON.stringify(value), revision],
    );
  }
  async insert(kind: string, id: string, owner: string, value: unknown): Promise<boolean> {
    return (
      (
        await this.query(
          'INSERT INTO records (kind,id,owner,payload,revision) VALUES (?,?,?,?,0) ON CONFLICT(kind,id) DO NOTHING RETURNING id',
          [kind, id, owner, JSON.stringify(value)],
        )
      ).length > 0
    );
  }
  async compareAndSwap(
    kind: string,
    id: string,
    owner: string,
    expected: number,
    value: unknown,
  ): Promise<boolean> {
    return (
      (
        await this.query(
          'UPDATE records SET payload=?, revision=? WHERE kind=? AND id=? AND owner=? AND revision=? RETURNING id',
          [JSON.stringify(value), expected + 1, kind, id, owner, expected],
        )
      ).length > 0
    );
  }
  async remove(kind: string, id: string) {
    await this.query('DELETE FROM records WHERE kind=? AND id=? RETURNING id', [kind, id]);
  }
  async close() {
    this.sqlite?.close();
    await this.postgres?.end();
  }
}
