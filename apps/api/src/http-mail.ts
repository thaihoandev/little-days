import { z } from 'zod';
import type { Mail, Mailer } from './mail.js';

type Provider = 'brevo' | 'resend';
export class MailDeliveryError extends Error {
  constructor(
    readonly provider: Provider,
    readonly reason: string,
    readonly status?: number,
  ) {
    super(`Email delivery failed (${provider}, ${reason}).`);
  }
}
export type MailHttpOptions = { fetch?: typeof globalThis.fetch; timeoutMs?: number };

function sender(value: string | undefined) {
  if (!value || value.length > 400 || /[\x00-\x1f\x7f]/.test(value))
    throw new Error('MAIL_FROM cần là email hoặc Tên hiển thị <email> hợp lệ.');
  const match = value.trim().match(/^([^<>]+)<([^<>]+)>$/);
  const email = (match?.[2] || value).trim();
  if (!z.email().safeParse(email).success)
    throw new Error('MAIL_FROM chưa có địa chỉ email hợp lệ.');
  const name = match?.[1].trim().replace(/^"(.*)"$/, '$1');
  return { email, ...(name ? { name } : {}) };
}

async function receipt(response: Response) {
  if (!response.body) throw new Error('Missing email receipt.');
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) throw new Error('Email receipt too large.');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function httpMailer(
  provider: Provider,
  env: NodeJS.ProcessEnv,
  options: MailHttpOptions = {},
): Mailer {
  const from = sender(env.MAIL_FROM),
    keyName = provider === 'brevo' ? 'BREVO_API_KEY' : 'RESEND_API_KEY';
  const key = env[keyName]?.trim();
  if (!key || key.length > 4096 || /[\s\x00-\x1f\x7f]/.test(key))
    throw new Error('Cần cấu hình ' + keyName + ' hợp lệ.');
  const request = options.fetch ?? globalThis.fetch,
    timeout = options.timeoutMs ?? 15000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000)
    throw new Error('Invalid email timeout.');
  // Fixed HTTPS destinations. Never forward a provider credential to a configured URL or redirect.
  const endpoint =
    provider === 'brevo' ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails';
  const controllers = new Set<AbortController>();
  let closed = false;
  return {
    kind: provider,
    async send(mail: Mail) {
      if (closed) throw new MailDeliveryError(provider, 'closed');
      if (!z.email().safeParse(mail.to).success || /[\r\n]/.test(mail.subject))
        throw new MailDeliveryError(provider, 'invalid_message');
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const response = await request(endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]),
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(provider === 'brevo' ? { 'api-key': key } : { Authorization: 'Bearer ' + key }),
          },
          body: JSON.stringify(
            provider === 'brevo'
              ? {
                  sender: from,
                  to: [{ email: mail.to }],
                  subject: mail.subject,
                  textContent: mail.text,
                }
              : {
                  from: from.name ? `${from.name} <${from.email}>` : from.email,
                  to: [mail.to],
                  subject: mail.subject,
                  text: mail.text,
                },
          ),
        });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw new MailDeliveryError(
            provider,
            response.status === 429
              ? 'rate_limited'
              : response.status === 401
                ? 'unauthorized'
                : response.status === 403
                  ? 'sender_or_permission'
                  : 'provider_error',
            response.status,
          );
        }
        const result = await receipt(response);
        const id = provider === 'brevo' ? result.messageId : result.id;
        if (typeof id !== 'string' || !id.trim())
          throw new MailDeliveryError(provider, 'invalid_receipt');
      } catch (error) {
        if (error instanceof MailDeliveryError) throw error;
        // SDK/fetch/provider errors may contain request bodies or secrets. Do not expose them.
        throw new MailDeliveryError(provider, 'unavailable_or_invalid_response');
      } finally {
        controllers.delete(controller);
      }
    },
    close() {
      closed = true;
      for (const controller of controllers) controller.abort();
      controllers.clear();
    },
  };
}
