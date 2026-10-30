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

test('named invitations require consent; collaborators edit shared milestones with CAS and photos stay private and charged to their timeline', async () => {
  const f = await fixture(),
    [alice, bob, other] = f.users;
  try {
    const original = await f.journal.create(alice, content);
    await f.journal.create(bob, { ...content, title: 'Riêng của Bob' });
    const grant = await f.journal.sharing.invite(alice, { email: f.emails[1] });
    assert.equal(grant.state, 'pending');
    assert.equal((await f.journal.list(bob)).length, 1);
    await assert.rejects(f.journal.owned(bob, original.id), status(404));
    await assert.rejects(f.journal.create(bob, { ...content, timelineId: alice }), status(404));
    await assert.rejects(
      f.journal.sharing.change(other, grant.id, { expectedRevision: 0, action: 'accept' }),
      status(404),
    );
    await assert.rejects(
      f.journal.sharing.change(alice, grant.id, { expectedRevision: 0, action: 'accept' }),
      status(403),
    );
    await f.journal.sharing.change(bob, grant.id, { expectedRevision: 0, action: 'accept' });
    assert.equal((await f.journal.list(bob)).length, 2);
    assert.equal((await f.journal.list(other)).length, 0);
    const shared = await f.journal.create(bob, {
      ...content,
      timelineId: alice,
      title: 'Bob thêm vào dòng thời gian Alice',
    });
    assert.equal(await f.db.owner('journal', shared.id), alice);
    assert.equal(shared.timelineId, alice);
    assert.equal((await f.journal.list(alice)).length, 2);
    const attempts = await Promise.allSettled([
      f.journal.save(alice, original.id, {
        expectedRevision: 0,
        content: { ...content, note: 'Alice sửa' },
      }),
      f.journal.save(bob, original.id, {
        expectedRevision: 0,
        content: { ...content, note: 'Bob sửa' },
      }),
    ]);
    assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
    const failure = attempts.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.ok(status(409)(failure.reason));
    const uploaded = await f.journal.upload(bob, shared.id, await photo());
    assert.equal(uploaded.timelineId, alice);
    assert.ok((await f.resources.usage(alice)).storageBytes > 0);
    assert.equal((await f.resources.usage(bob)).storageBytes, 0);
    await assert.rejects(f.journal.owned(other, shared.id), status(404));
    const active = (await f.journal.sharing.state(bob)).grants[0];
    await f.journal.sharing.change(bob, grant.id, {
      expectedRevision: active.revision,
      action: 'calendar',
      showOnCalendar: false,
    });
    assert.equal(
      (await f.journal.list(bob)).find((e) => e.id === shared.id)?.calendarVisible,
      false,
    );
    assert.equal(
      (await f.journal.list(alice)).find((e) => e.id === shared.id)?.calendarVisible,
      undefined,
    );
    await assert.rejects(
      f.journal.sharing.change(bob, grant.id, {
        expectedRevision: active.revision,
        action: 'calendar',
        showOnCalendar: true,
      }),
      status(409),
    );
    await f.journal.removeAsset(bob, uploaded.id, uploaded.assets[0].id, {
      expectedRevision: uploaded.revision,
    });
    const current = await f.journal.owned(bob, shared.id);
    await f.journal.remove(bob, shared.id, { expectedRevision: current.revision });
    assert.equal((await f.journal.list(alice)).length, 1);
  } finally {
    await f.close();
  }
});

test('revocation immediately fences reads, updates and in-flight uploads without publishing dangling images', async () => {
  const f = await fixture(),
    [alice, bob] = f.users;
  try {
    const entry = await f.journal.create(alice, content),
      grant = await f.journal.sharing.invite(alice, { email: f.emails[1] });
    await f.journal.sharing.change(bob, grant.id, { expectedRevision: 0, action: 'accept' });
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => (entered = r)),
      resume = new Promise<void>((r) => (release = r)),
      originalPut = f.store.put.bind(f.store);
    f.store.put = async (...args) => {
      await originalPut(...args);
      entered();
      await resume;
    };
    const pending = f.journal.upload(bob, entry.id, await photo());
    const checked = assert.rejects(pending, status(404));
    await started;
    await f.journal.sharing.change(alice, grant.id, { expectedRevision: 1 }, true);
    release();
    await checked;
    assert.equal((await f.journal.owned(alice, entry.id)).assets.length, 0);
    assert.equal((await f.resources.usage(alice)).storageBytes, 0);
    await assert.rejects(f.journal.owned(bob, entry.id), status(404));
    await assert.rejects(
      f.journal.save(bob, entry.id, { expectedRevision: 0, content }),
      status(404),
    );
    assert.equal((await f.journal.list(bob)).length, 0);
    const replacement = await f.journal.sharing.invite(alice, { email: f.emails[1] });
    assert.notEqual(replacement.id, grant.id);
    await assert.rejects(
      f.journal.sharing.change(bob, grant.id, { expectedRevision: 1, action: 'accept' }),
      status(404),
    );
  } finally {
    await f.close();
  }
});

test('sharing survives backup; deleting a member revokes their memberships without deleting the timeline owner milestones', async () => {
  const f = await fixture(),
    [alice, bob] = f.users;
  try {
    const entry = await f.journal.create(alice, content),
      grant = await f.journal.sharing.invite(alice, { email: f.emails[1] });
    await f.journal.sharing.change(bob, grant.id, { expectedRevision: 0, action: 'accept' });
    if (!process.env.TEST_DATABASE_URL) {
      const backup = path.join(f.root, 'snapshot');
      await createBackup(f.db, f.store, backup);
      const restoredRoot = path.join(f.root, 'restore'),
        db = new Repository({ dataDir: restoredRoot, databaseUrl: '' }),
        store = new LocalMediaStore(restoredRoot);
      await db.init();
      await store.ready();
      try {
        await restoreBackup(db, store, backup, true);
        assert.equal(
          (await db.get<{ state: string }>('timeline-grant', grant.id))?.state,
          'active',
        );
      } finally {
        await db.close();
      }
    }
    await f.deletion.request(bob, 'Fixture-password-123!', f.security);
    assert.equal(await f.db.get('timeline-grant', grant.id), undefined);
    assert.equal((await f.journal.sharing.state(alice)).grants.length, 0);
    assert.equal((await f.journal.owned(alice, entry.id)).title, content.title);
    await assert.rejects(f.journal.owned(bob, entry.id), status(404));
  } finally {
    await f.close();
  }
});
test('unverified accounts cannot invite and deletion racing an invitation leaves no residual membership', async () => {
  const f = await fixture(),
    [alice, bob, unverified] = f.users;
  try {
    const account = await f.security.byUser(unverified);
    await f.db.put('account', authHash(f.emails[2]), unverified, {
      ...account,
      emailVerifiedAt: undefined,
    });
    await assert.rejects(f.journal.sharing.invite(unverified, { email: f.emails[0] }), status(403));
    await assert.rejects(f.journal.sharing.invite(alice, { email: f.emails[2] }), status(400));
    await assert.rejects(f.journal.sharing.invite(alice, { email: f.emails[0] }), status(400));
    const results = await Promise.allSettled([
      f.journal.sharing.invite(alice, { email: f.emails[1] }),
      f.deletion.request(bob, 'Fixture-password-123!', f.security),
    ]);
    assert.equal(results[1].status, 'fulfilled');
    assert.equal((await f.journal.sharing.state(alice)).grants.length, 0);
    assert.equal((await f.db.list('timeline-member-index', bob)).length, 0);
    assert.equal((await f.db.list('timeline-grant', alice)).length, 0);
  } finally {
    await f.close();
  }
});
