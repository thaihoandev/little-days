import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Repository } from './database.js';
import { type Mailer, MailDeliveryError } from './mail.js';
import { Observability, logEvent } from './observability.js';

type Snapshot = Awaited<ReturnType<Observability['snapshot']>>;
const GRACE_MS = 120000,
  COOLDOWN_MS = 3600000,
  LEASE_MS = 120000;
const descriptions: Record<string, string> = {
  worker_unavailable: 'Có video đang chờ hoặc đang xử lý nhưng không có worker còn heartbeat.',
  queue_delayed: 'Video đã chờ trong hàng đợi hơn 10 phút.',
  account_cleanup_retry: 'Có tác vụ xóa tài khoản cần thử lại.',
  storage_near_quota: 'Có tài khoản sử dụng trên 90% hạn mức media.',
  render_failures: 'Có ít nhất 3 lần xuất video lỗi trong 24 giờ gần đây.',
};
export function operationalAlerts(status: Snapshot) {
  const alerts: string[] = [];
  if (
    !status.backupInProgress &&
    status.workers === 0 &&
    (status.jobs.queued || status.jobs.running)
  )
    alerts.push('worker_unavailable');
  if (!status.backupInProgress && status.oldestQueuedSeconds > 600) alerts.push('queue_delayed');
  if (status.cleanupRetries > 0) alerts.push('account_cleanup_retry');
  if (status.storageMaxOwnerRatio > 0.9) alerts.push('storage_near_quota');
  if (status.renderFailuresLast24h >= 3) alerts.push('render_failures');
  return alerts.sort();
}

/** Notification attempts are persisted before sending: ambiguous deliveries are never retried automatically. */
export class OpsMonitor {
  readonly enabled: boolean;
  private recipient: string;
  private id: string;
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<unknown>;
  private stopping = false;
  constructor(
    private db: Repository,
    private mailer: Mailer,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    if (env.OPS_ALERT_ENABLED && !['true', 'false'].includes(env.OPS_ALERT_ENABLED))
      throw new Error('OPS_ALERT_ENABLED must be true or false.');
    this.enabled = env.OPS_ALERT_ENABLED === 'true';
    this.recipient = (env.OPS_ALERT_EMAIL || '').trim();
    if (
      this.enabled &&
      (!z.email().safeParse(this.recipient).success || mailer.kind === 'disabled')
    )
      throw new Error(
        'Configure OPS_ALERT_EMAIL and an enabled mail provider before enabling alerts.',
      );
    this.id = createHash('sha256').update(this.recipient.toLowerCase()).digest('hex');
  }
  async init() {
    if (!this.enabled) return;
    await this.db.migrate(() =>
      this.db
        .query(
          "CREATE TABLE IF NOT EXISTS ops_notifications(id TEXT PRIMARY KEY,observed TEXT NOT NULL DEFAULT '[]',observed_at BIGINT NOT NULL DEFAULT 0,attempted TEXT NOT NULL DEFAULT '[]',attempted_at BIGINT NOT NULL DEFAULT 0,delivery TEXT NOT NULL DEFAULT 'idle',checked_at BIGINT NOT NULL DEFAULT 0,token TEXT NOT NULL DEFAULT '',lease_until BIGINT NOT NULL DEFAULT 0)",
        )
        .then(() => {}),
    );
  }
  start() {
    if (!this.enabled || this.timer) return;
    const tick = () => void this.check().catch(() => logEvent('ops_monitor_failed'));
    this.timer = setInterval(tick, 60000);
    tick();
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.pending?.catch(() => {});
  }
  check(retryUncertain = false): Promise<unknown> {
    if (!this.enabled || this.stopping) return Promise.resolve({ disabled: true });
    if (this.pending) return this.pending;
    this.pending = this.run(retryUncertain).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async run(retryUncertain: boolean) {
    const now = await this.db.now(),
      token = randomUUID();
    const rows = await this.db.query(
      'INSERT INTO ops_notifications(id,token,lease_until) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE ops_notifications.lease_until<=? RETURNING *',
      [this.id, token, now + LEASE_MS, now],
    );
    if (!rows.length) return { busy: true };
    try {
      const previous = rows[0];
      // A process may have died while awaiting the provider; record uncertainty, never infer failure.
      if (previous.delivery === 'sending') previous.delivery = 'unknown';
      const alerts = operationalAlerts(await new Observability().snapshot(this.db));
      const observed = JSON.stringify(alerts),
        changed = observed !== previous.observed;
      const stable = !changed && now - Number(previous.observed_at) >= GRACE_MS;
      const cooldown = now - Number(previous.attempted_at) >= COOLDOWN_MS;
      const retry = retryUncertain && ['failed', 'unknown'].includes(String(previous.delivery));
      await this.db.query(
        'UPDATE ops_notifications SET observed=?,observed_at=?,checked_at=?,delivery=? WHERE id=? AND token=? RETURNING id',
        [
          observed,
          changed ? now : Number(previous.observed_at),
          now,
          String(previous.delivery),
          this.id,
          token,
        ],
      );
      if (!stable || !cooldown || (observed === previous.attempted && !retry))
        return { alerts, notified: false };
      const attempted = await this.db.query(
        "UPDATE ops_notifications SET attempted=?,attempted_at=?,delivery='sending' WHERE id=? AND token=? AND lease_until>? RETURNING id",
        [observed, now, this.id, token, await this.db.now()],
      );
      if (!attempted.length) return { busy: true };
      try {
        await this.mailer.send({
          to: this.recipient,
          subject: alerts.length
            ? 'Little Days: cần kiểm tra hệ thống'
            : 'Little Days: hệ thống đã phục hồi',
          text: alerts.length
            ? 'Các cảnh báo hiện tại:\n\n' +
              alerts.map((a) => a + ': ' + descriptions[a]).join('\n')
            : 'Các cảnh báo vận hành trước đó đã hết. Đây là thông báo hệ thống tự động.',
        });
        await this.db.query(
          "UPDATE ops_notifications SET delivery='accepted' WHERE id=? AND token=? RETURNING id",
          [this.id, token],
        );
        logEvent('ops_notification_accepted', { alerts: alerts.length });
        return { alerts, notified: true };
      } catch (error) {
        const definite =
          error instanceof MailDeliveryError &&
          !!error.status &&
          error.status >= 400 &&
          error.status < 500;
        await this.db.query(
          'UPDATE ops_notifications SET delivery=? WHERE id=? AND token=? RETURNING id',
          [definite ? 'failed' : 'unknown', this.id, token],
        );
        logEvent('ops_notification_failed', { delivery: definite ? 'failed' : 'unknown' });
        return { alerts, notified: false, delivery: definite ? 'failed' : 'unknown' };
      }
    } finally {
      await this.db.query(
        'UPDATE ops_notifications SET lease_until=0 WHERE id=? AND token=? RETURNING id',
        [this.id, token],
      );
    }
  }
}
