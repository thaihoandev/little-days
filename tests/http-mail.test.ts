import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMailer, MailDeliveryError } from '../apps/api/src/mail.js';
import { AccountSecurity, authHash, passwordHash } from '../apps/api/src/auth.js';
import { Repository } from '../apps/api/src/database.js';
const message = {
  to: 'recipient@example.test',
  subject: 'Xác minh email Little Days',
  text: 'Mở https://app.example/#auth=verify-email&token=private-fixture-token',
};
const config = (provider: string) => ({
  NODE_ENV: 'production',
  MAIL_DRIVER: provider,
  MAIL_FROM: 'Little Days <sender@example.test>',
  BREVO_API_KEY: 'fixture-brevo-api-key',
  RESEND_API_KEY: 'fixture-resend-api-key',
});
for (const provider of ['brevo', 'resend']) {
  test(
    provider + ' uses its fixed HTTPS endpoint, correct headers and plaintext contract',
    async () => {
      let sent = 0;
      const mail = createMailer('unused', config(provider), {
        fetch: async (input, init) => {
          assert.equal(
            String(input),
            provider === 'brevo'
              ? 'https://api.brevo.com/v3/smtp/email'
              : 'https://api.resend.com/emails',
          );
          assert.equal(init?.method, 'POST');
          assert.equal(init?.redirect, 'error');
          assert.ok(init?.signal);
          const headers = new Headers(init?.headers);
          assert.equal(
            headers.get(provider === 'brevo' ? 'api-key' : 'Authorization'),
            provider === 'brevo' ? 'fixture-brevo-api-key' : 'Bearer fixture-resend-api-key',
          );
          const body = JSON.parse(String(init?.body));
          assert.equal(body.subject, message.subject);
          assert.equal(provider === 'brevo' ? body.textContent : body.text, message.text);
          assert.deepEqual(body.to, provider === 'brevo' ? [{ email: message.to }] : [message.to]);
          if (provider === 'brevo')
            assert.deepEqual(body.sender, { name: 'Little Days', email: 'sender@example.test' });
          else assert.equal(body.from, 'Little Days <sender@example.test>');
          sent++;
          return Response.json(
            provider === 'brevo' ? { messageId: '<fixture-message>' } : { id: 'fixture-message' },
            { status: 201 },
          );
        },
      });
      await mail.send(message);
      assert.equal(sent, 1);
      mail.close();
      await assert.rejects(mail.send(message), /closed/);
    },
  );
}
test('HTTP mail rejects missing keys, malformed sender and header injection before any network request', () => {
  for (const env of [
    { ...config('brevo'), BREVO_API_KEY: '' },
    { ...config('resend'), RESEND_API_KEY: '' },
    { ...config('brevo'), MAIL_FROM: 'not-an-email' },
    { ...config('brevo'), MAIL_FROM: 'Name <sender@example.test>\r\nBcc:someone@example.test' },
    { ...config('resend'), RESEND_API_KEY: 'key\nunsafe' },
  ])
    assert.throws(() => createMailer('unused', env));
});
test('HTTP mail hides provider response secrets and rejects error/malformed/oversize receipts without retries', async () => {
  for (const response of [
    new Response('secret-body-token', { status: 401 }),
    new Response('private recipient', { status: 403 }),
    new Response('quota', { status: 429 }),
    new Response('private url', { status: 500 }),
    Response.json({}),
    new Response('not-json'),
    Response.json({ messageId: 'x'.repeat(17000) }),
  ]) {
    let attempts = 0;
    const mail = createMailer('unused', config('brevo'), {
      fetch: async () => {
        attempts++;
        return response;
      },
    });
    await assert.rejects(
      mail.send(message),
      (error: unknown) =>
        error instanceof MailDeliveryError &&
        !/secret-body|recipient|private|fixture-token/.test(error.message),
    );
    assert.equal(attempts, 1);
    mail.close();
  }
});
test('HTTP mail aborts stalled requests and close cancels in-flight sends without leaking transport errors', async () => {
  const request: typeof fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(new Error('secret-fixture-transport'));
        return;
      }
      init?.signal?.addEventListener('abort', () => reject(new Error('secret-fixture-transport')), {
        once: true,
      });
    });
  const timer = setTimeout(() => {}, 200);
  try {
    const mail = createMailer('unused', config('brevo'), { fetch: request, timeoutMs: 20 });
    await assert.rejects(mail.send(message), /unavailable_or_invalid_response/);
    mail.close();
    const closing = createMailer('unused', config('resend'), { fetch: request });
    const pending = closing.send(message);
    closing.close();
    await assert.rejects(pending, /unavailable_or_invalid_response/);
  } finally {
    clearTimeout(timer);
  }
});
test('provider rejection invalidates undelivered auth token; accepted HTTPS receipts keep single-use verification/reset', async () => {
  const db = new Repository({
    dataDir: path.resolve('test-results/http-mail-auth', crypto.randomUUID()),
    databaseUrl: '',
  });
  await db.init();
  let reject = true;
  const received: string[] = [];
  const mail = createMailer('unused', config('brevo'), {
    fetch: async (_url, init) => {
      if (reject) return new Response('do not log this recipient', { status: 403 });
      received.push(JSON.parse(String(init?.body)).textContent);
      return Response.json({ messageId: '<fixture-accepted>' }, { status: 201 });
    },
  });
  const security = new AccountSecurity(db, mail, 'https://app.example');
  await security.init();
  const owner = crypto.randomUUID(),
    salt = crypto.randomUUID(),
    email = owner + '@example.test';
  await db.put('account', authHash(email), owner, {
    id: owner,
    email,
    salt,
    password: (await passwordHash('original-password', salt)).toString('hex'),
  });
  try {
    await assert.rejects(security.requestVerification(owner), /Chưa gửi được email/);
    assert.equal((await db.query('SELECT token_hash FROM auth_tokens')).length, 0);
    reject = false;
    await security.requestVerification(owner);
    const token = (index: number) =>
      new URLSearchParams(new URL(received[index].match(/https[^\s]+/)![0]).hash.slice(1)).get(
        'token',
      )!;
    await security.consume(token(0), 'verify-email');
    await assert.rejects(security.consume(token(0), 'verify-email'));
    await security.requestReset(email);
    await security.consume(token(1), 'reset-password', 'replacement-password');
    await assert.rejects(security.consume(token(1), 'reset-password', 'another-password'));
  } finally {
    mail.close();
    await db.close();
  }
});
