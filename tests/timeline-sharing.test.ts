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

test('private space remains private before and after inviting; switching scope fences feed, photos, history and collaborators', async () => {
  const f = await fixture(),
    [a, b] = f.users;
  try {
    let personal = await f.journal.create(a, {
      ...content,
      timelineId: privateSpaceId(a),
      title: 'Nhật ký riêng',
    });
    personal = await f.journal.upload(a, personal.id, await photo());
    const photoId = personal.assets[0].id;
    const grant = await f.journal.sharing.invite(a, { email: f.emails[1] });
    await f.journal.sharing.change(b, grant.id, { expectedRevision: 0, action: 'accept' });
    await assert.rejects(f.journal.read(b, personal.id), status(404));
    assert.equal((await f.journal.list(b)).length, 0);
    const library = new LibraryService(f.db, f.journal);
    assert.equal((await library.page(b, {})).total, 0);
    assert.equal((await library.page(b, {}, true)).total, 0);
    const before = await f.journal.state(b);
    personal = await f.journal.save(a, personal.id, {
      expectedRevision: personal.revision,
      content: { ...content, title: 'Vẫn riêng tư' },
    });
    assert.deepEqual(
      await f.journal.state(b),
      before,
      'Private journal updates cannot invalidate another member scope',
    );
    const spaces = (await f.journal.sharing.state(a)).spaces!;
    assert.ok(spaces.some((s) => !s.shared && s.id === privateSpaceId(a)));
    assert.ok(spaces.some((s) => s.shared && s.id === a));
    personal = await f.journal.save(a, personal.id, {
      expectedRevision: personal.revision,
      spaceId: a,
      content,
    });
    assert.equal((await f.journal.read(b, personal.id)).id, personal.id);
    const sharedVersion = (await f.journal.history(b, personal.id))[0];
    await assert.rejects(
      f.journal.save(b, personal.id, {
        expectedRevision: personal.revision,
        spaceId: privateSpaceId(b),
        content,
      }),
      status(403),
    );
    personal = await f.journal.save(a, personal.id, {
      expectedRevision: personal.revision,
      spaceId: privateSpaceId(a),
      content,
    });
    await assert.rejects(f.journal.read(b, personal.id), status(404));
    await assert.rejects(f.journal.archivedAsset(b, sharedVersion.id, photoId, true), status(404));
    personal = await f.journal.restore(
      a,
      personal.id,
      { expectedRevision: personal.revision },
      sharedVersion.id,
    );
    assert.equal(
      personal.visibility,
      'private',
      'Restoring old shared history cannot republish a private entry',
    );
    assert.equal(personal.assets[0].id, photoId);
    await assert.rejects(f.journal.read(b, personal.id), status(404));
  } finally {
    await f.close();
  }
});

test('legacy private records are frozen before first invite while previously shared records remain readable', async () => {
  const f = await fixture(),
    [a, b] = f.users;
  try {
    const legacy = await f.journal.create(a, content);
    await f.db.put('journal', legacy.id, a, { ...legacy, visibility: undefined });
    const grant = await f.journal.sharing.invite(a, { email: f.emails[1] });
    await f.journal.sharing.change(b, grant.id, { expectedRevision: 0, action: 'accept' });
    assert.equal((await f.journal.read(a, legacy.id)).visibility, 'private');
    await assert.rejects(f.journal.read(b, legacy.id), status(404));
    const priorShared = await f.journal.create(a, { ...content, timelineId: a });
    await f.db.put('journal', priorShared.id, a, { ...priorShared, visibility: undefined });
    assert.equal((await f.journal.read(b, priorShared.id)).id, priorShared.id);
  } finally {
    await f.close();
  }
});

test('shared space identity, authors and version probes agree for both members without attributing a post to its storage owner', async () => {
  const f = await fixture(),
    [a, b, other] = f.users;
  try {
    await f.db.insert('profile', a, a, { displayName: 'An', revision: 0 });
    await f.db.insert('profile', b, b, { displayName: 'Bình', revision: 0 });
    const grant = await f.journal.sharing.invite(a, { email: f.emails[1] });
    await f.journal.sharing.change(b, grant.id, { expectedRevision: 0, action: 'accept' });
    const aSpace = (await f.journal.sharing.state(a)).spaces!.find((s) => s.shared)!;
    const bSpace = (await f.journal.sharing.state(b)).spaces!.find((s) => s.shared)!;
    assert.deepEqual(aSpace, bSpace);
    assert.equal(aSpace.id, a);
    const before = await f.journal.state(a);
    assert.deepEqual(await f.journal.state(a), before);
    const entry = await f.journal.create(b, { ...content, timelineId: a, createdBy: a });
    assert.equal(entry.createdBy, b);
    assert.equal(entry.authorName, 'Bình');
    assert.equal((await f.journal.read(a, entry.id)).authorName, 'Bình');
    const raw = (await f.db.get('journal', entry.id)) as Record<string, unknown>;
    await f.db.put('journal', entry.id, a, { ...raw, createdBy: undefined });
    assert.equal(
      (await f.journal.read(a, entry.id)).authorName,
      'Bình',
      'Legacy create checkpoint identifies the real author',
    );
    await f.db.put('journal', entry.id, a, raw);
    const edited = await f.journal.save(a, entry.id, {
      expectedRevision: entry.revision,
      content: { ...content, note: 'An bổ sung', createdBy: a },
    });
    assert.equal(edited.createdBy, b);
    assert.equal(edited.updatedBy, a);
    assert.equal(edited.authorName, 'Bình');
    assert.notEqual((await f.journal.state(a)).version, before.version);
    await assert.rejects(f.journal.sharing.space(other, a), status(404));
    const beforeLeave = await f.journal.state(b);
    await f.journal.sharing.change(b, grant.id, { expectedRevision: 1 }, true);
    assert.notEqual((await f.journal.state(b)).scope, beforeLeave.scope);
    await assert.rejects(f.journal.read(b, entry.id), status(404));
    assert.equal((await f.journal.read(a, entry.id)).authorName, 'Thành viên trước đây');
  } finally {
    await f.close();
  }
});

test('assigned checklists survive completion, photos, conversion, revision conflicts and history; outsiders cannot be assigned', async () => {
  const f = await fixture(),
    [a, b, other] = f.users;
  try {
    const grant = await f.journal.sharing.invite(a, { email: f.emails[1] });
    await f.journal.sharing.change(b, grant.id, { expectedRevision: 0, action: 'accept' });
    const task = { id: randomUUID(), text: 'Mang máy ảnh', done: false, assigneeId: b };
    const plan = { status: 'planned' as const, checklist: [task] };
    await assert.rejects(
      f.journal.create(a, {
        ...content,
        kind: 'plan',
        plan: { ...plan, checklist: [{ ...task, assigneeId: other }] },
      }),
      status(400),
    );
    let entry = await f.journal.create(b, { ...content, timelineId: a, kind: 'plan', plan });
    const originalId = entry.id;
    await assert.rejects(
      f.journal.save(a, entry.id, {
        expectedRevision: 0,
        content: { ...content, kind: 'plan', plan: { ...plan, checklist: [task, task] } },
      }),
    );
    entry = await f.journal.save(a, entry.id, {
      expectedRevision: 0,
      content: {
        ...content,
        kind: 'plan',
        plan: { ...plan, status: 'completed', checklist: [{ ...task, done: true }] },
      },
    });
    assert.ok(entry.completedAt);
    await assert.rejects(
      f.journal.save(b, entry.id, {
        expectedRevision: 0,
        content: { ...content, kind: 'plan', plan },
      }),
      status(409),
    );
    entry = await f.journal.upload(b, entry.id, await photo());
    const asset = entry.assets[0];
    entry = await f.journal.save(b, entry.id, {
      expectedRevision: entry.revision,
      content: { ...content, kind: 'memory', plan: entry.plan },
    });
    assert.equal(entry.id, originalId);
    assert.equal(entry.createdBy, b);
    assert.equal(entry.assets[0].id, asset.id);
    assert.equal(entry.plan?.status, 'completed');
    assert.equal(entry.plan?.checklist[0].done, true);
    assert.ok((await f.journal.history(a, entry.id)).some((v) => v.snapshot.kind === 'plan'));
    await f.journal.sharing.change(a, grant.id, { expectedRevision: 1 }, true);
    await assert.rejects(
      f.journal.save(b, entry.id, { expectedRevision: entry.revision, content }),
      status(404),
    );
    const stale = await f.journal.save(a, entry.id, {
      expectedRevision: entry.revision,
      content: { ...content, plan: entry.plan },
    });
    assert.equal(
      stale.plan?.checklist[0].assigneeId,
      b,
      'Historical assignment is retained without granting access',
    );
  } finally {
    await f.close();
  }
});

test('co-members can view profile avatars only while both belong to a current shared space', async () => {
  const f = await fixture(),
    [owner, a, b] = f.users;
  try {
    const ga = await f.journal.sharing.invite(owner, { email: f.emails[1] }),
      gb = await f.journal.sharing.invite(owner, { email: f.emails[2] });
    await f.journal.sharing.change(a, ga.id, { expectedRevision: 0, action: 'accept' });
    await assert.rejects(f.journal.sharing.profileAccess(a, b), status(404));
    await f.journal.sharing.change(b, gb.id, { expectedRevision: 0, action: 'accept' });
    await f.journal.sharing.profileAccess(a, b);
    await f.journal.sharing.change(owner, gb.id, { expectedRevision: 1 }, true);
    await assert.rejects(f.journal.sharing.profileAccess(a, b), status(404));
  } finally {
    await f.close();
  }
});

test('named invitations require consent; collaborators edit shared milestones with CAS and photos stay private and charged to their timeline', async () => {
  const f = await fixture(),
    [alice, bob, other] = f.users;
  try {
    const original = await f.journal.create(alice, { ...content, timelineId: alice });
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
    const entry = await f.journal.create(alice, { ...content, timelineId: alice }),
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

test('moving shared milestone to private fences in-flight collaborator uploads while membership stays active', async () => {
  const f = await fixture(),
    [alice, bob] = f.users;
  let release: (() => void) | undefined;
  try {
    const entry = await f.journal.create(alice, { ...content, timelineId: alice });
    const grant = await f.journal.sharing.invite(alice, { email: f.emails[1] });
    await f.journal.sharing.change(bob, grant.id, { expectedRevision: 0, action: 'accept' });
    let entered!: () => void;
    const started = new Promise<void>((r) => (entered = r)),
      resume = new Promise<void>((r) => (release = r));
    const put = f.store.put.bind(f.store);
    f.store.put = async (...args) => {
      await put(...args);
      entered();
      await resume;
    };
    const checked = assert.rejects(f.journal.upload(bob, entry.id, await photo()), status(404));
    await started;
    await f.journal.save(alice, entry.id, {
      expectedRevision: entry.revision,
      content,
      spaceId: privateSpaceId(alice),
    });
    release!();
    await checked;
    await f.journal.sharing.access(bob, alice);
    assert.equal((await f.journal.owned(alice, entry.id)).assets.length, 0);
    assert.equal((await f.resources.usage(alice)).storageBytes, 0);
    await assert.rejects(f.journal.owned(bob, entry.id), status(404));
  } finally {
    release?.();
    await f.close();
  }
});

test('sharing survives backup; deleting a member revokes their memberships without deleting the timeline owner milestones', async () => {
  const f = await fixture(),
    [alice, bob] = f.users;
  try {
    const entry = await f.journal.create(alice, {
        ...content,
        timelineId: alice,
        kind: 'plan',
        plan: {
          status: 'planned',
          checklist: [{ id: randomUUID(), text: 'Chuẩn bị hoa', done: false, assigneeId: alice }],
        },
      }),
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
        assert.equal(
          (await db.get<{ plan: { checklist: { text: string }[] } }>('journal', entry.id))?.plan
            .checklist[0].text,
          'Chuẩn bị hoa',
        );
        assert.ok(await db.get('timeline-space', alice));
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
