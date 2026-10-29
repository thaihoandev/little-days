import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
export async function startHttpMailFixture(root: string, provider: 'brevo' | 'resend') {
  let accepted = 0;
  const server = createServer((req, res) => {
    void (async () => {
      assert.equal(req.method, 'POST');
      assert.equal(req.url, provider === 'brevo' ? '/v3/smtp/email' : '/emails');
      assert.equal(
        req.headers[provider === 'brevo' ? 'api-key' : 'authorization'],
        provider === 'brevo' ? 'fixture-brevo-api-key' : 'Bearer fixture-resend-api-key',
      );
      let raw = '';
      for await (const chunk of req) {
        raw += String(chunk);
        if (raw.length > 64000) throw new Error('Fixture message too large');
      }
      const mail = JSON.parse(raw),
        to = provider === 'brevo' ? mail.to[0].email : mail.to[0],
        text = provider === 'brevo' ? mail.textContent : mail.text;
      assert.match(to, /@example\.test$/);
      assert.match(text, /http:\/\/127\.0\.0\.1:5359\/#auth=/);
      const id = crypto.randomUUID();
      await mkdir(path.join(root, 'mail'), { recursive: true });
      await writeFile(
        path.join(root, 'mail', id + '.json'),
        JSON.stringify({
          id,
          createdAt: new Date().toISOString(),
          to,
          subject: mail.subject,
          text,
        }),
        { flag: 'wx', mode: 0o600 },
      );
      accepted++;
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(provider === 'brevo' ? { messageId: '<' + id + '> apifixture' } : { id }),
      );
    })().catch(() => {
      res.writeHead(400);
      res.end('Fixture request contract rejected');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: 'http://127.0.0.1:' + (server.address() as AddressInfo).port,
    get accepted() {
      return accepted;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
