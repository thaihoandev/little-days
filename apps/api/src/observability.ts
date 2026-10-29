import { timingSafeEqual, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { Repository } from './database.js';
type Fields = Record<string, string | number | boolean>;
export function logEvent(event: string, fields: Fields = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}
export class Observability {
  private counts = new Map<number, number>();
  private durationMs = 0;
  middleware = (req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID(),
      started = performance.now();
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      const ms = Math.round(performance.now() - started);
      this.counts.set(res.statusCode, (this.counts.get(res.statusCode) || 0) + 1);
      this.durationMs += ms;
      logEvent('http_request', {
        requestId,
        method: req.method,
        status: res.statusCode,
        durationMs: ms,
      });
    });
    next();
  };
  authorized(header: string | undefined) {
    const token = process.env.OPS_TOKEN_FILE
      ? readFileSync(process.env.OPS_TOKEN_FILE, 'utf8').trim()
      : process.env.OPS_TOKEN;
    if (!token || token.length < 32 || !header?.startsWith('Bearer ')) return false;
    const actual = Buffer.from(header.slice(7)),
      expected = Buffer.from(token);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  async snapshot(db: Repository) {
    const now = await db.now(),
      workers = await db.list<{ lastSeen: number }>('worker');
    const rows = await db.query(
      'SELECT queue_state,COUNT(*) AS count,MIN(created_at) AS oldest FROM render_jobs GROUP BY queue_state',
    );
    const states = Object.fromEntries(rows.map((r) => [String(r.queue_state), Number(r.count)]));
    const queued = rows.find((r) => r.queue_state === 'queued');
    const cleanup = await db.query(
      "SELECT COUNT(*) AS count FROM account_deletions WHERE state='retrying'",
    );
    const storage = (
      await db.query('SELECT COALESCE(SUM(bytes),0) AS bytes FROM managed_media')
    )[0];
    const renders = (
      await db.query(
        'SELECT COUNT(*) AS count,COALESCE(AVG(elapsed_ms),0) AS avg_ms,COALESCE(MAX(rss_bytes),0) AS max_rss,COALESCE(SUM(output_bytes),0) AS bytes FROM render_observations WHERE completed=1',
      )
    )[0];
    const recentFailures = Number(
      (
        await db.query(
          "SELECT COUNT(*) AS count FROM render_jobs WHERE queue_state='failed' AND created_at>? AND error NOT LIKE 'Video đã hết%'",
          [now - 86400000],
        )
      )[0].count,
    );
    const maxOwnerBytes = Number(
      (
        await db.query(
          'SELECT COALESCE(MAX(bytes),0) AS bytes FROM (SELECT SUM(bytes) AS bytes FROM managed_media GROUP BY owner) usage_totals',
        )
      )[0].bytes,
    );
    const notification = (await db.hasTable('ops_notifications'))
      ? (
          await db.query(
            'SELECT checked_at,attempted_at,delivery,lease_until FROM ops_notifications ORDER BY checked_at DESC LIMIT 1',
          )
        )[0]
      : undefined;
    return {
      notifications: notification
        ? {
            lastCheck: Number(notification.checked_at),
            lastAttempt: Number(notification.attempted_at),
            delivery:
              notification.delivery === 'sending' && Number(notification.lease_until) <= now
                ? 'unknown'
                : String(notification.delivery),
          }
        : null,
      workers: workers.filter((w) => now - w.lastSeen < 15000).length,
      jobs: states,
      oldestQueuedSeconds: queued ? Math.floor((now - Number(queued.oldest)) / 1000) : 0,
      cleanupRetries: Number(cleanup[0].count),
      storageBytes: Number(storage.bytes),
      storageMaxOwnerRatio: maxOwnerBytes / (Number(process.env.QUOTA_STORAGE_MB || 512) * 1048576),
      renderFailuresLast24h: recentFailures,
      memoryRssBytes: process.memoryUsage().rss,
      uptimeSeconds: Math.floor(process.uptime()),
      renders: {
        count: Number(renders.count),
        averageMs: Number(renders.avg_ms),
        maxNodeRssBytes: Number(renders.max_rss),
        outputBytes: Number(renders.bytes),
      },
    };
  }
  async metrics(db: Repository) {
    const state = await this.snapshot(db);
    const lines = ['# TYPE scrapbook_http_requests_total counter'];
    for (const [status, count] of this.counts)
      lines.push(`scrapbook_http_requests_total{status="${status}"} ${count}`);
    lines.push(
      '# TYPE scrapbook_http_duration_seconds_sum counter',
      'scrapbook_http_duration_seconds_sum ' + this.durationMs / 1000,
    );
    for (const [key, value] of Object.entries({
      workers_live: state.workers,
      queue_oldest_seconds: state.oldestQueuedSeconds,
      account_cleanup_retries: state.cleanupRetries,
      storage_bytes: state.storageBytes,
      storage_max_owner_ratio: state.storageMaxOwnerRatio,
      render_failures_24h: state.renderFailuresLast24h,
      process_rss_bytes: state.memoryRssBytes,
      uptime_seconds: state.uptimeSeconds,
    }))
      lines.push(`# TYPE scrapbook_${key} gauge`, `scrapbook_${key} ${value}`);
    for (const status of ['queued', 'running', 'completed', 'failed', 'canceled'])
      lines.push(`scrapbook_jobs{state="${status}"} ${state.jobs[status] || 0}`);
    return lines.join('\n') + '\n';
  }
}
