import { createServer } from 'node:tls';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';

// Public test-only key/certificate. Never use these fixtures for a deployed service.
const [key, cert] = await Promise.all([
  readFile('tests/fixtures/smtp-test-key.pem'),
  readFile('tests/fixtures/smtp-test-cert.pem'),
]);
const received: string[] = [];
let authenticated = false;
const server = createServer({ key, cert }, (socket) => {
  socket.write('220 localhost SMTP fixture\r\n');
  let buffer = '',
    data = false,
    body = '';
  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes('\r\n')) {
      const index = buffer.indexOf('\r\n'),
        line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (data) {
        if (line === '.') {
          received.push(body);
          body = '';
          data = false;
          socket.write('250 Accepted\r\n');
        } else body += line + '\n';
        continue;
      }
      if (line.startsWith('EHLO')) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
      else if (line.startsWith('AUTH PLAIN ')) {
        authenticated =
          Buffer.from(line.slice(11), 'base64').toString() === '\0fixture-user\0fixture-password';
        socket.write(authenticated ? '235 Authenticated\r\n' : '535 Invalid credentials\r\n');
      } else if (line.startsWith('MAIL FROM:') || line.startsWith('RCPT TO:'))
        socket.write(authenticated ? '250 OK\r\n' : '530 Authenticate first\r\n');
      else if (line === 'DATA') {
        data = true;
        socket.write('354 End with a dot\r\n');
      } else if (line === 'QUIT') {
        socket.end('221 Bye\r\n');
      } else socket.write('250 OK\r\n');
    }
  });
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const client = spawn(process.execPath, ['--import', 'tsx', 'scripts/smtp-client-probe.ts'], {
    env: {
      ...process.env,
      MAIL_DRIVER: 'smtp',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String((server.address() as AddressInfo).port),
      SMTP_SECURE: 'true',
      SMTP_USER: 'fixture-user',
      SMTP_PASSWORD: 'fixture-password',
      MAIL_FROM: 'sender@example.test',
      NODE_EXTRA_CA_CERTS: path.resolve('tests/fixtures/smtp-test-cert.pem'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  client.stdout!.on('data', (chunk) => (output += String(chunk)));
  client.stderr!.on('data', (chunk) => (output += String(chunk)));
  const code = await new Promise<number | null>((resolve, reject) => {
    client.on('exit', resolve);
    client.on('error', reject);
  });
  assert.equal(code, 0, output);
  assert.ok(authenticated);
  assert.equal(received.length, 1);
  assert.match(received[0], /To: recipient@example.test/);
  assert.match(received[0], /Subject: SMTP fixture delivery/);
  console.log('PASS SMTP: trusted TLS connection, authenticated delivery, local recipient only.');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
