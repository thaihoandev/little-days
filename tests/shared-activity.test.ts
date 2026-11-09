import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { JournalService } from '../apps/api/src/journal.js';
import { CoupleRituals } from '../apps/api/src/couple-rituals.js';
import { SharedActivity } from '../apps/api/src/shared-activity.js';
import { authHash } from '../apps/api/src/auth.js';
import { todayIn } from '../packages/domain/index.js';
import { shiftDate } from '../packages/domain/weekly-recap.js';
import { summarizeRhythm } from '../packages/domain/rhythm.js';
import { privateSpaceId } from '../apps/api/src/journal-privacy.js';
import sharp from 'sharp';

async function fixture() {
  const root = path.resolve('test-results/shared-activity', randomUUID());
  const db = new Repository({ dataDir: root, databaseUrl: process.env.TEST_DATABASE_URL || '' });
  await db.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  await new AlbumHistory(db).init();
  const store = new LocalMediaStore(root);
  await store.ready();
  const deletion = new AccountDeletion(db, jobs, store, root);
  await deletion.init();
  const resources = new ResourcePolicy(db, store);
  await resources.init();
  const journal = new JournalService(db, store, resources, deletion),
    users = [randomUUID(), randomUUID(), randomUUID()],
    emails = users.map((id) => id + '@fixture.test');
  for (const [i, id] of users.entries())
    await db.insert('account', authHash(emails[i]), id, {
      id,
      email: emails[i],
      emailVerifiedAt: new Date().toISOString(),
    });
  let now = new Date();
  const rituals = new CoupleRituals(db, journal, deletion, resources, () => now),
    activity = new SharedActivity(db, journal, deletion);
  return {
    db,
    journal,
    users,
    emails,
    rituals,
    activity,
    setNow: (n: string) => (now = new Date(n)),
    close: () => db.close(),
  };
}
test('collaboration inbox is private, durable-read, bounded and revokes immediately', async () => {
  const f = await fixture();
  const [a, b, c] = f.users;
  try {
    const invitation = await f.journal.sharing.invite(a, { email: f.emails[1] });
    let inbox = await f.activity.inbox(b);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].kind, 'invite');
    await f.activity.markRead(b, inbox[0].id);
    assert.ok((await f.activity.inbox(b))[0].readAt);
    await assert.rejects(f.activity.markRead(c, inbox[0].id));
    await f.journal.sharing.change(b, invitation.id, { expectedRevision: 0, action: 'accept' });
    assert.equal((await f.activity.inbox(a))[0].kind, 'accepted');
    const today = todayIn('Asia/Ho_Chi_Minh');
    const request = {
      requestId: randomUUID(),
      text: 'SEALED-ONLY-BY-AUTHOR',
      mode: 'scheduled',
      openDate: shiftDate(today, 5),
    };
    const note = await f.rituals.addNote(a, a, request);
    await f.rituals.addNote(a, a, request);
    inbox = await f.activity.inbox(b);
    assert.equal(inbox.filter((n) => n.kind === 'love-note').length, 1);
    assert.ok(!JSON.stringify(inbox).includes(request.text));
    assert.ok(!JSON.stringify(inbox).includes('photoUrl'));
    assert.equal((await f.activity.inbox(c)).length, 0);
    const entry = await f.journal.create(a, {
      title: 'PRIVATE-JOURNAL-NAME',
      note: 'PRIVATE-TEXT',
      date: today,
      kind: 'memory',
      annual: false,
      timelineId: a,
    });
    inbox = await f.activity.inbox(b);
    assert.ok(inbox.some((n) => n.kind === 'memory'));
    assert.ok(!JSON.stringify(inbox).includes(entry.title));
    const buffer = await sharp({
      create: { width: 80, height: 60, channels: 3, background: '#acbd96' },
    })
      .png()
      .toBuffer();
    const file = {
      buffer,
      size: buffer.length,
      originalname: 'fixture.png',
    } as Express.Multer.File;
    await f.journal.upload(b, entry.id, file);
    await f.journal.upload(b, entry.id, file);
    assert.equal(
      (await f.activity.inbox(a)).filter((n) => n.kind === 'photo').length,
      1,
      'multiple uploaded photos group per entry/day',
    );
    const privateEntry = await f.journal.create(a, {
      title: 'Unshared',
      timelineId: privateSpaceId(a),
      note: '',
      date: today,
      kind: 'memory',
      annual: false,
    });
    assert.equal(
      (await f.activity.inbox(b)).filter((n) => n.kind === 'memory').length,
      1,
      'private entries do not notify collaborators',
    );
    await f.activity.markRead(b, 'all');
    assert.ok((await f.activity.inbox(b)).every((n) => n.readAt));
    await f.rituals.removeNote(a, a, note.id, { expectedRevision: 0 });
    assert.ok(!(await f.activity.inbox(b)).some((n) => n.kind === 'love-note'));
    await f.journal.sharing.change(a, invitation.id, { expectedRevision: 1 }, true);
    assert.equal((await f.activity.inbox(b)).length, 0);
    const reinvite = await f.journal.sharing.invite(a, { email: f.emails[1] });
    await f.journal.sharing.change(b, reinvite.id, { expectedRevision: 0, action: 'accept' });
    assert.ok(
      !(await f.activity.inbox(b)).some((n) => n.kind === 'memory'),
      'rejoining does not resurface old activity',
    );
    void privateEntry;
  } finally {
    await f.close();
  }
});
test('rhythm counts real committed actions once/day, handles VN midnight and membership changes', async () => {
  const f = await fixture();
  const [a, b, c] = f.users;
  try {
    const grant = await f.journal.sharing.invite(a, { email: f.emails[1] });
    await f.journal.sharing.change(b, grant.id, { expectedRevision: 0, action: 'accept' });
    const today = todayIn('Asia/Ho_Chi_Minh'),
      day = shiftDate(today, 1),
      open = shiftDate(today, 10);
    f.setNow(day + 'T16:59:59Z');
    const post = (author: string, text: string) =>
      f.rituals.addNote(author, a, {
        requestId: randomUUID(),
        text,
        mode: 'scheduled',
        openDate: open,
      });
    await post(a, 'Secret A');
    await post(a, 'Another A');
    let view = await f.rituals.rhythm(a, a);
    assert.equal(view.myToday, true);
    assert.equal(view.togetherToday, false);
    await post(b, 'Secret B');
    view = await f.rituals.rhythm(a, a);
    assert.equal(view.togetherToday, true);
    assert.equal(view.streak, 1);
    assert.ok(!JSON.stringify(view).includes('Secret'));
    assert.deepEqual(await f.rituals.rhythm(a, a), view, 'opening/refreshing does not count again');
    f.setNow(day + 'T17:00:01Z');
    view = await f.rituals.rhythm(a, a);
    assert.equal(view.today, shiftDate(day, 1));
    assert.equal(view.myToday, false);
    assert.equal(view.streak, 1, 'yesterday remains while today is in progress');
    await assert.rejects(f.rituals.rhythm(c, a));
    await f.journal.sharing.change(a, grant.id, { expectedRevision: 1 }, true);
    await assert.rejects(f.rituals.rhythm(b, a));
    const again = await f.journal.sharing.invite(a, { email: f.emails[1] });
    await f.journal.sharing.change(b, again.id, { expectedRevision: 0, action: 'accept' });
    view = await f.rituals.rhythm(a, a);
    assert.equal(view.streak, 0, 'old sealed actions do not cross membership epochs');
  } finally {
    await f.close();
  }
});
test('weekly rhythm preserves completed days across a break; one person or future data cannot forge a shared day', () => {
  const activity = [
    { date: '2026-11-02', author: 'a' },
    { date: '2026-11-02', author: 'b' },
    { date: '2026-11-04', author: 'a' },
    { date: '2026-11-05', author: 'b' },
    { date: '2026-11-08', author: 'b' },
    { date: '2026-11-04', author: 'c' },
  ];
  const v = summarizeRhythm('s', '2026-11-05', ['a', 'b'], 'a', activity);
  assert.equal(v.completedDays, 1);
  assert.equal(v.activeDays, 3);
  assert.equal(v.streak, 0);
  assert.equal(v.days.length, 7);
  assert.equal(v.days[6].state, 'future');
  assert.equal(summarizeRhythm('s', '2026-11-05', ['a'], 'a', activity).completedDays, 0);
});
test('photo contribution stops counting when the current shared entry has no photos left', async () => {
  const f = await fixture();
  const [a, b] = f.users;
  try {
    const grant = await f.journal.sharing.invite(a, { email: f.emails[1] });
    await f.journal.sharing.change(b, grant.id, { expectedRevision: 0, action: 'accept' });
    const today = todayIn('Asia/Ho_Chi_Minh'),
      tomorrow = shiftDate(today, 1),
      at = new Date(tomorrow + 'T05:00:00Z').toISOString();
    const entry = await f.journal.create(a, {
      title: 'Ảnh metadata fixture',
      note: '',
      date: today,
      kind: 'memory',
      annual: false,
      timelineId: a,
    });
    const next = {
      ...entry,
      revision: entry.revision + 1,
      assets: [
        {
          id: randomUUID(),
          name: 'fixture.webp',
          url: '/api/fixture',
          width: 1,
          height: 1,
          bytes: 1,
        },
      ],
    };
    assert.ok(await f.db.compareAndSwap('journal', entry.id, a, entry.revision, next));
    await f.db.insert('journal-version', randomUUID(), a, {
      entryId: entry.id,
      actorId: b,
      action: 'photo',
      createdAt: at,
    });
    f.setNow(at);
    assert.equal((await f.rituals.rhythm(b, a)).myToday, true);
    assert.ok(
      await f.db.compareAndSwap('journal', entry.id, a, next.revision, {
        ...next,
        revision: next.revision + 1,
        assets: [],
      }),
    );
    assert.equal((await f.rituals.rhythm(b, a)).myToday, false);
  } finally {
    await f.close();
  }
});
