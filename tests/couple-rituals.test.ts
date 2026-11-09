import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { JournalService } from '../apps/api/src/journal.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { authHash, AccountSecurity, passwordHash } from '../apps/api/src/auth.js';
import { createBackup, restoreBackup } from '../apps/api/src/backup.js';
import { privateSpaceId } from '../apps/api/src/journal-privacy.js';
import { LibraryService } from '../apps/api/src/library.js';

const content = {
  title: 'Ngày chung',
  date: '2026-10-30',
  note: 'Cùng viết một câu chuyện',
  kind: 'memory' as const,
  annual: false,
};
const status = (code: number) => (e: any) => e.getStatus?.() === code || e.status === code;
async function fixture() {
  const root = path.resolve('test-results/timeline-sharing', randomUUID()),
    db = new Repository({ dataDir: root, databaseUrl: process.env.TEST_DATABASE_URL || '' });
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
  const salt = randomUUID(),
    password = (await passwordHash('Fixture-password-123!', salt)).toString('hex');
  for (const [i, id] of users.entries())
    await db.insert('account', authHash(emails[i]), id, {
      id,
      email: emails[i],
      emailVerifiedAt: new Date().toISOString(),
      salt,
      password,
      revision: 0,
    });
  const security = new AccountSecurity(
    db,
    {
      kind: 'disabled',
      async send() {
        throw new Error('No real email in QA');
      },
    },
    'http://127.0.0.1:4311',
  );
  await security.init();
  const close = async () => {
    for (const owner of users) {
      for (const table of [
        'owner_operations',
        'media_objects',
        'managed_media',
        'account_deletions',
      ])
        await db.query('DELETE FROM ' + table + ' WHERE owner=? RETURNING owner', [owner]);
      await db.query('DELETE FROM records WHERE owner=? RETURNING id', [owner]);
    }
    await db.close();
  };
  return { root, db, store, deletion, resources, journal, users, emails, security, close };
}
async function photo() {
  const buffer = await sharp({
    create: { width: 80, height: 60, channels: 3, background: '#b58a72' },
  })
    .png()
    .toBuffer();
  return { buffer, size: buffer.length, originalname: 'shared.png' } as Express.Multer.File;
}

import { CoupleRituals } from '../apps/api/src/couple-rituals.js';
import { jarInput } from '../packages/domain/couple.js';
async function couple() {
  const f = await fixture(),
    [a, b, c] = f.users;
  const grant = await f.journal.sharing.invite(a, { email: f.emails[1] });
  await f.journal.sharing.change(b, grant.id, { expectedRevision: 0, action: 'accept' });
  let now = new Date('2026-11-03T05:00:00Z');
  const rituals = new CoupleRituals(f.db, f.journal, f.deletion, f.resources, () => now);
  return { ...f, a, b, c, grant, rituals, setNow: (value: string) => (now = new Date(value)) };
}
const answer = (q: { id: string; revision: number }, text: string) => ({
  roundId: q.id,
  expectedRevision: q.revision,
  requestId: randomUUID(),
  text,
});
const note = (text: string, openDate = '2026-11-30') => ({
  requestId: randomUUID(),
  text,
  mode: 'scheduled',
  openDate,
});
test('question topics apply tomorrow, use CAS, keep started rounds and reject revoked members', async () => {
  const f = await couple();
  try {
    const today = (await f.rituals.state(f.a, f.a, { catalogVersion: 1 })).daily!;
    const selected = await f.rituals.setQuestionPreferences(f.a, f.a, {
      expectedRevision: -1,
      excluded: ['everyday', 'plans', 'gratitude'],
    });
    assert.equal(selected.effectiveDate, '2026-11-04');
    assert.equal(
      (await f.rituals.state(f.b, f.a, { catalogVersion: 1 })).daily!.prompt,
      today.prompt,
    );
    await assert.rejects(
      f.rituals.setQuestionPreferences(f.b, f.a, { expectedRevision: -1, excluded: [] }),
      status(409),
    );
    await f.rituals.answer(
      f.a,
      f.a,
      {
        ...answer(today, 'Giữ nguyên câu hỏi'),
        promptId: today.promptId,
      },
      true,
    );
    f.setNow('2026-11-04T05:00:00Z');
    const next = (await f.rituals.state(f.b, f.a, { catalogVersion: 1 })).daily!;
    assert.match(next.promptId!, /^memories-v1-/);
    const history = (await f.rituals.state(f.b, f.a)).questions;
    assert.equal(history.find((q) => q.id === today.id)?.prompt, today.prompt);
    await assert.rejects(
      f.rituals.answer(
        f.b,
        f.a,
        { ...answer(next, 'Đã xem câu cũ'), promptId: 'wrong-version' },
        true,
      ),
      status(409),
    );
    await f.journal.sharing.change(f.a, f.grant.id, { expectedRevision: 1 }, true);
    await assert.rejects(
      f.rituals.setQuestionPreferences(f.b, f.a, { expectedRevision: 0, excluded: [] }),
      status(404),
    );
  } finally {
    await f.close();
  }
});
test('legacy and catalog protocols keep the prompt read by each client and fence mixed-version first answers', async () => {
  const f = await couple();
  try {
    await f.rituals.setQuestionPreferences(f.a, f.a, {
      expectedRevision: -1,
      excluded: ['everyday', 'gratitude', 'plans'],
    });
    f.setNow('2026-11-04T05:00:00Z');
    const legacy = (await f.rituals.state(f.a, f.a)).daily!;
    const modern = (await f.rituals.state(f.b, f.a, { catalogVersion: 1 })).daily!;
    assert.equal(legacy.id, modern.id);
    assert.notEqual(legacy.prompt, modern.prompt);
    await f.rituals.answer(f.a, f.a, answer(legacy, 'Theo câu đã đọc trên frontend cũ'));
    await assert.rejects(
      f.rituals.answer(f.b, f.a, { ...answer(modern, 'Câu mới'), promptId: modern.promptId }, true),
      status(409),
    );
    assert.equal(
      (await f.rituals.state(f.b, f.a, { catalogVersion: 1 })).daily!.prompt,
      legacy.prompt,
    );
    f.setNow('2026-11-05T05:00:00Z');
    const oldNext = (await f.rituals.state(f.a, f.a)).daily!,
      newNext = (await f.rituals.state(f.b, f.a, { catalogVersion: 1 })).daily!;
    await f.rituals.answer(
      f.b,
      f.a,
      { ...answer(newNext, 'Theo câu mới'), promptId: newNext.promptId },
      true,
    );
    await assert.rejects(f.rituals.answer(f.a, f.a, answer(oldNext, 'Bản nháp cũ')), status(409));
    assert.equal((await f.rituals.state(f.a, f.a)).daily!.prompt, newNext.prompt);
    assert.equal((await f.db.list('couple-round', f.a)).length, 2);
  } finally {
    await f.close();
  }
});
test('daily question keeps peer text off the wire, supports retry/withdraw/CAS and saves exactly one memory', async () => {
  const f = await couple();
  try {
    const q = (await f.rituals.state(f.a, f.a)).daily!;
    const request = answer(q, 'Bí mật của An');
    const own = await f.rituals.answer(f.a, f.a, {
      ...request,
      revealedAt: 'forged',
      actorId: f.b,
    });
    assert.equal(own.participants.find((p) => p.id === f.a)?.text, 'Bí mật của An');
    let peer = (await f.rituals.state(f.b, f.a)).daily!;
    assert.ok(!JSON.stringify(peer).includes('Bí mật của An'));
    assert.equal(peer.participants.find((p) => p.id === f.a)?.answered, true);
    assert.equal((await f.rituals.answer(f.a, f.a, request)).revision, own.revision);
    await assert.rejects(f.rituals.answer(f.b, f.a, answer(q, 'Chưa đúng revision')), status(409));
    const withdrawn = await f.rituals.withdraw(f.a, f.a, q.id, { expectedRevision: peer.revision });
    assert.equal(withdrawn.participants.find((p) => p.id === f.a)?.answered, false);
    const mine = await f.rituals.answer(f.a, f.a, answer(withdrawn, 'A'.repeat(1200)));
    const opened = await f.rituals.answer(f.b, f.a, answer(mine, 'B'.repeat(1200)));
    assert.ok(opened.revealedAt);
    assert.equal(opened.participants.filter((p) => p.text).length, 2);
    await assert.rejects(
      f.rituals.withdraw(f.a, f.a, q.id, { expectedRevision: opened.revision }),
      status(400),
    );
    const saved = await f.rituals.saveMemory(f.a, f.a, q.id, { expectedRevision: opened.revision });
    assert.deepEqual(
      await f.rituals.saveMemory(f.b, f.a, q.id, { expectedRevision: opened.revision }),
      saved,
    );
    assert.equal((await f.journal.list(f.a)).length, 1);
    assert.ok((await f.journal.read(f.b, saved.id)).note.includes('B'.repeat(1200)));
    await assert.rejects(f.rituals.state(f.c, f.a), status(404));
  } finally {
    await f.close();
  }
});
test('multiple jar deposits are distinct, exact retries are not duplicated, secrets and random draws stay sealed until unanimous consent', async () => {
  const f = await couple();
  try {
    const input = note('Chỉ mình biết'),
      first = await f.rituals.addNote(f.a, f.a, input);
    assert.equal(first.approvalCount, 0);
    assert.equal(first.approvedByMe, false);
    assert.equal((await f.rituals.addNote(f.a, f.a, input)).id, first.id);
    const second = await f.rituals.addNote(f.a, f.a, note('Chỉ mình biết'));
    assert.notEqual(first.id, second.id);
    let peer = await f.rituals.state(f.b, f.a);
    assert.equal(peer.jarTotal, 2);
    assert.ok(!JSON.stringify(peer).includes('Chỉ mình biết'));
    await assert.rejects(f.rituals.draw(f.b, f.a), status(400));
    await assert.rejects(
      f.rituals.removeNote(f.b, f.a, first.id, { expectedRevision: 0 }),
      status(404),
    );
    const peerVoted = await f.rituals.vote(f.b, f.a, first.id, {
      expectedRevision: 0,
      approve: true,
    });
    assert.equal(peerVoted.opened, false);
    assert.equal(peerVoted.text, undefined);
    await assert.rejects(f.rituals.draw(f.b, f.a), status(400));
    const opened = await f.rituals.vote(f.a, f.a, first.id, { expectedRevision: 1, approve: true });
    assert.equal(opened.text, 'Chỉ mình biết');
    assert.equal(opened.opened, true);
    const drawn = await f.rituals.draw(f.b, f.a);
    assert.equal(drawn.id, first.id);
    assert.equal(drawn.revision, opened.revision);
    await assert.rejects(
      f.rituals.vote(f.a, f.a, first.id, { expectedRevision: 0, approve: false }),
      status(409),
    );
    peer = await f.rituals.state(f.b, f.a);
    assert.equal(peer.jar.find((n) => n.id === second.id)?.text, undefined);
    const held = await f.rituals.addNote(f.b, f.a, note('Lời của Bình'));
    assert.equal(
      (await f.rituals.state(f.a, f.a)).jar.find((n) => n.id === held.id)?.text,
      undefined,
      'Anchor cannot read another author sealed text',
    );
  } finally {
    await f.close();
  }
});
test('legacy sealed notes discard implicit votes until everyone explicitly consents; opened notes stay opened', async () => {
  const f = await couple();
  try {
    const n = await f.rituals.addNote(f.a, f.a, note('Lời cũ cần đồng ý lại'));
    const legacy = (await f.db.get<any>('love-note', n.id))!;
    delete legacy.consentVersion;
    legacy.approvals = [f.a];
    await f.db.put('love-note', n.id, f.a, legacy);
    assert.equal((await f.rituals.state(f.a, f.a)).jar[0].approvalCount, 0);
    const voted = await f.rituals.vote(f.b, f.a, n.id, { expectedRevision: 0, approve: true });
    assert.equal(voted.opened, false);
    assert.equal(voted.text, undefined);
    assert.equal(voted.approvalCount, 1);
    const opened = await f.rituals.vote(f.a, f.a, n.id, { expectedRevision: 1, approve: true });
    assert.equal(opened.opened, true);
    const record = (await f.db.get<any>('love-note', n.id))!;
    delete record.consentVersion;
    await f.db.put('love-note', n.id, f.a, record);
    assert.equal((await f.rituals.state(f.b, f.a)).jar[0].text, legacy.text);
  } finally {
    await f.close();
  }
});

test('jar date uses server Vietnam midnight, month-end opens on the last calendar day and invalid/past dates are rejected', async () => {
  const f = await couple();
  try {
    const n = await f.rituals.addNote(f.a, f.a, {
      requestId: randomUUID(),
      text: 'Cuối tháng mở nhé',
      mode: 'month-end',
    });
    assert.equal(n.unlockAt, '2026-11-29T17:00:00.000Z');
    f.setNow('2026-11-29T16:59:59Z');
    assert.equal((await f.rituals.state(f.b, f.a)).jar[0].text, undefined);
    f.setNow('2026-11-29T17:00:00Z');
    assert.equal((await f.rituals.state(f.b, f.a)).jar[0].text, 'Cuối tháng mở nhé');
    assert.equal((await f.rituals.draw(f.b, f.a)).text, 'Cuối tháng mở nhé');
    assert.throws(() => jarInput.parse(note('Sai ngày', '2026-02-30')));
    await assert.rejects(f.rituals.addNote(f.a, f.a, note('Quá khứ', '2026-11-01')), status(400));
    await assert.rejects(f.rituals.addNote(f.a, f.a, note('Quá xa', '2039-01-01')), status(400));
  } finally {
    await f.close();
  }
});
test('membership changes cannot open old sealed items or reveal them to new members; every original member must consent', async () => {
  const f = await couple();
  try {
    const before = await f.rituals.addNote(f.a, f.a, note('Không cho người mới đọc'));
    const initial = (await f.rituals.state(f.a, f.a)).daily!;
    await f.rituals.answer(f.a, f.a, answer(initial, 'Câu trả lời cũ'));
    const gc = await f.journal.sharing.invite(f.a, { email: f.emails[2] });
    await f.journal.sharing.change(f.c, gc.id, { expectedRevision: 0, action: 'accept' });
    assert.equal((await f.rituals.state(f.c, f.a)).jar.length, 0);
    assert.equal((await f.rituals.state(f.a, f.a)).daily, null);
    await assert.rejects(
      f.rituals.vote(f.b, f.a, before.id, { expectedRevision: 0, approve: true }),
      status(400),
    );
    const n = await f.rituals.addNote(f.a, f.a, note('Cần đủ ba người'));
    const voted = await f.rituals.vote(f.b, f.a, n.id, { expectedRevision: 0, approve: true });
    assert.equal(voted.opened, false);
    assert.equal(voted.text, undefined);
    assert.equal(voted.approvalCount, 1);
    const retracted = await f.rituals.vote(f.b, f.a, n.id, { expectedRevision: 1, approve: false });
    assert.equal(retracted.approvalCount, 0);
    const vc = await f.rituals.vote(f.c, f.a, n.id, { expectedRevision: 2, approve: true });
    assert.equal(vc.opened, false);
    const two = await f.rituals.vote(f.b, f.a, n.id, { expectedRevision: 3, approve: true });
    assert.equal(two.opened, false);
    const all = await f.rituals.vote(f.a, f.a, n.id, { expectedRevision: 4, approve: true });
    assert.equal(all.opened, true);
    await f.journal.sharing.change(f.a, f.grant.id, { expectedRevision: 1 }, true);
    await assert.rejects(f.rituals.state(f.b, f.a), status(404));
    await assert.rejects(f.rituals.draw(f.b, f.a), status(404));
    await assert.rejects(
      f.rituals.vote(f.b, f.a, before.id, { expectedRevision: 0, approve: true }),
      status(404),
    );
    f.setNow('2026-11-30T01:00:00Z');
    assert.equal(
      (await f.rituals.state(f.c, f.a)).jar.some((x) => x.id === before.id),
      false,
      'Time never grants old content to new members',
    );
  } finally {
    await f.close();
  }
});
test('simultaneous answers use CAS and a failed CAS rolls back the answer and round together', async () => {
  const f = await couple();
  try {
    const q = (await f.rituals.state(f.a, f.a)).daily!;
    const original = f.db.compareAndSwap.bind(f.db);
    f.db.compareAndSwap = async (...args) =>
      args[0] === 'couple-round' ? false : original(...args);
    await assert.rejects(f.rituals.answer(f.a, f.a, answer(q, 'Không được ghi dở')), status(409));
    assert.equal((await f.db.list('couple-answer', f.a)).length, 0);
    assert.equal((await f.db.list('couple-round', f.a)).length, 0);
    f.db.compareAndSwap = original;
    const results = await Promise.allSettled([
      f.rituals.answer(f.a, f.a, answer(q, 'An')),
      f.rituals.answer(f.b, f.a, answer(q, 'Bình')),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const losing = results[0].status === 'rejected' ? f.a : f.b,
      current = (await f.rituals.state(losing, f.a)).daily!;
    assert.ok(!current.revealedAt);
    assert.ok(
      (await f.rituals.answer(losing, f.a, answer(current, 'Gửi lại có chủ động'))).revealedAt,
    );
  } finally {
    await f.close();
  }
});
test('SQL pagination has stable ties, author quotas are transactional and deleting a contributor removes their text', async () => {
  const f = await couple();
  try {
    for (let i = 0; i < 15; i++) await f.rituals.addNote(f.a, f.a, note('Mảnh ' + i));
    const one = await f.rituals.state(f.b, f.a),
      two = await f.rituals.state(f.b, f.a, { page: 1 });
    assert.equal(one.jar.length, 12);
    assert.equal(two.jar.length, 3);
    assert.equal(one.jarTotal, 15);
    assert.equal(new Set([...one.jar, ...two.jar].map((n) => n.id)).size, 15);
    assert.ok(Buffer.byteLength(JSON.stringify(one)) < 15000, 'Sealed page stays lightweight');
    const original = f.resources.admitTextRecord.bind(f.resources);
    f.resources.admitTextRecord = async (owner, kind) => original(owner, kind, 15);
    await assert.rejects(
      f.rituals.addNote(f.a, f.a, note('Vượt giới hạn')),
      (e: any) => e.status === 429,
    );
    f.resources.admitTextRecord = original;
    await f.rituals.addNote(f.b, f.a, note('Bình xóa tài khoản'));
    const q = (await f.rituals.state(f.b, f.a)).daily!;
    await f.rituals.answer(f.b, f.a, answer(q, 'Nội dung sẽ xóa'));
    await f.deletion.request(f.b, 'Fixture-password-123!', f.security);
    assert.equal((await f.db.list('love-note', f.b)).length, 0);
    assert.equal((await f.db.list('couple-answer', f.b)).length, 0);
    assert.equal((await f.rituals.state(f.a, f.a)).jarTotal, 15);
  } finally {
    await f.close();
  }
});

test('reinvitation does not reuse sealed daily answers and past questions can complete only with their original membership', async () => {
  const f = await couple();
  try {
    const q = (await f.rituals.state(f.a, f.a)).daily!;
    await f.rituals.answer(f.a, f.a, answer(q, 'Giữ kín từ ngày đầu'));
    f.setNow('2026-11-04T05:00:00Z');
    const history = await f.rituals.state(f.b, f.a);
    assert.notEqual(history.daily!.id, q.id);
    assert.equal(history.questions.length, 1);
    assert.equal(history.questions[0].participants.find((p) => p.id === f.a)?.text, undefined);
    const opened = await f.rituals.answer(
      f.b,
      f.a,
      answer(history.questions[0], 'Có thể trả lời muộn'),
    );
    assert.ok(opened.revealedAt);
    const today = history.daily!;
    await f.rituals.answer(f.a, f.a, answer(today, 'Chưa mở khi rời nhóm'));
    await f.journal.sharing.change(f.a, f.grant.id, { expectedRevision: 1 }, true);
    const invitation = await f.journal.sharing.invite(f.a, { email: f.emails[1] });
    await f.journal.sharing.change(f.b, invitation.id, { expectedRevision: 0, action: 'accept' });
    const next = (await f.rituals.state(f.b, f.a)).daily!;
    assert.notEqual(next.id, today.id);
    const sealed = (await f.rituals.state(f.b, f.a)).questions.find((r) => r.id === today.id)!;
    assert.equal(sealed.membersChanged, true);
    assert.equal(sealed.participants.find((p) => p.id === f.a)?.text, undefined);
    await assert.rejects(
      f.rituals.answer(f.b, f.a, answer(sealed, 'Không mở lại lượt cũ')),
      status(403),
    );
  } finally {
    await f.close();
  }
});
test('deleting the space anchor removes other authors contributions without touching their separate spaces', async () => {
  const f = await couple();
  try {
    const ga = await f.rituals.addNote(f.b, f.a, note('Dữ liệu không gian An'));
    const invitation = await f.journal.sharing.invite(f.c, { email: f.emails[1] });
    await f.journal.sharing.change(f.b, invitation.id, { expectedRevision: 0, action: 'accept' });
    const other = await f.rituals.addNote(f.b, f.c, note('Giữ ở không gian khác'));
    await f.deletion.request(f.a, 'Fixture-password-123!', f.security);
    assert.equal(await f.db.get('love-note', ga.id), undefined);
    assert.ok(await f.db.get('love-note', other.id));
    await assert.rejects(f.rituals.state(f.b, f.a), status(404));
    assert.equal((await f.rituals.state(f.b, f.c)).jarTotal, 1);
  } finally {
    await f.close();
  }
});
test('local backup restores sealed answers, jar schedule, identities and consent without exposing text', async (t) => {
  if (process.env.TEST_DATABASE_URL) {
    t.skip('Full PostgreSQL backup/restore is covered by the dedicated backup runner');
    return;
  }
  const f = await couple();
  try {
    const q = (await f.rituals.state(f.a, f.a)).daily!;
    await f.rituals.answer(f.a, f.a, answer(q, 'Bản sao vẫn phải kín'));
    const n = await f.rituals.addNote(f.a, f.a, note('Lời nhắn trong backup'));
    const snapshot = path.join(f.root, 'ritual-snapshot');
    await createBackup(f.db, f.store, snapshot);
    const restoredRoot = path.join(f.root, 'ritual-restore'),
      db = new Repository({ dataDir: restoredRoot, databaseUrl: '' }),
      store = new LocalMediaStore(restoredRoot);
    await db.init();
    await store.ready();
    try {
      await restoreBackup(db, store, snapshot, true);
      const jobs = new JobRepository(db),
        deletion = new AccountDeletion(db, jobs, store, restoredRoot),
        resources = new ResourcePolicy(db, store, restoredRoot),
        journal = new JournalService(db, store, resources, deletion);
      await jobs.init();
      await deletion.init();
      await resources.init();
      const rituals = new CoupleRituals(
        db,
        journal,
        deletion,
        resources,
        () => new Date('2026-11-03T05:00:00Z'),
      );
      const peer = await rituals.state(f.b, f.a);
      assert.ok(!JSON.stringify(peer).includes('Bản sao vẫn phải kín'));
      assert.ok(!JSON.stringify(peer).includes('Lời nhắn trong backup'));
      assert.equal(peer.jar[0].id, n.id);
      assert.equal(peer.jar[0].approvalCount, 0);
      assert.equal(peer.jar[0].unlockAt, n.unlockAt);
      assert.equal(
        (await rituals.state(f.a, f.a)).daily!.participants.find((p) => p.id === f.a)?.text,
        'Bản sao vẫn phải kín',
      );
    } finally {
      await db.close();
    }
  } finally {
    await f.close();
  }
});

test('a first answer typed across midnight keeps its original prompt and can be completed from history', async () => {
  const f = await couple();
  try {
    const q = (await f.rituals.state(f.a, f.a)).daily!;
    f.setNow('2026-11-03T17:00:01Z');
    const posted = await f.rituals.answer(f.a, f.a, {
      ...answer(q, 'Bản nháp qua ngày mới'),
      date: q.date,
    });
    assert.equal(posted.date, '2026-11-03');
    assert.equal(posted.prompt, q.prompt);
    const next = await f.rituals.state(f.b, f.a);
    assert.equal(next.today, '2026-11-04');
    assert.notEqual(next.daily!.id, q.id);
    assert.equal(next.questions[0].id, q.id);
    assert.equal(next.questions[0].participants.find((p) => p.id === f.a)?.text, undefined);
    const revealed = await f.rituals.answer(
      f.b,
      f.a,
      answer(next.questions[0], 'Vẫn cùng mở câu hôm qua'),
    );
    assert.ok(revealed.revealedAt);
    await assert.rejects(
      f.rituals.answer(f.a, f.a, {
        ...answer({ id: randomUUID(), revision: -1 }, 'Không tạo câu ở tương lai'),
        date: '2027-01-01',
      }),
      status(400),
    );
  } finally {
    await f.close();
  }
});
