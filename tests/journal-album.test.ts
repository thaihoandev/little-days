import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { LocalMediaStore, type MediaStore } from '../apps/api/src/storage.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { JournalService } from '../apps/api/src/journal.js';
import { JournalAlbumService } from '../apps/api/src/journal-album.js';
import { buildJournalPages } from '../packages/domain/journal-album.js';
import { pageSchema, type Album } from '../packages/domain/index.js';

async function fixture() {
  const root = path.resolve('test-results/journal-import', randomUUID()),
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
    owner = randomUUID();
  let entry = await journal.create(owner, {
    title: 'Một ngày riêng tư',
    date: '2026-10-20',
    note: 'Giữ nguyên lời nhắn. '.repeat(200),
    kind: 'memory',
    annual: false,
  });
  const buffer = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#a5b691' },
  })
    .png()
    .toBuffer();
  entry = await journal.upload(owner, entry.id, {
    buffer,
    size: buffer.length,
    originalname: 'memory.png',
  } as Express.Multer.File);
  const body = {
    requestId: randomUUID(),
    title: 'Từ timeline của mình',
    names: ['An', 'Bình'],
    timezone: 'Asia/Ho_Chi_Minh',
    templateId: 'postcard',
    sources: [{ kind: 'journal', id: entry.id, expectedRevision: entry.revision }],
  };
  return {
    db,
    store,
    resources,
    deletion,
    journal,
    owner,
    entry,
    body,
    service: new JournalAlbumService(db, store, resources, deletion),
  };
}
test('journal layout pagination preserves note characters, photo IDs, dates and long headings', () => {
  const note = 'Lời nhắn dài không bị mất chữ.\n'.repeat(100);
  const entry = {
    id: randomUUID(),
    title: 'W'.repeat(160),
    date: '2026-10-20',
    note,
    assets: Array.from({ length: 6 }, (_, i) => ({
      id: 'photo-' + i,
      name: 'ảnh',
      url: '/private',
      width: 320,
      height: 240,
      bytes: 100,
    })),
  };
  const pages = buildJournalPages([entry], 'postcard');
  assert.ok(pages.length > 6 && pages.length <= 20);
  assert.ok(pages.every((p) => pageSchema.safeParse(p).success));
  const written = pages
    .flatMap((p) =>
      p.elements
        .filter(
          (e) =>
            e.type === 'text' && e.text !== entry.title && e.font === 'sans' && e.fontSize !== 15,
        )
        .map((e) => e.text),
    )
    .join('');
  assert.equal(written.replace(/\s/g, ''), note.replace(/\s/g, ''));
  assert.deepEqual(
    new Set(
      pages.flatMap((p) =>
        p.elements.filter((e) => e.type === 'image' && e.visible !== false).map((e) => e.assetId),
      ),
    ),
    new Set(entry.assets.map((a) => a.id)),
  );
  assert.throws(
    () => buildJournalPages([{ ...entry, note: '\n'.repeat(5000) }], 'postcard'),
    /20 trang/,
  );
});
test('journal import copies independent media, keeps full notes and replays idempotently after source deletion', async () => {
  const f = await fixture();
  try {
    const album = await f.service.create(f.owner, f.body);
    assert.equal(album.names.join('/'), 'An/Bình');
    assert.equal(album.startDate, f.entry.date);
    assert.equal(album.memories.map((m) => m.body).join(''), f.entry.note);
    assert.notEqual(album.assets[0].id, f.entry.assets[0].id);
    assert.equal(
      (await sharp(await f.store.read('uploads/' + album.assets[0].id + '.webp')).metadata())
        .format,
      'webp',
    );
    const usage = await f.resources.usage(f.owner);
    assert.equal((await f.service.create(f.owner, f.body)).id, album.id);
    assert.equal((await f.resources.usage(f.owner)).storageBytes, usage.storageBytes);
    await f.journal.remove(f.owner, f.entry.id, { expectedRevision: f.entry.revision });
    const trashed = (await f.journal.trash(f.owner)).find((e) => e.id === f.entry.id)!;
    await f.journal.purge(f.owner, f.entry.id, { expectedRevision: trashed.revision });
    await assert.rejects(f.store.read('journal/' + f.entry.assets[0].id + '.jpg'));
    assert.ok((await f.store.read('uploads/' + album.assets[0].id + '.webp')).length > 0);
    assert.equal((await f.service.create(f.owner, f.body)).id, album.id);
    await assert.rejects(
      f.service.create(f.owner, { ...f.body, title: 'Changed request' }),
      (e: any) => e.getStatus() === 409,
    );
  } finally {
    await f.db.close();
  }
});
test('journal import refuses other owners and stale selections without consuming media quota', async () => {
  const f = await fixture();
  try {
    const before = (await f.resources.usage(f.owner)).storageBytes;
    await assert.rejects(f.service.create(randomUUID(), f.body), (e: any) => e.getStatus() === 404);
    await assert.rejects(
      f.service.create(f.owner, {
        ...f.body,
        sources: [{ ...f.body.sources[0], expectedRevision: 0 }],
      }),
      (e: any) => e.getStatus() === 409,
    );
    assert.equal((await f.resources.usage(f.owner)).storageBytes, before);
    assert.equal((await f.db.list('album', f.owner)).length, 0);
    assert.equal((await f.db.list('journal-album-request', f.owner)).length, 0);
  } finally {
    await f.db.close();
  }
});
test('failed import storage writes clean every reserved copy and allow a retry', async () => {
  const f = await fixture();
  try {
    const before = (await f.resources.usage(f.owner)).storageBytes;
    const failed: MediaStore = {
      ...f.store,
      kind: 'local',
      ready: () => f.store.ready(),
      close: () => {},
      get: (...a) => f.store.get(...a),
      read: (...a) => f.store.read(...a),
      remove: (...a) => f.store.remove(...a),
      putFile: (...a) => f.store.putFile(...a),
      put: async (key, bytes, type) => {
        await f.store.put(key, bytes, type);
        throw new Error('fixture write failure');
      },
    };
    await assert.rejects(
      new JournalAlbumService(f.db, failed, f.resources, f.deletion).create(f.owner, f.body),
      /fixture write/,
    );
    assert.equal((await f.resources.usage(f.owner)).storageBytes, before);
    assert.equal((await f.db.list('album', f.owner)).length, 0);
    assert.equal((await f.db.list('journal-album-request', f.owner)).length, 0);
    assert.ok((await f.service.create(f.owner, f.body)).id);
  } finally {
    await f.db.close();
  }
});
test('a changed source during copying rolls back the new album and media', async () => {
  const f = await fixture();
  try {
    const before = (await f.resources.usage(f.owner)).storageBytes;
    const changing: MediaStore = {
      kind: 'local',
      ready: () => f.store.ready(),
      close: () => {},
      get: (...a) => f.store.get(...a),
      read: (...a) => f.store.read(...a),
      remove: (...a) => f.store.remove(...a),
      putFile: (...a) => f.store.putFile(...a),
      put: async (key, bytes, type) => {
        await f.store.put(key, bytes, type);
        await f.journal.save(f.owner, f.entry.id, {
          expectedRevision: f.entry.revision,
          content: {
            title: f.entry.title,
            date: f.entry.date,
            note: 'Newer content',
            kind: f.entry.kind,
            annual: false,
          },
        });
      },
    };
    await assert.rejects(
      new JournalAlbumService(f.db, changing, f.resources, f.deletion).create(f.owner, f.body),
      (e: any) => e.getStatus() === 409,
    );
    assert.equal((await f.db.list('album', f.owner)).length, 0);
    assert.equal((await f.resources.usage(f.owner)).storageBytes, before);
  } finally {
    await f.db.close();
  }
});
test('simultaneous identical requests create only one album and copied image', async () => {
  const f = await fixture();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let copied!: () => void;
  const entered = new Promise<void>((resolve) => {
    copied = resolve;
  });
  const paused: MediaStore = {
    kind: 'local',
    ready: () => f.store.ready(),
    close: () => {},
    get: (...a) => f.store.get(...a),
    read: (...a) => f.store.read(...a),
    remove: (...a) => f.store.remove(...a),
    putFile: (...a) => f.store.putFile(...a),
    put: async (...args) => {
      copied();
      await waiting;
      await f.store.put(...args);
    },
  };
  const first = new JournalAlbumService(f.db, paused, f.resources, f.deletion).create(
    f.owner,
    f.body,
  );
  try {
    await entered;
    await assert.rejects(f.service.create(f.owner, f.body), (e: any) => e.getStatus() === 409);
    release();
    const album = await first;
    assert.equal((await f.service.create(f.owner, f.body)).id, album.id);
    assert.equal((await f.db.list<Album>('album', f.owner)).length, 1);
  } finally {
    release();
    await first.catch(() => {});
    await f.db.close();
  }
});

test('album start and memory sources share one independent copy of their common photo', async () => {
  const f = await fixture();
  try {
    const source = await f.service.create(f.owner, f.body);
    const album = await f.service.create(f.owner, {
      ...f.body,
      requestId: randomUUID(),
      sources: [
        { kind: 'album-start', id: source.id, expectedRevision: source.revision },
        {
          kind: 'album-memory',
          id: source.id,
          memoryId: source.memories[0].id,
          expectedRevision: source.revision,
        },
      ],
    });
    assert.equal(album.assets.length, 1);
    assert.notEqual(album.assets[0].id, source.assets[0].id);
    assert.equal(album.memories.length, 2);
    assert.ok(album.memories.every((m) => m.assetId === album.assets[0].id));
    assert.ok(album.memories.some((m) => m.body === source.memories[0].body));
    await f.store.remove('uploads/' + source.assets[0].id + '.webp');
    assert.ok((await f.store.read('uploads/' + album.assets[0].id + '.webp')).length > 0);
  } finally {
    await f.db.close();
  }
});

test('storage quota rejection leaves the source intact and clears the unfinished request', async () => {
  const f = await fixture();
  try {
    const before = (await f.resources.usage(f.owner)).storageBytes;
    const filler = 'uploads/' + randomUUID() + '.webp';
    await f.resources.reserve(f.owner, filler, f.resources.limits.storageBytes - before);
    await assert.rejects(f.service.create(f.owner, f.body), /dung lượng/i);
    assert.equal((await f.resources.usage(f.owner)).storageBytes, f.resources.limits.storageBytes);
    assert.equal((await f.db.list('album', f.owner)).length, 0);
    assert.equal((await f.db.list('journal-album-request', f.owner)).length, 0);
    assert.ok((await f.store.read('journal/' + f.entry.assets[0].id + '.jpg')).length > 0);
    await f.resources.remove(filler);
    assert.ok((await f.service.create(f.owner, f.body)).id);
  } finally {
    await f.db.close();
  }
});
