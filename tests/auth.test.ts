import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { Repository } from '../apps/api/src/database.js';
import {
  AccountSecurity,
  authHash,
  passwordHash,
  passwordMatches,
  type Account,
} from '../apps/api/src/auth.js';
import { createMailer, type Mail } from '../apps/api/src/mail.js';

async function fixture(databaseUrl = process.env.TEST_DATABASE_URL || '') {
  const db = new Repository({
    dataDir: path.resolve('test-results/auth', crypto.randomUUID()),
    databaseUrl,
  });
  await db.init();
  const mails: Mail[] = [];
  const security = new AccountSecurity(
    db,
    {
      kind: 'test',
      async send(mail) {
        mails.push(mail);
      },
      close() {},
    },
    'http://127.0.0.1:5173',
  );
  await security.init();
  const owner = crypto.randomUUID(),
    email = owner + '@example.test',
    salt = crypto.randomUUID();
  const account: Account = {
    id: owner,
    email,
    salt,
    password: (await passwordHash('original-password', salt)).toString('hex'),
  };
  await db.put('account', authHash(email), owner, account);
  const token = () =>
    new URLSearchParams(new URL(mails.at(-1)!.text.match(/http[^\s]+/)![0]).hash.slice(1)).get(
      'token',
    )!;
  return { db, security, mails, account, token };
}
test('verification tokens are hashed, purpose-bound, expiring and single-use under concurrent requests', async () => {
  const f = await fixture();
  try {
    await f.security.requestVerification(f.account.id);
    const token = f.token();
    const row = (await f.db.query('SELECT * FROM auth_tokens'))[0];
    assert.equal(row.token_hash, authHash(token));
    assert.ok(!JSON.stringify(row).includes(token));
    await assert.rejects(f.security.consume(token, 'reset-password', 'new-password-123'));
    const outcomes = await Promise.allSettled([
      f.security.consume(token, 'verify-email'),
      f.security.consume(token, 'verify-email'),
    ]);
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    assert.ok((await f.security.byUser(f.account.id))?.emailVerifiedAt);
    assert.ok(await passwordMatches('original-password', await f.security.byUser(f.account.id)));
    await f.security.requestReset(f.account.email);
    const expired = f.token();
    await f.db.query('UPDATE auth_tokens SET expires_at=? WHERE token_hash=?', [
      (await f.db.now()) - 1,
      authHash(expired),
    ]);
    await assert.rejects(f.security.consume(expired, 'reset-password', 'new-password-123'));
  } finally {
    await f.db.close();
  }
});
test('password reset/change revoke existing sessions and outstanding reset tokens', async () => {
  const f = await fixture();
  try {
    const oldSession = { userId: f.account.id, expires: Date.now() + 60000 };
    assert.ok(await f.security.validSession(oldSession));
    await f.security.requestReset(f.account.email);
    const first = f.token();
    await f.security.requestReset(f.account.email);
    const second = f.token();
    const reset = await f.security.consume(first, 'reset-password', 'replacement-password');
    assert.ok(!(await f.security.validSession(oldSession)));
    assert.ok(
      await f.security.validSession({ ...oldSession, credentialVersion: reset.credentialVersion }),
    );
    await assert.rejects(f.security.consume(second, 'reset-password', 'stale-password-123'));
    assert.ok(!(await passwordMatches('original-password', reset)));
    assert.ok(await passwordMatches('replacement-password', reset));
    await assert.rejects(
      f.security.changePassword(reset.id, 'wrong-password', 'next-password-123'),
    );
    const changed = await f.security.changePassword(
      reset.id,
      'replacement-password',
      'next-password-123',
    );
    assert.ok(
      !(await f.security.validSession({
        ...oldSession,
        credentialVersion: reset.credentialVersion,
      })),
    );
    assert.ok(await passwordMatches('next-password-123', changed));
    const count = f.mails.length;
    await f.security.requestReset('unknown@example.test');
    assert.equal(f.mails.length, count);
  } finally {
    await f.db.close();
  }
});
test('token consumption rolls back if changing account credentials fails', async () => {
  const f = await fixture('');
  try {
    await f.security.requestReset(f.account.email);
    const token = f.token();
    await f.db.query(
      "CREATE TRIGGER fail_account BEFORE UPDATE OF payload ON records WHEN OLD.kind='account' BEGIN SELECT RAISE(ABORT,'account unavailable'); END",
    );
    await assert.rejects(
      f.security.consume(token, 'reset-password', 'replacement-password'),
      /account unavailable/,
    );
    assert.equal(
      (await f.db.query('SELECT used_at FROM auth_tokens WHERE token_hash=?', [authHash(token)]))[0]
        .used_at,
      null,
    );
    assert.ok(await passwordMatches('original-password', await f.security.byUser(f.account.id)));
    await f.db.query('DROP TRIGGER fail_account');
    assert.ok(await f.security.consume(token, 'reset-password', 'replacement-password'));
  } finally {
    await f.db.close();
  }
});
test('SQLite transactions isolate unrelated requests and rate limiting is atomic', async () => {
  const f = await fixture('');
  try {
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => (started = resolve)),
      gate = new Promise<void>((resolve) => (release = resolve));
    const transaction = f.db.transaction(async () => {
      await f.db.put('test', 'inside', 'owner', { value: 1 });
      started();
      await gate;
      throw new Error('rollback');
    });
    await ready;
    let outsideDone = false;
    const outside = f.db
      .put('test', 'outside', 'owner', { value: 2 })
      .then(() => (outsideDone = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(outsideDone, false);
    release();
    await assert.rejects(transaction);
    await outside;
    assert.equal(await f.db.get('test', 'inside'), undefined);
    assert.deepEqual(await f.db.get('test', 'outside'), { value: 2 });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => f.security.rateLimit('same-key', 3, 60000)),
    );
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 3);
  } finally {
    await f.db.close();
  }
});
test('SMTP requires TLS before sending authentication or mail and local mail is refused in production', async () => {
  assert.throws(() =>
    createMailer('test-results', { MAIL_DRIVER: 'local', NODE_ENV: 'production' }),
  );
  const commands: string[] = [];
  const server = createServer((socket) => {
    socket.write('220 localhost SMTP\r\n');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n'),
          line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        commands.push(line);
        socket.write(
          line.startsWith('EHLO')
            ? '250 localhost\r\n'
            : line === 'QUIT'
              ? '221 Bye\r\n'
              : '454 TLS unavailable\r\n',
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const mail = createMailer('test-results', {
    MAIL_DRIVER: 'smtp',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String((server.address() as AddressInfo).port),
    SMTP_USER: 'fixture',
    SMTP_PASSWORD: 'fixture-only',
    MAIL_FROM: 'sender@example.test',
  });
  try {
    await assert.rejects(
      mail.send({ to: 'recipient@example.test', subject: 'Test', text: 'Not sent without TLS' }),
    );
    assert.ok(!commands.some((command) => /^(AUTH|MAIL|RCPT|DATA)/.test(command)));
  } finally {
    mail.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
