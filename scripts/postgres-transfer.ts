import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, mkdtemp, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { postgresConfig } from '../apps/api/src/postgres-config.js';

export class TransferError extends Error {}
export type TransferConfig = {
  sourceUrl: string;
  targetUrl: string;
  sourceCaFile?: string;
  targetCaFile: string;
  outputDirectory: string;
};
export type PgTools = (
  side: 'source' | 'target' | null,
  executable: 'pg_dump' | 'pg_restore',
  args: string[],
) => Promise<string>;
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const inside = (base: string, destination: string) => {
  const relative = path.relative(base, destination);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
};
export function connectionConfig(url: string, caFile?: string) {
  return {
    ...postgresConfig(url, {
      DATABASE_POOL_MAX: '1',
      ...(caFile ? { DATABASE_CA_CERT_FILE: caFile } : {}),
    }),
    statement_timeout: 60000,
    query_timeout: 65000,
  };
}
export function validateTransferConfig(input: TransferConfig) {
  if (!input?.sourceUrl || !input.targetUrl)
    throw new TransferError('Điền sourceUrl và targetUrl trong file cấu hình riêng tư.');
  const parse = (url: string) => {
    try {
      connectionConfig(url);
      const result = new URL(url);
      if (
        !result.hostname ||
        result.searchParams.has('host') ||
        result.searchParams.has('port') ||
        result.searchParams.has('dbname')
      )
        throw new Error();
      if (!/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(decodeURIComponent(result.pathname.slice(1))))
        throw new Error();
      return result;
    } catch {
      throw new TransferError(
        'Connection URI chưa hợp lệ. Kiểm tra lại trong file riêng tư; không gửi URI vào chat.',
      );
    }
  };
  const a = parse(input.sourceUrl),
    b = parse(input.targetUrl);
  if (
    a.hostname === b.hostname &&
    (a.port || '5432') === (b.port || '5432') &&
    a.pathname === b.pathname
  )
    throw new TransferError('Database nguồn và đích phải khác nhau.');
  for (const [url, ca] of [
    [a, input.sourceCaFile],
    [b, input.targetCaFile],
  ] as const)
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !ca &&
      url.searchParams.get('sslmode') === 'disable'
    )
      throw new TransferError('Kết nối database cloud phải dùng TLS.');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(b.hostname) && !input.targetCaFile)
    throw new TransferError('Cần targetCaFile trỏ tới CA của dịch vụ Aiven.');
  if (!input.outputDirectory)
    throw new TransferError('Cần outputDirectory riêng tư cho dump và báo cáo.');
  if (
    !['backups', 'test-results'].some((root) =>
      inside(path.resolve(root), path.resolve(input.outputDirectory)),
    )
  )
    throw new TransferError(
      'outputDirectory phải nằm trong backups/ hoặc test-results/ đã được Git ignore.',
    );
  connectionConfig(input.sourceUrl, input.sourceCaFile);
  connectionConfig(input.targetUrl, input.targetCaFile);
}
const appObjects = `n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.classid='pg_class'::regclass AND d.deptype='e')`;
async function tables(client: pg.Client) {
  return (
    await client.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${appObjects} AND c.relkind IN ('r','p','m') ORDER BY c.relname`,
    )
  ).rows.map((r) => String(r.relname));
}
async function inspect(client: pg.Client, source: boolean) {
  const info = (
    await client.query(
      "SELECT current_schema() AS schema,current_database() AS database,inet_server_addr()::text AS address,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,pg_database_size(current_database()) AS bytes",
    )
  ).rows[0];
  if (info.schema !== 'public')
    throw new TransferError('Quy trình này chỉ hỗ trợ schema public; cần xử lý riêng schema khác.');
  const names = await tables(client);
  if (
    source &&
    ![
      'records',
      'render_jobs',
      'managed_media',
      'album_versions',
      'account_deletions',
      'backup_lease',
      'owner_operations',
    ].every((t) => names.includes(t))
  )
    throw new TransferError('Nguồn không có đủ schema Little Days hiện hành. Kiểm tra sourceUrl.');
  const otherSchemas = (
    await client.query(
      "SELECT nspname FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=pg_namespace.oid AND d.classid='pg_namespace'::regclass AND d.deptype='e')",
    )
  ).rows;
  if (otherSchemas.length)
    throw new TransferError('Database có schema riêng ngoài public; không tự bỏ qua dữ liệu đó.');
  return { ...info, names };
}
async function assertEmpty(client: pg.Client) {
  const objects = await client.query(
    `SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${appObjects} AND c.relkind IN ('r','p','m','v','S','f') LIMIT 1`,
  );
  const functions = await client.query(
    "SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e') LIMIT 1",
  );
  const types = await client.query(
    "SELECT t.oid FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','d','c','r','m') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=t.oid AND d.classid='pg_type'::regclass AND d.deptype='e') LIMIT 1",
  );
  if (objects.rowCount || functions.rowCount || types.rowCount)
    throw new TransferError('Database đích phải trống. Không tự xóa hoặc ghi đè dữ liệu đích.');
}
async function quiescent(source: pg.Client) {
  const now = 'CAST(EXTRACT(EPOCH FROM clock_timestamp())*1000 AS BIGINT)';
  const result = await source.query(
    `SELECT EXISTS(SELECT 1 FROM owner_operations WHERE expires_at>${now}) OR EXISTS(SELECT 1 FROM render_jobs WHERE queue_state='running' AND lease_until>${now}) OR EXISTS(SELECT 1 FROM backup_lease WHERE lease_until>${now}) OR EXISTS(SELECT 1 FROM account_deletions WHERE state<>'completed') OR EXISTS(SELECT 1 FROM records WHERE kind='worker' AND (payload::jsonb->>'lastSeen')::bigint>${now}-15000) AS busy`,
  );
  if (result.rows[0].busy)
    throw new TransferError(
      'Nguồn còn thao tác/worker/backup/cleanup đang hoạt động. Đợi hoàn tất trước khi chuyển.',
    );
}
type Fingerprint = {
  tables: Record<string, { rows: number; sum: string; xor: string }>;
  schema: string;
};
async function fingerprint(client: pg.Client): Promise<Fingerprint> {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const result: Fingerprint = { tables: {}, schema: '' };
    for (const name of await tables(client)) {
      let count = 0,
        sum = 0n,
        xor = 0n;
      await client.query(
        `DECLARE transfer_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row FROM public.${quote(name)} t`,
      );
      while (true) {
        const rows = (await client.query('FETCH 10 FROM transfer_rows')).rows;
        if (!rows.length) break;
        for (const row of rows) {
          const hash = BigInt('0x' + createHash('sha256').update(String(row.row)).digest('hex'));
          sum = (sum + hash) % (1n << 256n);
          xor ^= hash;
          count++;
        }
      }
      await client.query('CLOSE transfer_rows');
      result.tables[name] = { rows: count, sum: sum.toString(16), xor: xor.toString(16) };
    }
    const definitions = await client.query(
      `SELECT 'column:'||table_name||':'||ordinal_position AS key,concat_ws('|',column_name,data_type,udt_name,is_nullable,column_default) AS value FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])
      UNION ALL SELECT 'index:'||tablename||':'||indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1::text[])
      UNION ALL SELECT 'trigger:'||c.relname||':'||t.tgname,pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${appObjects} AND NOT t.tgisinternal
      UNION ALL SELECT 'function:'||p.proname||':'||pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e')
      UNION ALL SELECT 'constraint:'||c.relname||':'||co.conname,pg_get_constraintdef(co.oid) FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${appObjects}
      ORDER BY key`,
      [Object.keys(result.tables)],
    );
    result.schema = createHash('sha256').update(JSON.stringify(definitions.rows)).digest('hex');
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}
export function restoreList(list: string) {
  return list
    .split(/\r?\n/)
    .filter((line) => !/^\d+; \d+ \d+ SCHEMA - public(?: |$)/.test(line))
    .join('\n');
}
export async function transferPostgres(
  config: TransferConfig,
  action: 'check' | 'check-target' | 'transfer' | 'verify',
  tools?: PgTools,
  sourceStopped = false,
) {
  validateTransferConfig(config);
  const source = new pg.Client(connectionConfig(config.sourceUrl, config.sourceCaFile)),
    target = new pg.Client(connectionConfig(config.targetUrl, config.targetCaFile));
  try {
    if (action === 'check-target') {
      await target.connect();
      await target.query('SET default_transaction_read_only=on');
      const info = await inspect(target, false);
      await assertEmpty(target);
      return {
        action,
        targetMajor: Math.floor(info.version / 10000),
        targetBytes: Number(info.bytes),
        targetEmpty: true,
        copied: false,
      };
    }
    await source.connect().catch((e) => {
      if (e?.code === '53000')
        throw new TransferError(
          'Database nguồn từ chối kết nối do quota/tài nguyên (53000). Chưa chuyển dữ liệu; không đổi DATABASE_URL trên Render.',
        );
      throw new TransferError(
        'Không kết nối được database nguồn. Kiểm tra URI/CA/quyền trong cấu hình riêng tư.',
      );
    });
    await source.query('SET default_transaction_read_only=on');
    await target.connect();
    await target.query('SET default_transaction_read_only=on');
    const a = await inspect(source, true),
      b = await inspect(target, false);
    if (a.database === b.database && a.address === b.address && a.port === b.port)
      throw new TransferError('Nguồn và đích là cùng một database.');
    if (Math.floor(b.version / 10000) < Math.floor(a.version / 10000))
      throw new TransferError('PostgreSQL đích không được thấp hơn phiên bản nguồn.');
    if (Number(a.bytes) > 512 * 1048576)
      throw new TransferError(
        'Nguồn vượt 512 MiB. Cần đánh giá dung lượng trước khi dùng Aiven Free 1 GB.',
      );
    if (action === 'check') {
      await assertEmpty(target);
      return {
        action,
        sourceMajor: Math.floor(a.version / 10000),
        targetMajor: Math.floor(b.version / 10000),
        sourceTables: a.names.length,
        sourceBytes: Number(a.bytes),
        targetEmpty: true,
        copied: false,
      };
    }
    if (action === 'transfer' && (!sourceStopped || !tools))
      throw new TransferError(
        'Dừng API/worker và lịch backup trước, rồi dùng --source-stopped để thực hiện.',
      );
    if (action === 'transfer') await assertEmpty(target);
    await quiescent(source);
    const before = await fingerprint(source);
    if (action === 'verify') {
      const after = await fingerprint(target);
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new TransferError('Dữ liệu hoặc schema hai database chưa khớp. Không cutover.');
      return { action, verified: true, tables: Object.keys(before.tables).length };
    }
    const base = path.resolve(config.outputDirectory);
    await mkdir(base, { recursive: true, mode: 0o700 });
    const root = ['backups', 'test-results']
      .map((p) => path.resolve(p))
      .find((p) => inside(p, base))!;
    if (!inside(root, await realpath(base)) || path.relative(root, await realpath(root)))
      throw new TransferError(
        'Không ghi dump qua symlink/junction ra khỏi thư mục backup riêng tư.',
      );
    const output = await mkdtemp(path.join(base, 'transfer-' + randomUUID().slice(0, 8) + '-'));
    const dump = path.join(output, 'database.pgdump'),
      list = path.join(output, 'restore.list');
    await tools!('source', 'pg_dump', [
      '--format=custom',
      '--schema=public',
      '--no-owner',
      '--no-acl',
      '--file',
      dump,
    ]);
    if ((await stat(dump)).size === 0)
      throw new TransferError('Dump rỗng; chưa ghi database đích.');
    await writeFile(list, restoreList(await tools!(null, 'pg_restore', ['--list', dump])), {
      mode: 0o600,
    });
    const unchanged = await fingerprint(source);
    if (JSON.stringify(before) !== JSON.stringify(unchanged))
      throw new TransferError(
        'Nguồn đã đổi trong lúc dump. Không restore; giữ API ở nguồn để đối soát.',
      );
    await quiescent(source);
    await assertEmpty(target);
    await tools!('target', 'pg_restore', [
      '--dbname',
      decodeURIComponent(new URL(config.targetUrl).pathname.slice(1)) || 'postgres',
      '--single-transaction',
      '--exit-on-error',
      '--no-owner',
      '--no-acl',
      '--use-list',
      list,
      dump,
    ]);
    const copied = await fingerprint(target),
      final = await fingerprint(source);
    if (
      JSON.stringify(before) !== JSON.stringify(copied) ||
      JSON.stringify(before) !== JSON.stringify(final)
    )
      throw new TransferError(
        'Đối soát sau restore chưa khớp. Giữ nguồn, chưa đổi DATABASE_URL trên Render.',
      );
    const report = {
      completed: true,
      verified: true,
      sourcePreserved: true,
      mediaCopied: false,
      sourceMajor: Math.floor(a.version / 10000),
      targetMajor: Math.floor(b.version / 10000),
      fingerprint: before,
    };
    await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2), {
      mode: 0o600,
    });
    return {
      action,
      verified: true,
      sourcePreserved: true,
      mediaCopied: false,
      tables: Object.keys(before.tables).length,
      output,
    };
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}
