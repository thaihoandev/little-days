import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Repository } from './database.js';
import type { Mailer } from './mail.js';

export const authHash = (value: string) => createHash('sha256').update(value).digest('hex');
export type Account = {
  deletingAt?: string;
  id: string;
  email: string;
  salt: string;
  password: string;
  credentialVersion?: number;
  emailVerifiedAt?: string;
  revision?: number;
};
export type Session = { userId: string; expires: number; credentialVersion?: number };
type Purpose = 'verify-email' | 'reset-password';
export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function passwordHash(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key))),
  );
}
export async function passwordMatches(password: string, account: Account | undefined) {
  const actual = await passwordHash(password, account?.salt || 'missing-account-salt');
  const expected = Buffer.from(account?.password || '', 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected) && !!account;
}
export class AccountSecurity {
  readonly origin: string;
  constructor(
    private db: Repository,
    private mail: Mailer,
    origin: string,
    private operations?: {
      begin: (owner: string, key?: string) => Promise<string>;
      end: (id: string) => Promise<void>;
    },
  ) {
    const url = new URL(origin);
    if (
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
    )
      throw new Error('APP_ORIGIN cần là HTTPS origin, hoặc HTTP localhost khi phát triển.');
    this.origin = url.origin;
  }
  async init() {
    await this.db.migrate(async () => {
      await this.db.query(
        `CREATE TABLE IF NOT EXISTS auth_tokens(token_hash TEXT PRIMARY KEY, account_key TEXT NOT NULL, owner TEXT NOT NULL, purpose TEXT NOT NULL, expires_at BIGINT NOT NULL, credential_version INTEGER NOT NULL, used_at BIGINT)`,
      );
      await this.db.query(
        'CREATE INDEX IF NOT EXISTS auth_token_expiry ON auth_tokens(expires_at)',
      );
      await this.db.query(
        'CREATE TABLE IF NOT EXISTS auth_rate_limits(rate_key TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at BIGINT NOT NULL)',
      );
      await this.db.query(
        'CREATE INDEX IF NOT EXISTS auth_rate_expiry ON auth_rate_limits(expires_at)',
      );
      await this.db.query('DELETE FROM auth_tokens WHERE expires_at<? RETURNING token_hash', [
        (await this.db.now()) - 86400000,
      ]);
    });
  }
  async rateLimit(key: string, limit: number, windowMs: number) {
    const now = await this.db.now();
    await this.db.query('DELETE FROM auth_rate_limits WHERE expires_at<=? RETURNING rate_key', [
      now,
    ]);
    const result = await this.db.query(
      `INSERT INTO auth_rate_limits(rate_key,hits,expires_at) VALUES(?,1,?)
      ON CONFLICT(rate_key) DO UPDATE SET hits=CASE WHEN auth_rate_limits.expires_at<=? THEN 1 ELSE auth_rate_limits.hits+1 END,
      expires_at=CASE WHEN auth_rate_limits.expires_at<=? THEN excluded.expires_at ELSE auth_rate_limits.expires_at END RETURNING hits`,
      [authHash(key), now + windowMs, now, now],
    );
    if (Number(result[0].hits) > limit)
      throw new AuthError(429, 'Bạn thao tác quá nhanh. Hãy thử lại sau.');
  }
  async byUser(userId: string): Promise<Account | undefined> {
    return (await this.db.list<Account>('account', userId))[0];
  }
  async validSession(session: Session | undefined) {
    if (!session || session.expires <= Date.now()) return false;
    const account = await this.byUser(session.userId);
    return (
      !account ||
      (!account.deletingAt && (account.credentialVersion ?? 0) === (session.credentialVersion ?? 0))
    );
  }
  async requestVerification(userId: string) {
    const account = await this.byUser(userId);
    if (!account || account.deletingAt) throw new AuthError(401, 'Đăng nhập để xác minh email.');
    if (account.emailVerifiedAt) return;
    if (this.mail.kind === 'disabled')
      throw new AuthError(503, 'Chưa gửi được email. Vui lòng thử lại sau.');
    await this.rateLimit('verify:' + account.id, 3, 15 * 60000);
    await this.deliver(account, 'verify-email');
  }
  async requestReset(email: string) {
    if (this.mail.kind === 'disabled')
      throw new AuthError(503, 'Chưa gửi được email. Vui lòng thử lại sau.');
    await this.rateLimit('reset:' + email, 3, 15 * 60000);
    const account = await this.db.get<Account>('account', authHash(email));
    if (account && !account.deletingAt) {
      try {
        await this.deliver(account, 'reset-password');
      } catch {
        console.error('Password reset email delivery failed.');
      }
    }
    // Same response for existing and missing accounts; never return the token over HTTP.
  }
  private async deliver(account: Account, purpose: Purpose) {
    const operation = await this.operations?.begin(account.id);
    try {
      const token = randomBytes(32).toString('hex'),
        tokenHash = authHash(token),
        now = await this.db.now();
      await this.db.query(
        'INSERT INTO auth_tokens(token_hash,account_key,owner,purpose,expires_at,credential_version) VALUES(?,?,?,?,?,?)',
        [
          tokenHash,
          authHash(account.email),
          account.id,
          purpose,
          now + (purpose === 'verify-email' ? 86400000 : 15 * 60000),
          account.credentialVersion ?? 0,
        ],
      );
      const link = this.origin + '/#' + new URLSearchParams({ auth: purpose, token }).toString();
      try {
        await this.mail.send({
          to: account.email,
          subject:
            purpose === 'verify-email'
              ? 'Xác minh email Little Days'
              : 'Đặt lại mật khẩu Little Days',
          text:
            (purpose === 'verify-email'
              ? 'Xác minh email của bạn bằng liên kết dưới đây. Link có hiệu lực 24 giờ.'
              : 'Bạn đã yêu cầu đặt lại mật khẩu. Link có hiệu lực 15 phút.') +
            '\n\n' +
            link +
            '\n\nNếu không yêu cầu thao tác này, bạn có thể bỏ qua email.',
        });
      } catch {
        await this.db.query('DELETE FROM auth_tokens WHERE token_hash=? RETURNING token_hash', [
          tokenHash,
        ]);
        throw new AuthError(503, 'Chưa gửi được email. Vui lòng thử lại sau.');
      }
    } finally {
      if (operation) await this.operations!.end(operation);
    }
  }
  private async lockedAccount(key: string) {
    const rows = await this.db.query(
      "SELECT payload,revision FROM records WHERE kind='account' AND id=?" +
        (this.db.driver === 'postgresql' ? ' FOR UPDATE' : ''),
      [key],
    );
    return rows[0]
      ? {
          account: JSON.parse(String(rows[0].payload)) as Account,
          revision: Number(rows[0].revision),
        }
      : undefined;
  }
  async consume(token: string, purpose: Purpose, newPassword?: string) {
    if (purpose === 'reset-password' && !newPassword) throw new AuthError(400, 'Cần mật khẩu mới.');
    const salt = newPassword ? randomBytes(16).toString('hex') : undefined;
    const password = newPassword
      ? (await passwordHash(newPassword, salt!)).toString('hex')
      : undefined;
    return this.db.transaction(async () => {
      const now = await this.db.now(),
        tokenHash = authHash(token);
      const rows = await this.db.query(
        'SELECT * FROM auth_tokens WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>?',
        [tokenHash, purpose, now],
      );
      const item = rows[0];
      const locked = item ? await this.lockedAccount(String(item.account_key)) : undefined;
      if (
        !item ||
        !locked ||
        locked.account.deletingAt ||
        locked.account.id !== item.owner ||
        (locked.account.credentialVersion ?? 0) !== Number(item.credential_version)
      )
        throw new AuthError(
          400,
          'Liên kết đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu liên kết mới.',
        );
      const used = await this.db.query(
        'UPDATE auth_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? RETURNING token_hash',
        [now, tokenHash, now],
      );
      if (!used.length)
        throw new AuthError(
          400,
          'Liên kết đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu liên kết mới.',
        );
      const next: Account = {
        ...locked.account,
        revision: locked.revision + 1,
        ...(purpose === 'verify-email'
          ? { emailVerifiedAt: new Date(now).toISOString() }
          : {
              salt: salt!,
              password: password!,
              credentialVersion: (locked.account.credentialVersion ?? 0) + 1,
            }),
      };
      if (
        !(await this.db.compareAndSwap(
          'account',
          String(item.account_key),
          next.id,
          locked.revision,
          next,
        ))
      )
        throw new AuthError(409, 'Tài khoản vừa thay đổi. Hãy thử lại.');
      return next;
    });
  }
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    await this.rateLimit('change:' + userId, 5, 60000);
    const original = await this.byUser(userId);
    if (!(await passwordMatches(currentPassword, original)))
      throw new AuthError(401, 'Mật khẩu hiện tại chưa đúng.');
    const salt = randomBytes(16).toString('hex'),
      password = (await passwordHash(newPassword, salt)).toString('hex');
    return this.db.transaction(async () => {
      const key = authHash(original!.email),
        locked = await this.lockedAccount(key);
      if (!locked || locked.account.deletingAt || locked.account.password !== original!.password)
        throw new AuthError(409, 'Mật khẩu vừa thay đổi. Hãy đăng nhập lại.');
      const next: Account = {
        ...locked.account,
        salt,
        password,
        revision: locked.revision + 1,
        credentialVersion: (locked.account.credentialVersion ?? 0) + 1,
      };
      if (!(await this.db.compareAndSwap('account', key, userId, locked.revision, next)))
        throw new AuthError(409, 'Tài khoản vừa thay đổi. Hãy thử lại.');
      return next;
    });
  }
}
