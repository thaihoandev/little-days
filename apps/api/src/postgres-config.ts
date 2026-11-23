import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import type { PoolConfig } from 'pg';

type Environment = Record<string, string | undefined>;
export function postgresConfig(
  connectionString: string,
  env: Environment = process.env,
): PoolConfig {
  let url: URL;
  try {
    url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) throw new Error();
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
  } catch {
    throw new Error('DATABASE_URL phải là PostgreSQL URI hợp lệ.');
  }
  const max = Number(env.DATABASE_POOL_MAX || 5);
  if (!Number.isInteger(max) || max < 1 || max > 20)
    throw new Error('DATABASE_POOL_MAX phải là số nguyên từ 1 đến 20.');
  if (env.DATABASE_CA_CERT && env.DATABASE_CA_CERT_FILE)
    throw new Error('Chỉ cấu hình một trong DATABASE_CA_CERT hoặc DATABASE_CA_CERT_FILE.');
  let ca = env.DATABASE_CA_CERT;
  if (env.DATABASE_CA_CERT_FILE) {
    try {
      ca = readFileSync(env.DATABASE_CA_CERT_FILE, 'utf8');
    } catch {
      throw new Error('Không đọc được DATABASE_CA_CERT_FILE.');
    }
  }
  const result: PoolConfig = {
    connectionString,
    max,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  };
  if (ca) {
    ca = ca.replace(/\\n/g, '\n').trim();
    try {
      new X509Certificate(ca);
    } catch {
      throw new Error('DATABASE_CA_CERT phải chứa chứng chỉ CA PEM hợp lệ.');
    }
    // pg's URL SSL options otherwise replace the explicit, verified CA config.
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl', 'uselibpqcompat'])
      url.searchParams.delete(key);
    result.connectionString = url.toString();
    result.ssl = { ca, rejectUnauthorized: true };
  }
  return result;
}
