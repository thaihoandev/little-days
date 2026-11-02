import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { JournalService } from '../apps/api/src/journal.js';
import { ReminderService } from '../apps/api/src/reminders.js';
import { holidaysForYear } from '../apps/api/src/holidays.js';
import { authHash, AccountSecurity, passwordHash, type Account } from '../apps/api/src/auth.js';
import { MailDeliveryError, type Mail, type Mailer } from '../apps/api/src/mail.js';
import {
  defaultReminderPreferences,
  localReminderClock,
  type ReminderRule,
  type ReminderNotification,
} from '../packages/domain/reminders.js';
import { createAlbumContent, type Album } from '../packages/domain/index.js';
import { createBackup, restoreBackup } from '../apps/api/src/backup.js';
const status = (code: number) => (e: any) => e.getStatus?.() === code || e.status === code;
const content = {
  title: 'Riêng tư · Không đưa vào email',
  date: '2024-11-03',
  note: 'Lời nhắn rất riêng',
  kind: 'anniversary' as const,
  annual: true,
};
async function fixture() {
  const root = path.resolve('test-results/reminders', randomUUID()),
    db = new Repository({ dataDir: root, databaseUrl: process.env.TEST_DATABASE_URL || '' });
  await db.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  await new AlbumHistory(db).init();
  const store = new LocalMediaStore(root),
    deletion = new AccountDeletion(db, jobs, store, root);
  await deletion.init();
  const resources = new ResourcePolicy(db, store);
  await resources.init();
  const journal = new JournalService(db, store, resources, deletion),
    users = [randomUUID(), randomUUID(), randomUUID()],
    sent: Mail[] = [];
  const salt = randomUUID(),
    password = (await passwordHash('Reminder-fixture-123!', salt)).toString('hex');
  for (const id of users)
    await db.insert('account', authHash(id + '@fixture.test'), id, {
      id,
      email: id + '@fixture.test',
      salt,
      password,
      emailVerifiedAt: new Date().toISOString(),
    });
  const mailer: Mailer = {
    kind: 'fixture',
    async send(mail) {
      sent.push(mail);
    },
    close() {},
  };
  const security = new AccountSecurity(db, mailer, 'http://127.0.0.1:5173');
  await security.init();
  let now = Date.parse('2026-11-02T03:00:00Z');
  const make = (mail = mailer) =>
    new ReminderService(db, journal, deletion, mail, 'https://little-days.example', {
      now: async () => now,
    });
  return {
    root,
    db,
    store,
    journal,
    deletion,
    resources,
    security,
    users,
    sent,
    make,
    service: make(),
    setNow: (value: string) => (now = Date.parse(value)),
    async close() {
      for (const owner of users) {
        for (const table of [
          'owner_operations',
          'media_objects',
          'managed_media',
          'account_deletions',
          'auth_tokens',
          'auth_rate_limits',
        ]) {
          if (table === 'auth_tokens') {
            await db.query('DELETE FROM auth_tokens WHERE owner=? RETURNING owner', [owner]);
            continue;
          }
          if (table === 'auth_rate_limits') continue;
          await db.query('DELETE FROM ' + table + ' WHERE owner=? RETURNING owner', [owner]);
        }
        await db.query('DELETE FROM records WHERE owner=? RETURNING id', [owner]);
      }
      await db.remove('reminder-scheduler', 'global');
      await db.close();
    },
  };
}
async function preferences(
  f: Awaited<ReturnType<typeof fixture>>,
  actor: string,
  patch: Partial<typeof defaultReminderPreferences> = {},
) {
  const current = await f.service.preferences(actor);
  return f.service.savePreferences(actor, {
    expectedRevision: current.revision,
    content: { ...current, ...patch },
  });
}
async function rule(
  f: Awaited<ReturnType<typeof fixture>>,
  actor: string,
  id: string,
  email = false,
  offsets: number[] = [1],
) {
  return f.service.saveRule(actor, {
    expectedRevision: -1,
    content: { source: { kind: 'journal', id }, enabled: true, email, offsets },
  });
}
test('Vietnamese lunar holidays and locally celebrated Western dates have stable icons without fabricated substitute days', () => {
  const get = (year: number, key: string) => holidaysForYear(year).find((h) => h.key === key)!;
  assert.equal(get(2026, 'tet').date, '2026-02-17');
  assert.equal(get(2027, 'tet').date, '2027-02-06');
  assert.equal(get(2026, 'tet-eve').date, '2026-02-16');
  assert.equal(get(2026, 'hung-kings').date, '2026-04-26');
  assert.equal(get(2026, 'mid-autumn').date, '2026-09-25');
  assert.equal(get(2027, 'kitchen-gods').date, '2027-01-30');
  for (const year of [1900, 1985, 2026, 2027, 2200]) {
    const list = holidaysForYear(year);
    assert.equal(new Set(list.map((h) => h.id)).size, list.length);
    assert.ok(list.every((h) => h.date.startsWith(year + '-') && h.icon && h.title));
  }
  assert.equal(get(2026, 'valentine').date, '2026-02-14');
  assert.equal(get(2026, 'christmas').category, 'occasion');
  assert.ok(
    !holidaysForYear(2026).some((h) => /thanksgiving|independence day|nghỉ bù/i.test(h.title)),
  );
  assert.throws(() => holidaysForYear(9999));
});
test('reminder clocks use local calendar days across midnight and DST', () => {
  assert.deepEqual(localReminderClock(Date.parse('2026-11-01T18:30:00Z'), 'Asia/Ho_Chi_Minh'), {
    date: '2026-11-02',
    hour: 1,
  });
  assert.equal(localReminderClock(Date.parse('2026-03-08T13:00:00Z'), 'America/New_York').hour, 9);
  assert.equal(localReminderClock(Date.parse('2026-11-01T14:00:00Z'), 'America/New_York').hour, 9);
});
test('in-app reminders are opt-in per event, CAS protected, private and idempotent across reads/restarts', async () => {
  const f = await fixture(),
    [owner, stranger] = f.users;
  try {
    const entry = await f.journal.create(owner, content);
    assert.equal((await f.service.notifications(owner)).items.length, 0);
    const r = await rule(f, owner, entry.id);
    await assert.rejects(rule(f, owner, entry.id), status(409));
    await assert.rejects(rule(f, stranger, entry.id), status(404));
    let list = await f.service.notifications(owner);
    assert.equal(list.unread, 1);
    assert.equal(list.items[0].occurrenceDate, '2026-11-03');
    assert.equal(list.items[0].offset, 1);
    assert.equal((await f.make().notifications(owner)).items[0].id, list.items[0].id);
    assert.equal(f.sent.length, 0);
    assert.equal((await f.service.notifications(stranger)).items.length, 0);
    await assert.rejects(f.service.markRead(stranger, list.items[0].id), status(404));
    await f.service.markRead(owner, 'all');
    assert.equal((await f.service.notifications(owner)).unread, 0);
    await assert.rejects(f.service.removeRule(owner, r.id, { expectedRevision: 99 }), status(409));
    await f.service.removeRule(owner, r.id, { expectedRevision: r.revision });
    assert.equal((await f.service.notifications(owner)).items.length, 0);
  } finally {
    await f.close();
  }
});
test('email requires both opt-ins and verification, respects the chosen hour and sends once even under competing cron runs', async () => {
  const f = await fixture(),
    owner = f.users[0];
  try {
    const entry = await f.journal.create(owner, content);
    await rule(f, owner, entry.id, true);
    await f.service.runScheduled();
    assert.equal(f.sent.length, 0);
    const prefs = await preferences(f, owner, { emailEnabled: true });
    await assert.rejects(
      f.service.savePreferences(owner, { expectedRevision: prefs.revision - 1, content: prefs }),
      status(409),
    );
    f.setNow('2026-11-02T01:00:00Z');
    await f.service.runScheduled();
    assert.equal(f.sent.length, 0);
    f.setNow('2026-11-02T03:00:00Z');
    await Promise.all([f.service.runScheduled(), f.make().runScheduled()]);
    assert.equal(f.sent.length, 1);
    await f.make().runScheduled();
    assert.equal(f.sent.length, 1);
    assert.ok(!f.sent[0].text.includes(entry.title));
    assert.match(f.sent[0].text, /calendar\?date=2026-11-03/);
    assert.equal((await f.service.notifications(owner)).items[0].emailDelivery, 'accepted');
    // Display retention must never erase the independent email attempt receipt.
    const notice = (await f.service.notifications(owner)).items[0];
    await f.db.remove('reminder-notification', notice.id);
    await f.make().runScheduled();
    assert.equal(f.sent.length, 1);
    assert.equal((await f.service.notifications(owner)).items[0].emailDelivery, 'accepted');
    const account = (await f.db.list<Account>('account', owner))[0];
    await f.db.put('account', authHash(account.email), owner, {
      ...account,
      emailVerifiedAt: undefined,
    });
    await assert.rejects(preferences(f, owner, { emailEnabled: true }), status(403));
  } finally {
    await f.close();
  }
});
test('ambiguous and rejected email deliveries are not blindly resent', async () => {
  const f = await fixture(),
    owner = f.users[0];
  try {
    const entry = await f.journal.create(owner, content);
    await preferences(f, owner, { emailEnabled: true });
    await rule(f, owner, entry.id, true);
    let count = 0;
    const service = f.make({
      kind: 'brevo',
      async send() {
        count++;
        throw new MailDeliveryError('brevo', 'unavailable_or_invalid_response');
      },
      close() {},
    });
    await service.runScheduled();
    await service.runScheduled();
    assert.equal(count, 1);
    assert.equal((await service.notifications(owner)).items[0].emailDelivery, 'unknown');
    const other = await f.journal.create(owner, { ...content, title: 'Bị từ chối' });
    await rule(f, owner, other.id, true);
    let rejected = 0;
    const rejectedService = f.make({
      kind: 'brevo',
      async send() {
        rejected++;
        throw new MailDeliveryError('brevo', 'unauthorized', 401);
      },
      close() {},
    });
    await rejectedService.runScheduled();
    await rejectedService.runScheduled();
    assert.equal(rejected, 1);
    assert.ok(
      (await rejectedService.notifications(owner)).items.some((n) => n.emailDelivery === 'failed'),
    );
  } finally {
    await f.close();
  }
});
test('revocation, reinvitation, trash, date edits and disabled rules fence notifications and future mail', async () => {
  const f = await fixture(),
    [owner, member] = f.users;
  try {
    let entry = await f.journal.create(owner, content);
    const grant = await f.journal.sharing.invite(owner, { email: member + '@fixture.test' });
    await f.journal.sharing.change(member, grant.id, { expectedRevision: 0, action: 'accept' });
    const r = await rule(f, member, entry.id, true);
    await preferences(f, member, { emailEnabled: true });
    assert.equal((await f.service.notifications(member)).unread, 1);
    await f.journal.sharing.change(owner, grant.id, { expectedRevision: 1 }, true);
    assert.equal((await f.service.notifications(member)).items.length, 0);
    await f.service.runScheduled();
    assert.equal(f.sent.length, 0);
    const again = await f.journal.sharing.invite(owner, { email: member + '@fixture.test' });
    await f.journal.sharing.change(member, again.id, { expectedRevision: 0, action: 'accept' });
    assert.equal((await f.service.notifications(member)).items.length, 0);
    const renewed = await f.service.saveRule(member, {
      expectedRevision: r.revision,
      content: { source: r.source, offsets: r.offsets, email: true, enabled: true },
    });
    assert.equal((await f.service.notifications(member)).items.length, 1);
    const paused = await f.service.saveRule(member, {
      expectedRevision: renewed.revision,
      content: { source: renewed.source, offsets: renewed.offsets, email: true, enabled: false },
    });
    assert.equal((await f.service.notifications(member)).items.length, 0);
    await f.service.runScheduled();
    assert.equal(f.sent.length, 0);
    await f.service.saveRule(member, {
      expectedRevision: paused.revision,
      content: { source: paused.source, offsets: paused.offsets, email: true, enabled: true },
    });
    entry = await f.journal.save(owner, entry.id, {
      expectedRevision: entry.revision,
      content: { ...content, date: '2024-11-04' },
    });
    assert.equal((await f.service.notifications(member)).items.length, 0);
    await f.journal.remove(owner, entry.id, { expectedRevision: entry.revision });
    await f.service.runScheduled();
    assert.equal(f.sent.length, 0);
  } finally {
    await f.close();
  }
});
test('bounded scheduler batches advance fairly; backup/restore preserves delivery deduplication and source-owner deletion clears dependent reminders', async () => {
  const f = await fixture(),
    [owner, member] = f.users;
  try {
    await preferences(f, owner, { emailEnabled: true });
    for (let i = 0; i < 7; i++) {
      const e = await f.journal.create(owner, { ...content, title: 'Kỉ niệm ' + i });
      await rule(f, owner, e.id, true);
    }
    const first = await f.service.runScheduled();
    assert.equal(first.attempted, 5);
    await f.service.runScheduled();
    assert.equal(f.sent.length, 7);
    await f.make().runScheduled();
    assert.equal(f.sent.length, 7);
    if (f.db.driver === 'sqlite') {
      const snapshot = path.join(f.root, 'backup');
      await createBackup(f.db, f.store, snapshot);
      const restoredRoot = path.join(f.root, 'restored'),
        restored = new Repository({ dataDir: restoredRoot, databaseUrl: '' }),
        restoredStore = new LocalMediaStore(restoredRoot);
      await restored.init();
      try {
        await restoreBackup(restored, restoredStore, snapshot, true);
        assert.equal((await restored.list<ReminderRule>('reminder-rule', owner)).length, 7);
        assert.equal((await restored.list('reminder-email-receipt', owner)).length, 7);
        assert.ok(
          (await restored.list<ReminderNotification>('reminder-notification', owner)).every(
            (n) => n.emailDelivery === 'accepted',
          ),
        );
      } finally {
        await restored.close();
      }
    }
    const entry = await f.journal.create(owner, content),
      grant = await f.journal.sharing.invite(owner, { email: member + '@fixture.test' });
    await f.journal.sharing.change(member, grant.id, { expectedRevision: 0, action: 'accept' });
    await preferences(f, member, { emailEnabled: true });
    await rule(f, member, entry.id, true);
    await f.service.notifications(member);
    await f.service.runScheduled();
    assert.equal((await f.db.list('reminder-email-receipt', member)).length, 1);
    const receipt = await f.deletion.request(owner, 'Reminder-fixture-123!', f.security);
    await f.deletion.tick();
    assert.equal((await f.deletion.status(receipt)).status, 'completed');
    assert.equal((await f.db.list('reminder-rule', member)).length, 0);
    assert.equal((await f.db.list('reminder-notification', member)).length, 0);
    assert.equal((await f.db.list('reminder-email-receipt', member)).length, 0);
  } finally {
    await f.close();
  }
});
test('album anniversary and memory sources require ownership and leap-day recurrence follows the existing calendar', async () => {
  const f = await fixture(),
    [owner, stranger] = f.users;
  try {
    const a: Album = {
      ...createAlbumContent(),
      id: randomUUID(),
      revision: 0,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assets: [],
      startDate: '2024-02-29',
    };
    await f.db.insert('album', a.id, owner, a);
    await assert.rejects(
      f.service.saveRule(stranger, {
        expectedRevision: -1,
        content: {
          source: { kind: 'album-start', id: a.id },
          offsets: [0],
          enabled: true,
          email: false,
        },
      }),
      status(404),
    );
    await f.service.saveRule(owner, {
      expectedRevision: -1,
      content: {
        source: { kind: 'album-start', id: a.id },
        offsets: [0],
        enabled: true,
        email: false,
      },
    });
    f.setNow('2027-02-28T03:00:00Z');
    assert.equal((await f.service.notifications(owner)).items[0].occurrenceDate, '2027-02-28');
  } finally {
    await f.close();
  }
});
