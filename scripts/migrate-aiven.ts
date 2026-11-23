import { readFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import {
  connectionConfig,
  transferPostgres,
  TransferError,
  validateTransferConfig,
  type TransferConfig,
  type PgTools,
} from './postgres-transfer.js';

process.umask(0o077);
const argv = process.argv.slice(2),
  action = argv.shift();
if (
  !['check', 'check-target', 'transfer', 'verify'].includes(action || '') ||
  argv.some((a) => a !== '--source-stopped')
) {
  console.error(
    'Dùng db:aiven:check, db:aiven:transfer -- --source-stopped hoặc db:aiven:verify. Cấu hình chỉ đọc từ .secrets/aiven-migration.json.',
  );
  process.exit(1);
}
let stage = 'configuration';
const safeRun = (args: string[], env: NodeJS.ProcessEnv) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn('docker', args, {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      const name = args[args.indexOf('--name') + 1];
      const stop = spawn('docker', ['stop', '--time', '5', name], {
        windowsHide: true,
        stdio: 'ignore',
      });
      stop.on('error', () => {});
      child.kill();
      reject(
        new TransferError(
          'Client hết thời gian. Không cutover; kiểm tra container và đối soát đích trước khi thử lại.',
        ),
      );
    }, 10 * 60000);
    timer.unref();
    let output = '',
      bytes = 0;
    child.stdout.on('data', (d) => {
      bytes += d.length;
      if (bytes <= 4 * 1048576) output += String(d);
    });
    // Never forward CLI diagnostics: they can include connection credentials or private row data.
    child.stderr.on('data', () => {});
    child.once('error', () => {
      clearTimeout(timer);
      reject(
        new TransferError(
          'Không chạy được Docker PostgreSQL client. Mở Docker Desktop trước khi transfer.',
        ),
      );
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      return code === 0 && bytes <= 4 * 1048576
        ? resolve(output)
        : reject(
            new TransferError(
              'PostgreSQL client không hoàn tất. Dữ liệu nguồn được giữ; kiểm tra cấu hình và đối soát trước khi thử lại.',
            ),
          );
    });
  });
try {
  const config = JSON.parse(
    await readFile('.secrets/aiven-migration.json', 'utf8'),
  ) as TransferConfig;
  validateTransferConfig(config);
  const tools: PgTools = async (side, command, args) => {
    stage = command;
    const source = new pg.Client(connectionConfig(config.sourceUrl, config.sourceCaFile));
    let version: number;
    try {
      await source.connect();
      version = Number((await source.query('SHOW server_version_num')).rows[0].server_version_num);
    } finally {
      await source.end();
    }
    const major = Math.floor(version! / 10000);
    if (major < 15 || major > 19)
      throw new TransferError('Phiên bản PostgreSQL client chưa được hỗ trợ.');
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
    const base = path.resolve(config.outputDirectory);
    await mkdir(base, { recursive: true, mode: 0o700 });
    const dockerArgs = [
      'run',
      '--rm',
      '--name',
      'little-days-transfer-client-' + randomUUID().slice(0, 12),
      '--network=bridge',
      '--add-host=host.docker.internal:host-gateway',
      '--mount',
      `type=bind,source=${base},target=/work`,
    ];
    if (side) {
      const url = new URL(side === 'source' ? config.sourceUrl : config.targetUrl);
      const caFile = side === 'source' ? config.sourceCaFile : config.targetCaFile;
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      Object.assign(env, {
        PGHOST: loopback ? 'host.docker.internal' : url.hostname,
        PGPORT: url.port || '5432',
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGCONNECT_TIMEOUT: '15',
        PGSSLMODE:
          loopback && url.searchParams.get('sslmode') === 'disable' ? 'disable' : 'verify-full',
        PGSSLROOTCERT: caFile ? '/run/db-ca.pem' : '/etc/ssl/certs/ca-certificates.crt',
      });
      if (caFile)
        dockerArgs.push(
          '--mount',
          `type=bind,source=${path.resolve(caFile)},target=/run/db-ca.pem,readonly`,
        );
      if (url.searchParams.get('channel_binding'))
        env.PGCHANNELBINDING = url.searchParams.get('channel_binding')!;
      if (url.searchParams.get('options')) env.PGOPTIONS = url.searchParams.get('options')!;
      for (const key of Object.keys(env).filter((k) => k.startsWith('PG')))
        dockerArgs.push('--env', key);
    }
    const mapped = args.map((arg) => {
      if (!path.isAbsolute(arg)) return arg;
      const relative = path.relative(base, arg);
      if (relative.startsWith('..') || path.isAbsolute(relative))
        throw new TransferError('Dump/list phải nằm trong outputDirectory riêng.');
      return '/work/' + relative.replaceAll('\\', '/');
    });
    return safeRun([...dockerArgs, `postgres:${major}-alpine`, command, ...mapped], env);
  };
  stage = action!;
  const result = await transferPostgres(
    config,
    action as 'check' | 'check-target' | 'transfer' | 'verify',
    tools,
    argv.includes('--source-stopped'),
  );
  console.log(JSON.stringify(result));
} catch (e) {
  const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
  console.error(
    JSON.stringify({
      stage,
      message:
        e instanceof TransferError
          ? e.message
          : 'Không hoàn tất. Kiểm tra URI/CA/quyền kết nối trong file riêng tư; không gửi secret vào chat.',
      ...(/^[A-Z0-9_]{2,40}$/.test(code) ? { code } : {}),
    }),
  );
  process.exitCode = 1;
}
