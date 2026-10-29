import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { type Mail, MailDeliveryError } from '../apps/api/src/mail.js';
import { OpsMonitor, operationalAlerts } from '../apps/api/src/ops-monitor.js';
import { Observability } from '../apps/api/src/observability.js';
import { makeJob } from './job-fixture.js';

async function fixture() {
  const root = path.resolve('test-results/ops-monitor', randomUUID());
  const db = new Repository({ dataDir: root, databaseUrl: process.env.TEST_DATABASE_URL || '' });
  await db.init();
  const store = new LocalMediaStore(root);
  await store.ready();
  const jobs = new JobRepository(db);
  await jobs.init();
  await new AlbumHistory(db).init();
  await new AccountDeletion(db, jobs, store, root).init();
  await new ResourcePolicy(db, store).init();
  const messages: Mail[] = [],
    recipient = randomUUID() + '@example.test';
  const env = { OPS_ALERT_ENABLED: 'true', OPS_ALERT_EMAIL: recipient };
  const mailer = {
    kind: 'fixture',
    async send(mail: Mail) {
      messages.push(mail);
    },
    close() {},
  };
  const monitor = new OpsMonitor(db, mailer, env);
  await monitor.init();
  const owner = randomUUID(),
    job = makeJob();
  job.config.opening = 'private scrapbook words';
  await jobs.create(job, owner);
  const age = () =>
    db.query('UPDATE ops_notifications SET observed_at=0,attempted_at=0 WHERE id=? RETURNING id', [
      id,
    ]);
  const { createHash } = await import('node:crypto');
  const id = createHash('sha256').update(recipient.toLowerCase()).digest('hex');
  async function close() {
    await monitor.stop();
    await db.query('DELETE FROM render_jobs WHERE owner=? RETURNING id', [owner]);
    await db.query('DELETE FROM ops_notifications WHERE id=? RETURNING id', [id]);
    await db.close();
  }
  return { db, jobs, job, owner, monitor, mailer, messages, env, id, age, close };
}

test('operational alerts ignore an intentionally offline worker when the queue is empty', async () => {
  const f = await fixture();
  try {
    const snapshot = await new Observability().snapshot(f.db);
    assert.deepEqual(
      operationalAlerts({
        ...snapshot,
        workers: 0,
        jobs: {},
        cleanupRetries: 0,
        storageMaxOwnerRatio: 0,
        renderFailuresLast24h: 0,
        oldestQueuedSeconds: 0,
      }),
      [],
    );
    assert.deepEqual(
      operationalAlerts({
        ...snapshot,
        workers: 0,
        jobs: { queued: 1 },
        oldestQueuedSeconds: 601,
        cleanupRetries: 1,
        storageMaxOwnerRatio: 0.91,
        renderFailuresLast24h: 3,
      }),
      [
        'account_cleanup_retry',
        'queue_delayed',
        'render_failures',
        'storage_near_quota',
        'worker_unavailable',
      ],
    );
  } finally {
    await f.close();
  }
});

test('alerts require sustained conditions, deduplicate after restart and notify recovery after cooldown', async () => {
  const f = await fixture();
  try {
    await f.monitor.check();
    assert.equal(f.messages.length, 0);
    await f.monitor.check();
    assert.equal(f.messages.length, 0);
    await f.age();
    await f.monitor.check();
    assert.equal(f.messages.length, 1);
    const restarted = new OpsMonitor(f.db, f.mailer, f.env);
    await restarted.init();
    await restarted.check();
    assert.equal(f.messages.length, 1);
    await f.age();
    await restarted.check();
    assert.equal(f.messages.length, 1);
    await f.jobs.cancel(f.job.id, f.owner);
    await restarted.check();
    await restarted.check();
    assert.equal(f.messages.length, 1);
    await f.age();
    await restarted.check();
    assert.equal(f.messages.length, 2);
    assert.match(f.messages[1].subject, /phục hồi/);
    await restarted.check();
    assert.equal(f.messages.length, 2);
    assert.equal(f.messages[0].to, f.env.OPS_ALERT_EMAIL);
    assert.ok(!JSON.stringify(f.messages).includes(f.owner));
    assert.ok(!JSON.stringify(f.messages).includes('private scrapbook words'));
    assert.equal((await new Observability().snapshot(f.db)).notifications?.delivery, 'accepted');
  } finally {
    await f.close();
  }
});

test('concurrent monitors claim one send and a stale lease cannot reset its successor', async () => {
  const f = await fixture();
  try {
    await f.monitor.check();
    await f.age();
    const second = new OpsMonitor(f.db, f.mailer, f.env);
    await second.init();
    await Promise.all([f.monitor.check(), second.check()]);
    assert.equal(f.messages.length, 1);
    await f.db.query("UPDATE ops_notifications SET delivery='sending',lease_until=? WHERE id=?", [
      (await f.db.now()) + 120000,
      f.id,
    ]);
    assert.deepEqual(await second.check(), { busy: true });
    await f.db.query('UPDATE ops_notifications SET lease_until=0 WHERE id=?', [f.id]);
    await second.check();
    assert.equal(f.messages.length, 1);
    assert.equal((await new Observability().snapshot(f.db)).notifications?.delivery, 'unknown');
  } finally {
    await f.close();
  }
});

test('ambiguous delivery is not retried automatically; explicit retry respects the cooldown', async () => {
  const f = await fixture();
  try {
    let sends = 0;
    f.mailer.send = async () => {
      sends++;
      throw new Error('secret provider response must never escape');
    };
    await f.monitor.check();
    await f.age();
    assert.equal(((await f.monitor.check()) as { delivery: string }).delivery, 'unknown');
    await f.monitor.check(true);
    assert.equal(sends, 1);
    await f.age();
    await f.monitor.check();
    assert.equal(sends, 1);
    await f.monitor.check(true);
    assert.equal(sends, 2);
    f.mailer.send = async () => {
      sends++;
      throw new MailDeliveryError('brevo', 'unauthorized', 401);
    };
    await f.age();
    assert.equal(((await f.monitor.check(true)) as { delivery: string }).delivery, 'failed');
    await f.age();
    await f.monitor.check();
    assert.equal(sends, 3);
  } finally {
    await f.close();
  }
});

test('monitor is disabled by default and invalid enabled configuration fails early', async () => {
  const f = await fixture();
  try {
    const disabled = new OpsMonitor(f.db, f.mailer, {});
    await disabled.init();
    assert.deepEqual(await disabled.check(), { disabled: true });
    assert.throws(() => new OpsMonitor(f.db, f.mailer, { OPS_ALERT_ENABLED: 'true' }));
    assert.throws(() => new OpsMonitor(f.db, { ...f.mailer, kind: 'disabled' }, f.env));
    assert.throws(() => new OpsMonitor(f.db, f.mailer, { ...f.env, OPS_ALERT_ENABLED: 'yes' }));
    await f.monitor.stop();
    assert.deepEqual(await f.monitor.check(), { disabled: true });
  } finally {
    await f.close();
  }
});
