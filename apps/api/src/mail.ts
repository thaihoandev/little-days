import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { httpMailer, type MailHttpOptions } from './http-mail.js';
export { MailDeliveryError } from './http-mail.js';

export type Mail = { to: string; subject: string; text: string };
export interface Mailer {
  readonly kind: string;
  send(mail: Mail): Promise<void>;
  close(): void;
}
export function createMailer(
  dataDir: string,
  env: NodeJS.ProcessEnv = process.env,
  http: MailHttpOptions = {},
): Mailer {
  const driver = env.MAIL_DRIVER || (env.NODE_ENV === 'production' ? 'disabled' : 'local');
  if (driver === 'brevo' || driver === 'resend') return httpMailer(driver, env, http);
  if (driver === 'disabled')
    return {
      kind: driver,
      async send() {
        throw new Error('Mail disabled');
      },
      close() {},
    };
  if (driver === 'local') {
    if (env.NODE_ENV === 'production')
      throw new Error(
        'MAIL_DRIVER=local chỉ dành cho phát triển. Dùng brevo, resend, smtp hoặc disabled trong production.',
      );
    const root = path.resolve(dataDir, 'mail');
    return {
      kind: driver,
      async send(mail) {
        await mkdir(root, { recursive: true });
        const id = randomUUID();
        await writeFile(
          path.join(root, id + '.json'),
          JSON.stringify({ id, createdAt: new Date().toISOString(), ...mail }, null, 2),
          { flag: 'wx', mode: 0o600 },
        );
      },
      close() {},
    };
  }
  if (driver !== 'smtp')
    throw new Error('MAIL_DRIVER phải là local, smtp, brevo, resend hoặc disabled.');
  const port = Number(env.SMTP_PORT || 587),
    from = env.MAIL_FROM || '';
  if (
    !env.SMTP_HOST ||
    !from ||
    /[\r\n]/.test(from) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error('Cần cấu hình SMTP_HOST, SMTP_PORT và MAIL_FROM hợp lệ.');
  const secure = env.SMTP_SECURE === 'true';
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD || '' } } : {}),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return {
    kind: driver,
    async send(mail) {
      const result = await transport.sendMail({
        from,
        ...mail,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      if (result.rejected?.length) throw new Error('Recipient rejected');
    },
    close() {
      transport.close();
    },
  };
}
