import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { JournalService } from '../apps/api/src/journal.js';
import { JournalSocial } from '../apps/api/src/journal-social.js';
import { authHash, passwordHash, AccountSecurity } from '../apps/api/src/auth.js';
import { createBackup, restoreBackup } from '../apps/api/src/backup.js';
import { memoriesOnThisDay } from '../packages/domain/journal.js';
const content = {
  title: 'Một ngày đẹp',
  note: 'Câu chuyện đầu',
  date: '2024-11-02',
  kind: 'memory' as const,
  annual: false,
};
const status = (value: number) => (e: any) => e.getStatus?.() === value || e.status === value;
async function fixture() {
  const root = path.resolve('test-results/community', randomUUID()),
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
    social = new JournalSocial(db, journal),
    users = [randomUUID(), randomUUID(), randomUUID()];
  const salt = randomUUID(),
    password = (await passwordHash('Community-password-123!', salt)).toString('hex');
  for (const id of users)
    await db.insert('account', authHash(id + '@example.test'), id, {
      id,
      email: id + '@example.test',
      emailVerifiedAt: new Date().toISOString(),
      salt,
      password,
    });
  const security = new AccountSecurity(
    db,
    {
      kind: 'test',
      async send() {
        throw new Error('No mail');
      },
    },
    'http://127.0.0.1:4311',
  );
  await security.init();
  return {
    root,
    db,
    store,
    deletion,
    resources,
    journal,
    social,
    users,
    security,
    async close() {
      for (const id of users) {
        for (const table of [
          'owner_operations',
          'media_objects',
          'managed_media',
          'account_deletions',
        ])
          await db.query('DELETE FROM ' + table + ' WHERE owner=? RETURNING owner', [id]);
        await db.query('DELETE FROM records WHERE owner=? RETURNING id', [id]);
      }
      await db.close();
    },
  };
}
test('journal versions retain removed images through backup; trash/restore/purge enforce current grants and revisions', async () => {
  const f = await fixture(),
    [alice, bob, other] = f.users;
  try {
    const grant = await f.journal.sharing.invite(alice, { email: bob + '@example.test' });
    await f.journal.sharing.change(bob, grant.id, { expectedRevision: 0, action: 'accept' });
    let entry = await f.journal.create(alice, content);
    const bytes = await sharp({
      create: { width: 80, height: 100, channels: 3, background: '#8d9d73' },
    })
      .png()
      .toBuffer();
    entry = await f.journal.upload(bob, entry.id, {
      buffer: bytes,
      size: bytes.length,
      originalname: 'private.png',
    } as Express.Multer.File);
    const photo = entry.assets[0],
      version = (await f.journal.history(alice, entry.id))[0];
    entry = await f.journal.removeAsset(bob, entry.id, photo.id, {
      expectedRevision: entry.revision,
    });
    assert.ok((await f.resources.references()).has('journal/' + photo.id + '.jpg'));
    assert.equal(
      await f.journal.archivedAsset(bob, version.id, photo.id, true),
      'journal/' + photo.id + '.jpg',
    );
    await assert.rejects(f.journal.history(other, entry.id), status(404));
    const count = (await f.journal.history(alice, entry.id)).length;
    await assert.rejects(
      f.journal.restore(bob, entry.id, { expectedRevision: 0 }, version.id),
      status(409),
    );
    assert.equal((await f.journal.history(alice, entry.id)).length, count);
    if (f.db.driver === 'sqlite') {
      const backup = path.join(f.root, 'backup');
      await createBackup(f.db, f.store, backup);
      const root = path.join(f.root, 'restored'),
        db = new Repository({ dataDir: root, databaseUrl: '' }),
        store = new LocalMediaStore(root);
      await db.init();
      await store.ready();
      try {
        await restoreBackup(db, store, backup, true);
        assert.deepEqual(
          await store.read('journal/' + photo.id + '.jpg'),
          await f.store.read('journal/' + photo.id + '.jpg'),
        );
        assert.ok((await db.list('journal-version', alice)).length);
      } finally {
        await db.close();
      }
    }
    entry = await f.journal.restore(
      bob,
      entry.id,
      { expectedRevision: entry.revision },
      version.id,
    );
    assert.equal(entry.assets[0].id, photo.id);
    assert.ok(entry.assets[0].url.includes('/journal/' + entry.id + '/assets/'));
    await f.journal.remove(bob, entry.id, { expectedRevision: entry.revision });
    assert.equal((await f.journal.list(alice)).length, 0);
    await assert.rejects(f.journal.owned(bob, entry.id), status(404));
    const trash = (await f.journal.trash(bob))[0];
    assert.ok(trash.assets[0].url.includes('/journal-trash/'));
    assert.ok(await f.store.read('journal/' + photo.id + '.jpg'));
    await assert.rejects(
      f.journal.purge(bob, entry.id, { expectedRevision: trash.revision }),
      status(403),
    );
    entry = await f.journal.restore(bob, entry.id, { expectedRevision: trash.revision });
    for (let i = 0; i < 22; i++)
      entry = await f.journal.save(alice, entry.id, {
        expectedRevision: entry.revision,
        content: { ...content, note: 'Bản ' + i },
      });
    assert.equal((await f.journal.history(alice, entry.id)).length, 20);
    const latest = (await f.journal.history(alice, entry.id))[0];
    await f.journal.sharing.change(alice, grant.id, { expectedRevision: 1 }, true);
    await assert.rejects(f.journal.history(bob, entry.id), status(404));
    await assert.rejects(f.journal.archivedAsset(bob, latest.id, photo.id, true), status(404));
    await f.journal.remove(alice, entry.id, { expectedRevision: entry.revision });
    const deleted = (await f.journal.trash(alice))[0];
    await f.journal.purge(alice, entry.id, { expectedRevision: deleted.revision });
    await assert.rejects(f.store.read('journal/' + photo.id + '.jpg'));
    assert.equal((await f.db.list('journal-version', alice)).length, 0);
  } finally {
    await f.close();
  }
});
test('comments and reactions are private, bounded/idempotent, and removed with their author or timeline', async () => {
  const f = await fixture(),
    [alice, bob, other] = f.users;
  try {
    const grant = await f.journal.sharing.invite(alice, { email: bob + '@example.test' });
    await f.journal.sharing.change(bob, grant.id, { expectedRevision: 0, action: 'accept' });
    const entry = await f.journal.create(alice, content),
      requestId = randomUUID();
    await f.social.comment(bob, entry.id, { text: 'Nhớ ngày ấy', requestId });
    await f.social.comment(bob, entry.id, { text: 'Nhớ ngày ấy', requestId });
    await f.social.comment(alice, entry.id, { text: 'Mình cũng vậy', requestId: randomUUID() });
    let state = await f.social.state(alice, entry.id);
    assert.equal(state.comments.length, 2);
    await assert.rejects(f.social.state(other, entry.id), status(404));
    const mine = state.comments.find((c) => c.actorId === alice)!;
    await assert.rejects(f.social.removeComment(bob, entry.id, mine.id), status(403));
    await f.social.react(bob, entry.id, { emoji: 'heart' });
    await f.social.react(bob, entry.id, { emoji: 'heart' });
    assert.equal(
      (await f.social.state(alice, entry.id)).reactions.find((r) => r.emoji === 'heart')?.count,
      1,
    );
    await f.social.react(bob, entry.id, { emoji: 'hug' });
    assert.equal(
      (await f.social.state(bob, entry.id)).reactions.find((r) => r.emoji === 'hug')?.mine,
      true,
    );
    await f.journal.sharing.change(alice, grant.id, { expectedRevision: 1 }, true);
    await assert.rejects(
      f.social.comment(bob, entry.id, { text: 'No', requestId: randomUUID() }),
      status(404),
    );
    const receipt = await f.deletion.request(bob, 'Community-password-123!', f.security);
    await f.deletion.tick();
    assert.equal((await f.deletion.status(receipt)).status, 'completed');
    state = await f.social.state(alice, entry.id);
    assert.equal(state.comments.length, 1);
    assert.ok(state.reactions.every((r) => r.count === 0));
    const deleted = await f.deletion.request(alice, 'Community-password-123!', f.security);
    await f.deletion.tick();
    assert.equal((await f.deletion.status(deleted)).status, 'completed');
    assert.equal(
      (
        await f.db.query(
          "SELECT id FROM records WHERE kind IN ('journal-comment','journal-reaction','journal-version') AND owner IN (?,?,?)",
          f.users,
        )
      ).length,
      0,
    );
  } finally {
    await f.close();
  }
});
test('on this day uses original calendar dates, excludes plans/trash/today and handles leap dates without shifting', () => {
  const rows = [
    { date: '2024-02-29', kind: 'memory' as const },
    { date: '2020-02-29', kind: 'note' as const },
    { date: '2024-02-29', kind: 'plan' as const },
    { date: '2024-02-29', kind: 'memory' as const, deletedAt: '2026-01-01' },
  ];
  assert.equal(memoriesOnThisDay(rows, '2028-02-29').length, 2);
  assert.equal(memoriesOnThisDay(rows, '2027-02-28').length, 0);
  assert.equal(memoriesOnThisDay(rows, '2024-02-29').length, 1);
  assert.equal(rows[0].date, '2024-02-29');
});
