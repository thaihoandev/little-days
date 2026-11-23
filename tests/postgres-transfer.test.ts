import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { BackupLock } from '../apps/api/src/backup-lock.js';
import {
  restoreList,
  transferPostgres,
  validateTransferConfig,
  type PgTools,
} from '../scripts/postgres-transfer.js';

test('database transfer rejects same endpoint, cloud plaintext, missing CA and credential-in-argument database names', () => {
  const base = {
    sourceUrl: 'postgresql://qa:fixture@127.0.0.1/source_qa?sslmode=disable',
    targetUrl: 'postgresql://qa:fixture@127.0.0.1/target_qa?sslmode=disable',
    targetCaFile: '',
    outputDirectory: 'test-results/transfer',
  };
  validateTransferConfig(base);
  assert.throws(() => validateTransferConfig({ ...base, outputDirectory: 'deploy' }), /Git ignore/);
  assert.throws(() => validateTransferConfig({ ...base, targetUrl: base.sourceUrl }), /khác nhau/);
  assert.throws(
    () =>
      validateTransferConfig({
        ...base,
        targetUrl: 'postgresql://qa:fixture@cloud.example/defaultdb?sslmode=disable',
      }),
    /TLS/,
  );
  assert.throws(
    () =>
      validateTransferConfig({
        ...base,
        targetUrl: 'postgresql://qa:fixture@cloud.example/defaultdb?sslmode=require',
      }),
    /CA/,
  );
  assert.throws(
    () =>
      validateTransferConfig({
        ...base,
        targetUrl: 'postgresql://qa:fixture@127.0.0.1/postgres%3A%2F%2Fother',
      }),
    /URI/,
  );
  const toc =
    '1; 2615 2200 SCHEMA - public qa\n2; 1259 1 TABLE public records qa\n3; 1259 2 TABLE DATA public records qa\n';
  assert.equal(restoreList(toc).includes('SCHEMA - public'), false);
  assert.equal(restoreList(toc).includes('TABLE DATA public records'), true);
});

const uri = process.env.TEST_DATABASE_URL,
  container = process.env.QA_PG_CLIENT_CONTAINER;
test(
  'PostgreSQL dump/restore preserves all application tables, tombstones, triggers and source; rejects occupied target and concurrent source changes',
  { skip: !uri || !container },
  async () => {
    assert.ok(['127.0.0.1', 'localhost'].includes(new URL(uri!).hostname));
    assert.match(container!, /^[a-zA-Z0-9_-]+$/);
    await mkdir('test-results/postgres-transfer', { recursive: true });
    const root = await mkdtemp(path.resolve('test-results/postgres-transfer/qa-'));
    const admin = new pg.Client({ connectionString: uri });
    await admin.connect();
    const names = ['qa_source_', 'qa_target_', 'qa_race_'].map(
      (p) => p + randomUUID().replaceAll('-', ''),
    );
    const urls = names.map((name) => {
      const u = new URL(uri!);
      u.pathname = '/' + name;
      u.searchParams.delete('options');
      u.searchParams.set('sslmode', 'disable');
      return u.toString();
    });
    let db: Repository | undefined;
    const docker = (args: string[], input?: Buffer, env: NodeJS.ProcessEnv = {}) =>
      new Promise<Buffer>((resolve, reject) => {
        const child = spawn('docker', args, {
          windowsHide: true,
          env: { ...process.env, ...env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const chunks: Buffer[] = [],
          errors: Buffer[] = [];
        child.stdout.on('data', (b) => chunks.push(b));
        child.stderr.on('data', (b) => errors.push(b));
        child.on('error', reject);
        child.on('close', (code) =>
          code === 0
            ? resolve(Buffer.concat(chunks))
            : reject(new Error('QA PostgreSQL client failed: ' + Buffer.concat(errors).toString())),
        );
        child.stdin.on('error', () => {});
        child.stdin.end(input);
      });
    const temporary = '/tmp/qa-transfer-' + randomUUID();
    const tools: PgTools = async (side, command, args) => {
      const u = new URL(side === 'target' ? urls[1] : urls[0]);
      const env = {
        PGHOST: '127.0.0.1',
        PGPORT: '5432',
        PGUSER: decodeURIComponent(u.username),
        PGPASSWORD: decodeURIComponent(u.password),
        PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
        PGSSLMODE: 'disable',
      };
      const prefix = ['exec', '-i', ...Object.keys(env).flatMap((k) => ['--env', k]), container!];
      if (command === 'pg_dump') {
        const index = args.indexOf('--file'),
          dest = args[index + 1],
          plain = args.filter((_, i) => i !== index && i !== index + 1);
        await writeFile(dest, await docker([...prefix, command, ...plain], undefined, env));
        return '';
      }
      const dump = args.at(-1)!;
      if (args.includes('--list'))
        return (await docker([...prefix, command, '--list'], await readFile(dump), env)).toString();
      const list = args[args.indexOf('--use-list') + 1];
      for (const [src, dest] of [
        [dump, temporary + '.dump'],
        [list, temporary + '.list'],
      ])
        await docker(
          ['exec', '-i', container!, 'sh', '-c', 'cat > "$1"', '--', dest],
          await readFile(src),
        );
      const mapped = args.map((a) =>
        a === dump ? temporary + '.dump' : a === list ? temporary + '.list' : a,
      );
      await docker([...prefix, command, ...mapped], undefined, env);
      return '';
    };
    try {
      for (const name of names) await admin.query('CREATE DATABASE "' + name + '"');
      db = new Repository({ dataDir: root, databaseUrl: urls[0] });
      await db.init();
      const jobs = new JobRepository(db);
      await jobs.init();
      await new AlbumHistory(db).init();
      const store = new LocalMediaStore(root);
      await store.ready();
      await new AccountDeletion(db, jobs, store, root).init();
      await new ResourcePolicy(db, store).init();
      await new BackupLock(db).init();
      await db.put('account', 'fixture-account', 'actor', {
        id: 'actor',
        email: 'qa@fixture.test',
        password: 'fake-hash',
        revision: 0,
      });
      await db.put('album', 'fixture-album', 'actor', {
        title: 'Kỉ niệm QA',
        pages: [],
        assets: [],
        revision: 0,
      });
      await db.put('archive-import-receipt', 'fixture-receipt', 'actor', {
        completed: true,
        targetId: 'fixture-album',
      });
      await db.query(
        "INSERT INTO account_deletions(owner,receipt_hash,state,created_at,completed_at,available_at,storage_id) VALUES('deleted-qa',?,'completed',0,0,0,'fixture')",
        [randomUUID()],
      );
      const config = {
        sourceUrl: urls[0],
        targetUrl: urls[1],
        targetCaFile: '',
        outputDirectory: root,
      };
      const unreachable = new URL(urls[0]);
      unreachable.port = '1';
      assert.equal(
        (await transferPostgres({ ...config, sourceUrl: unreachable.toString() }, 'check-target'))
          .targetEmpty,
        true,
      );
      assert.equal((await transferPostgres(config, 'check')).copied, false);
      await assert.rejects(() => transferPostgres(config, 'transfer', tools), /Dừng API/);
      const result = await transferPostgres(config, 'transfer', tools, true);
      assert.equal(result.verified, true);
      assert.equal((await transferPostgres(config, 'verify')).verified, true);
      const target = new Repository({ dataDir: root, databaseUrl: urls[1] });
      await target.init();
      try {
        assert.equal((await target.get<any>('account', 'fixture-account')).password, 'fake-hash');
        assert.equal(
          (await target.get<any>('archive-import-receipt', 'fixture-receipt')).completed,
          true,
        );
        await assert.rejects(
          () => target.put('profile', 'forbidden', 'deleted-qa', {}),
          /account_deleting/,
        );
        await assert.rejects(() => transferPostgres(config, 'transfer', tools, true), /phải trống/);
        await target.put('profile', 'actor', 'actor', { displayName: 'Đích đã đổi' });
        await assert.rejects(() => transferPostgres(config, 'verify'), /chưa khớp/);
        assert.equal(await db.get('profile', 'actor'), undefined);
        const raceConfig = { ...config, targetUrl: urls[2] };
        const racingTools: PgTools = async (side, command, args) => {
          const output = await tools(side, command, args);
          if (command === 'pg_dump')
            await db!.put('profile', 'concurrent-qa', 'actor', { changed: true });
          return output;
        };
        await assert.rejects(
          () => transferPostgres(raceConfig, 'transfer', racingTools, true),
          /Nguồn đã đổi/,
        );
        assert.equal((await transferPostgres(raceConfig, 'check')).targetEmpty, true);
      } finally {
        await target.close();
      }
    } finally {
      await db?.close();
      await docker([
        'exec',
        container!,
        'rm',
        '-f',
        '--',
        temporary + '.dump',
        temporary + '.list',
      ]).catch(() => {});
      for (const name of names)
        await admin.query('DROP DATABASE IF EXISTS "' + name + '" WITH (FORCE)');
      await admin.end();
    }
  },
);
