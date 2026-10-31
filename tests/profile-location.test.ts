import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { JournalService } from '../apps/api/src/journal.js';
import { ProfileService } from '../apps/api/src/profiles.js';
import { profileView } from '../apps/api/src/profile-view.js';
import { authHash, passwordHash, AccountSecurity } from '../apps/api/src/auth.js';
import { createBackup, restoreBackup } from '../apps/api/src/backup.js';
import { groupJournalDays } from '../packages/domain/journal-feed.js';
import { journalContentSchema } from '../packages/domain/journal.js';
const status = (code: number) => (e: any) => e.getStatus?.() === code || e.status === code;
async function fixture() {
  const root = path.resolve('test-results/profiles', randomUUID()),
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
    profiles = new ProfileService(db, store, resources, deletion, journal.sharing),
    users = [randomUUID(), randomUUID(), randomUUID()];
  const salt = randomUUID(),
    password = (await passwordHash('profile-password-123', salt)).toString('hex');
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
        throw new Error('No email in QA');
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
    profiles,
    users,
    security,
    async close() {
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
    },
  };
}
test('profile names preserve credentials; normalized avatars stay private, survive backup and remain referenced', async () => {
  const f = await fixture(),
    [alice, bob, other] = f.users;
  try {
    const account = await f.security.byUser(alice);
    assert.equal((await profileView(f.db, alice)).profileRevision, -1);
    const named = await f.profiles.save(alice, { displayName: 'Minh An', expectedRevision: -1 });
    assert.equal(named.displayName, 'Minh An');
    assert.deepEqual(await f.security.byUser(alice), account);
    await assert.rejects(
      f.profiles.save(alice, { displayName: 'Tên khác', expectedRevision: -1 }),
      status(409),
    );
    const buffer = await sharp({
        create: { width: 1200, height: 800, channels: 3, background: '#accc98' },
      })
        .png()
        .toBuffer(),
      file = { buffer, size: buffer.length, originalname: 'me.png' } as Express.Multer.File;
    const avatar = await f.profiles.upload(alice, file, { expectedRevision: '0' });
    assert.ok(avatar.avatarUrl);
    const key = await f.profiles.avatar(alice, alice),
      metadata = await sharp(await f.store.read(key)).metadata();
    assert.equal(metadata.width, 256);
    assert.equal(metadata.height, 256);
    assert.equal(metadata.exif, undefined);
    assert.ok((await f.resources.references()).has(key));
    await assert.rejects(f.profiles.avatar(other, alice), status(404));
    const grant = await f.journal.sharing.invite(alice, { email: bob + '@example.test' });
    await assert.rejects(f.profiles.avatar(bob, alice), status(404));
    await f.journal.sharing.change(bob, grant.id, { expectedRevision: 0, action: 'accept' });
    assert.equal(await f.profiles.avatar(bob, alice), key);
    assert.equal((await f.journal.sharing.state(bob)).grants[0].ownerLabel, 'Minh An');
    const bobProfile = await f.profiles.upload(bob, file, { expectedRevision: '-1' });
    assert.ok(bobProfile.avatarUrl);
    assert.ok(await f.profiles.avatar(alice, bob));
    if (!process.env.TEST_DATABASE_URL) {
      const backup = path.join(f.root, 'snapshot');
      await createBackup(f.db, f.store, backup);
      const targetRoot = path.join(f.root, 'restored'),
        db = new Repository({ dataDir: targetRoot, databaseUrl: '' }),
        store = new LocalMediaStore(targetRoot);
      await db.init();
      await store.ready();
      try {
        await restoreBackup(db, store, backup, true);
        assert.equal((await profileView(db, alice)).displayName, 'Minh An');
        assert.deepEqual(await store.read(key), await f.store.read(key));
      } finally {
        await db.close();
      }
    }
    const replacement = await f.profiles.upload(alice, file, {
      expectedRevision: String(avatar.profileRevision),
    });
    assert.notEqual(replacement.avatarUrl, avatar.avatarUrl);
    await assert.rejects(f.store.read(key));
    await f.journal.sharing.change(alice, grant.id, { expectedRevision: 1 }, true);
    await assert.rejects(f.profiles.avatar(bob, alice), status(404));
    await assert.rejects(f.profiles.avatar(alice, bob), status(404));
    const receipt = await f.deletion.request(alice, 'profile-password-123', f.security);
    await f.deletion.tick();
    assert.equal((await f.deletion.status(receipt)).status, 'completed');
    assert.equal(await f.db.get('profile', alice), undefined);
    await assert.rejects(f.profiles.avatar(alice, alice), status(404));
  } finally {
    await f.close();
  }
});
test('location is optional, validated and preserved through shared editing; grouping keeps source dates and separates album cards', async () => {
  const content = {
    title: 'Hẹn đầu',
    date: '2026-10-31',
    note: 'Một góc nhỏ',
    kind: 'memory' as const,
    annual: false,
  };
  assert.equal(journalContentSchema.safeParse(content).success, true);
  for (const location of [
    { label: 'Sai', latitude: NaN, longitude: 10 },
    { label: 'Sai', latitude: 86, longitude: 10 },
    { label: 'Sai', latitude: 10, longitude: 181 },
  ])
    assert.equal(journalContentSchema.safeParse({ ...content, location }).success, false);
  const f = await fixture(),
    [alice, bob] = f.users;
  try {
    const grant = await f.journal.sharing.invite(alice, { email: bob + '@example.test' });
    await f.journal.sharing.change(bob, grant.id, { expectedRevision: 0, action: 'accept' });
    const location = { label: 'Hội An', latitude: 15.88, longitude: 108.33 },
      entry = await f.journal.create(alice, { ...content, location });
    const saved = await f.journal.save(bob, entry.id, {
      expectedRevision: 0,
      content: { ...content, location, note: 'Cùng viết' },
    });
    assert.deepEqual(saved.location, location);
    const cleared = await f.journal.save(alice, entry.id, {
      expectedRevision: 1,
      content: { ...content, location: null },
    });
    assert.equal(cleared.location, null);
    const items = [
      { ...entry, id: 'note', kind: 'note' as const },
      { ...entry, id: 'start-book', album: { id: 'book' } },
      { ...entry, id: 'memory' },
      { ...entry, id: 'annual', date: '2024-10-31', occurrenceDate: '2026-10-31' },
    ];
    const groups = groupJournalDays(items);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].items[0].id, 'start-book');
    assert.equal(groups[0].items.at(-1)!.id, 'note');
    assert.equal(items[3].date, '2024-10-31');
    assert.equal(items[0].id, 'note');
  } finally {
    await f.close();
  }
});
