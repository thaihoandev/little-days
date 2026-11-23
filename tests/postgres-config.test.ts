import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { postgresConfig } from '../apps/api/src/postgres-config.js';

test('Postgres pool is bounded and existing Neon/loopback URL behavior is preserved without a custom CA', () => {
  const url = 'postgresql://qa:fixture@localhost/qa?sslmode=require';
  const result = postgresConfig(url, {});
  assert.equal(result.connectionString, url);
  assert.equal(result.ssl, undefined);
  assert.equal(result.max, 5);
  assert.equal(result.connectionTimeoutMillis, 10000);
  assert.equal(postgresConfig(url, { DATABASE_POOL_MAX: '2' }).max, 2);
  for (const max of ['0', '21', '1.5', 'no'])
    assert.throws(() => postgresConfig(url, { DATABASE_POOL_MAX: max }), /DATABASE_POOL_MAX/);
});
test('Aiven CA verification wins over URL SSL options without dropping non-SSL parameters', () => {
  const ca = readFileSync('tests/fixtures/smtp-test-cert.pem', 'utf8');
  const result = postgresConfig(
    'postgresql://qa:fixture@localhost/qa?sslmode=require&sslrootcert=bad-path&application_name=qa',
    { DATABASE_CA_CERT: ca.replace(/\n/g, '\\n') },
  );
  const url = new URL(result.connectionString!);
  assert.equal(url.searchParams.has('sslmode'), false);
  assert.equal(url.searchParams.has('sslrootcert'), false);
  assert.equal(url.searchParams.get('application_name'), 'qa');
  assert.deepEqual(result.ssl, { ca: ca.trim(), rejectUnauthorized: true });
  const fromFile = postgresConfig('postgresql://qa:fixture@localhost/qa', {
    DATABASE_CA_CERT_FILE: 'tests/fixtures/smtp-test-cert.pem',
  });
  assert.deepEqual(result.ssl, fromFile.ssl);
});
test('Malformed/unreadable/ambiguous CA fails closed without exposing credentials or paths', () => {
  const url = 'postgresql://qa:never-log-this@localhost/qa';
  for (const env of [
    { DATABASE_CA_CERT: 'invalid' },
    { DATABASE_CA_CERT_FILE: 'not-a-real-ca.pem' },
    { DATABASE_CA_CERT: 'a', DATABASE_CA_CERT_FILE: 'b' },
  ])
    assert.throws(
      () => postgresConfig(url, env),
      (e: Error) =>
        !e.message.includes('never-log-this') && !e.message.includes('not-a-real-ca.pem'),
    );
});
