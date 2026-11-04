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
import { JournalAlbumService } from '../apps/api/src/journal-album.js';
import { WeeklyRecaps } from '../apps/api/src/weekly-recap.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { authHash } from '../apps/api/src/auth.js';
import { privateSpaceId } from '../apps/api/src/journal-privacy.js';
import { todayIn, pageSchema, element, albumContentSchema } from '../packages/domain/index.js';
import {
  buildWeeklyPage,
  weekStartFor,
  shiftDate,
  recapInputSchema,
} from '../packages/domain/weekly-recap.js';
import {
  photoStyleIds,
  photoBox,
  photoFramePath,
  photoFrame,
} from '../packages/domain/photo-frames.js';
import { longInvitation } from '../packages/domain/long-invitation.js';
import { templatePage } from '../packages/domain/templates.js';
import { createAlbumContent } from '../packages/domain/index.js';
import { occursOn, nextOccurrence } from '../packages/domain/journal.js';
import { LibraryService } from '../apps/api/src/library.js';

const status = (code: number) => (e: any) => e.getStatus?.() === code;

test('calendar does not repeat one-off journals or album dates without an explicit annual option', async () => {
  const f = await fixture(),
    owner = f.users[0];
  try {
    const date = '2026-11-02',
      next = '2027-11-02';
    const once = await f.journal.create(owner, {
      title: 'Chỉ một lần',
      date,
      kind: 'memory',
      note: '',
      annual: false,
      timelineId: owner,
    });
    const yearly = await f.journal.create(owner, {
      title: 'Mỗi năm',
      date,
      kind: 'anniversary',
      note: '',
      annual: true,
      timelineId: owner,
    });
    const album = {
      ...createAlbumContent(),
      id: randomUUID(),
      schemaVersion: 1 as const,
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assets: [],
      startDate: date,
      memories: [],
    };
    await f.db.insert('album', album.id, owner, album);
    const library = new LibraryService(f.db, f.journal),
      read = async () => (await library.page(owner, { limit: 60, today: next })).items as any[];
    let items = await read(),
      book = items.find((e) => e.id === 'start-' + album.id)!;
    assert.equal(book.annual, false);
    assert.equal(occursOn(book, next), false);
    assert.equal(nextOccurrence(book, next), null);
    assert.equal(
      occursOn(
        items.find((e) => e.id === once.id)!,
        next,
      ),
      false,
    );
    assert.equal(
      occursOn(
        items.find((e) => e.id === yearly.id)!,
        next,
      ),
      true,
    );
    await f.db.compareAndSwap('album', album.id, owner, 0, {
      ...album,
      revision: 1,
      startDateAnnual: true,
    });
    assert.equal(
      (await library.summaries(owner)).find((a) => a.id === album.id)?.startDateAnnual,
      true,
    );
    items = await read();
    book = items.find((e) => e.id === 'start-' + album.id)!;
    assert.equal(book.annual, true);
    assert.equal(occursOn(book, next), true);
    await f.db.compareAndSwap('album', album.id, owner, 1, {
      ...album,
      revision: 2,
      startDateAnnual: false,
    });
    assert.equal(
      occursOn(
        (await read()).find((e) => e.id === book.id)!,
        next,
      ),
      false,
    );
  } finally {
    await f.db.close();
  }
});
async function fixture() {
  const root = path.resolve('test-results/weekly-recap', randomUUID()),
    db = new Repository({ dataDir: root, databaseUrl: process.env.TEST_DATABASE_URL || '' });
  await db.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  await new AlbumHistory(db).init();
  const store = new LocalMediaStore(root);
  await store.ready();
  const resources = new ResourcePolicy(db, store);
  await resources.init();
  const deletion = new AccountDeletion(db, jobs, store, root);
  await deletion.init();
  const journal = new JournalService(db, store, resources, deletion),
    users = [randomUUID(), randomUUID(), randomUUID()];
  for (const id of users)
    await db.insert('account', authHash(id + '@fixture.test'), id, {
      id,
      email: id + '@fixture.test',
      emailVerifiedAt: new Date().toISOString(),
      revision: 0,
    });
  const grant = await journal.sharing.invite(users[0], { email: users[1] + '@fixture.test' });
  await journal.sharing.change(users[1], grant.id, { action: 'accept', expectedRevision: 0 });
  const date = todayIn('Asia/Ho_Chi_Minh'),
    week = weekStartFor(date),
    image = await sharp({ create: { width: 120, height: 90, channels: 3, background: '#8ea577' } })
      .png()
      .toBuffer();
  const create = async (actor = users[0], timelineId = users[0], day = date) => {
    let entry = await journal.create(actor, {
      title: 'Ảnh ngày nhỏ',
      note: 'Không tự đưa ghi chú vào recap',
      date: day,
      kind: 'memory',
      annual: false,
      timelineId,
    });
    entry = await journal.upload(actor, entry.id, {
      buffer: image,
      size: image.length,
      originalname: 'fixture.png',
    } as Express.Multer.File);
    return entry;
  };
  const service = new WeeklyRecaps(
    db,
    journal,
    new JournalAlbumService(db, store, resources, deletion, journal),
  );
  const body = (entry: Awaited<ReturnType<typeof create>>) => ({
    requestId: randomUUID(),
    spaceId: users[0],
    weekStart: week,
    title: 'Tuần của hai người',
    message: 'Một tuần đẹp',
    layout: 'film',
    background: '#e3eada',
    photos: [{ entryId: entry.id, assetId: entry.assets[0].id, expectedRevision: entry.revision }],
  });
  return { db, store, resources, journal, users, grant, date, week, create, service, body };
}

test('weekly collage layouts retain 1–9 editable images and valid long sections/frame geometry', () => {
  for (let n = 1; n <= 9; n++)
    for (const layout of ['grid', 'film', 'editorial'] as const) {
      const page = buildWeeklyPage(
        Array.from({ length: n }, () => ({ assetId: randomUUID(), date: '2026-11-02' })),
        {
          weekStart: '2026-11-02',
          title: 'Một tuần',
          message: 'Thương '.repeat(35),
          layout,
          background: '#f8f1e5',
        },
      );
      assert.ok(pageSchema.safeParse(page).success);
      assert.equal(page.elements.filter((e) => e.type === 'image').length, n);
      for (const e of page.elements) {
        assert.ok(e.x >= 0 && e.y >= 0 && e.x + e.width <= 720 && e.y + e.height <= 900);
      }
    }
  assert.equal(weekStartFor('2027-01-01'), '2026-12-28');
  assert.equal(shiftDate('2026-12-28', 6), '2027-01-03');
  const pages = longInvitation(templatePage('invite-date'));
  assert.equal(pages.length, 3);
  assert.ok(pages.every((p) => pageSchema.safeParse(p).success));
  assert.equal(
    new Set(pages.flatMap((p) => p.elements.map((e) => e.id))).size,
    pages.flatMap((p) => p.elements).length,
  );
  for (const style of photoStyleIds) {
    const e = element('image', { photoStyle: style, width: 240, height: 310 });
    const box = photoBox(e);
    assert.ok(
      box.width > 0 &&
        box.height > 0 &&
        box.x + box.width <= e.width &&
        box.y + box.height <= e.height,
    );
    assert.match(photoFramePath(e.width, e.height, photoFrame(e).shape), /^M/);
  }
  const duplicate = { entryId: randomUUID(), assetId: randomUUID(), expectedRevision: 0 };
  assert.equal(
    recapInputSchema.safeParse({
      requestId: randomUUID(),
      spaceId: randomUUID(),
      weekStart: '2026-11-02',
      title: 'Tuần',
      message: '',
      layout: 'grid',
      background: '#f8f1e5',
      photos: [duplicate, duplicate],
    }).success,
    false,
  );
});

test('weekly selection respects shared/private scope, dates, authors, revisions, independent copies and revoked access', async () => {
  const f = await fixture(),
    [a, b, c] = f.users;
  try {
    const shared = await f.create(b),
      personal = await f.create(a, privateSpaceId(a)),
      old = await f.create(a, a, shiftDate(f.week, -1));
    const view = await f.service.list(b, { spaceId: a, weekStart: f.week });
    assert.equal(view.items.length, 1);
    assert.equal(view.items[0].asset.id, shared.assets[0].id);
    assert.equal(view.items[0].authorId, b);
    assert.ok(view.items[0].authorName);
    assert.equal(view.days.find((d) => d.date === f.date)?.photos, 1);
    await assert.rejects(f.service.list(c, { spaceId: a, weekStart: f.week }), status(404));
    await assert.rejects(f.service.list(a, { spaceId: privateSpaceId(a) }), status(400));
    await assert.rejects(f.service.create(b, f.body(personal)), status(404));
    await assert.rejects(f.service.create(b, f.body(old)), status(404));
    await assert.rejects(
      f.service.create(b, {
        ...f.body(shared),
        photos: [{ entryId: shared.id, assetId: shared.assets[0].id, expectedRevision: 0 }],
      }),
      status(409),
    );
    const body = f.body(shared),
      album = await f.service.create(b, body);
    assert.ok(albumContentSchema.safeParse(album).success);
    assert.equal(album.weeklyRecap?.spaceId, a);
    assert.equal(album.assets.length, 1);
    assert.equal(
      album.memories.length,
      0,
      'A weekly collage does not duplicate source milestones.',
    );
    assert.equal(album.startDate, f.week);
    assert.notEqual(album.assets[0].id, shared.assets[0].id);
    assert.ok(!album.share);
    assert.ok(!JSON.stringify(album).includes(shared.note));
    const usage = await f.resources.usage(b);
    assert.equal((await f.service.create(b, body)).id, album.id);
    assert.equal((await f.resources.usage(b)).storageBytes, usage.storageBytes);
    await assert.rejects(f.service.create(b, { ...body, title: 'Đổi yêu cầu' }), status(409));
    const grant = (await f.journal.sharing.state(a)).grants.find((g) => g.id === f.grant.id)!;
    await f.journal.sharing.change(a, grant.id, { expectedRevision: grant.revision }, true);
    await assert.rejects(f.service.list(b, { spaceId: a, weekStart: f.week }), status(404));
    await assert.rejects(f.service.create(b, body), status(404));
    assert.ok(
      (await f.store.read('uploads/' + album.assets[0].id + '.webp')).length > 0,
      'Previously saved personal copies remain independent.',
    );
  } finally {
    await f.db.close();
  }
});

test('weekly import revalidates source revision after media copy and cleans only uncommitted objects', async () => {
  const f = await fixture(),
    [a, b] = f.users;
  try {
    const entry = await f.create(),
      body = f.body(entry),
      before = (await f.resources.usage(b)).storageBytes,
      original = f.store.get.bind(f.store);
    let changed = false;
    f.store.get = async (key) => {
      if (key.startsWith('journal/') && !changed) {
        changed = true;
        await f.journal.save(a, entry.id, {
          expectedRevision: entry.revision,
          content: { ...entry, title: 'Đã sửa' },
        });
      }
      return original(key);
    };
    await assert.rejects(f.service.create(b, body), status(409));
    assert.equal((await f.db.list('album', b)).length, 0);
    assert.equal((await f.resources.usage(b)).storageBytes, before);
    assert.ok((await f.store.read('journal/' + entry.assets[0].id + '.jpg')).length > 0);
  } finally {
    await f.db.close();
  }
});

test('weekly keyset pages are stable and cursors are bound to actor/week/membership', async () => {
  const f = await fixture(),
    [a, b] = f.users;
  try {
    const entry = await f.create();
    for (let i = 0; i < 25; i++) {
      const id = randomUUID();
      await f.db.insert('journal', id, a, {
        ...entry,
        id,
        assets: entry.assets.map((asset) => ({ ...asset, id: randomUUID() })),
      });
    }
    const first = await f.service.list(b, { spaceId: a, weekStart: f.week });
    assert.equal(first.items.length, 24);
    assert.ok(first.nextCursor);
    assert.equal(first.days.find((d) => d.date === f.date)?.photos, 26);
    const second = await f.service.list(b, {
      spaceId: a,
      weekStart: f.week,
      cursor: first.nextCursor,
    });
    assert.equal(second.items.length, 2);
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.items, ...second.items].map((i) => i.entryId)).size, 26);
    await assert.rejects(
      f.service.list(a, { spaceId: a, weekStart: f.week, cursor: first.nextCursor }),
      status(400),
    );
    await assert.rejects(
      f.service.list(b, { spaceId: a, weekStart: shiftDate(f.week, -7), cursor: first.nextCursor }),
      status(400),
    );
  } finally {
    await f.db.close();
  }
});

test('revocation during recap copying prevents publication and releases recipient quota', async () => {
  const f = await fixture(),
    [a, b] = f.users;
  try {
    const entry = await f.create(),
      body = f.body(entry),
      before = (await f.resources.usage(b)).storageBytes,
      original = f.store.get.bind(f.store);
    let revoked = false;
    f.store.get = async (key) => {
      if (key.startsWith('journal/') && !revoked) {
        revoked = true;
        await f.journal.sharing.change(a, f.grant.id, { expectedRevision: 1 }, true);
      }
      return original(key);
    };
    await assert.rejects(f.service.create(b, body), status(404));
    assert.equal((await f.db.list('album', b)).length, 0);
    assert.equal((await f.resources.usage(b)).storageBytes, before);
    assert.ok((await f.store.read('journal/' + entry.assets[0].id + '.jpg')).length > 0);
  } finally {
    await f.db.close();
  }
});
