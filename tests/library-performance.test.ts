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
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { JournalService } from '../apps/api/src/journal.js';
import { LibraryService } from '../apps/api/src/library.js';
import { UploadReceipts } from '../apps/api/src/upload-receipts.js';
import { ImagePreviews } from '../apps/api/src/image-previews.js';
import { createAlbumContent, type Album } from '../packages/domain/index.js';
import { authHash, AccountSecurity } from '../apps/api/src/auth.js';

const status = (n: number) => (e: any) => e.getStatus?.() === n || e.status === n;
async function fixture() {
  const root = path.resolve('test-results/library', randomUUID());
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
    library = new LibraryService(db, journal),
    users = [randomUUID(), randomUUID(), randomUUID()];
  const security = new AccountSecurity(
    db,
    {
      kind: 'test',
      async send() {
        throw new Error('No email');
      },
    },
    'http://127.0.0.1',
  );
  await security.init();
  for (const id of users)
    await db.insert('account', authHash(id + '@fixture.test'), id, {
      id,
      email: id + '@fixture.test',
      emailVerifiedAt: new Date().toISOString(),
    });
  return {
    root,
    db,
    store,
    deletion,
    resources,
    journal,
    library,
    users,
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
const content = {
  title: 'Ngày thương',
  date: '2026-11-02',
  note: 'Một lời nhắn',
  annual: false,
  kind: 'memory' as const,
};
test('SQL library pages combine books/memories/journal, exact totals, private cursor scope, Unicode/literal search and lightweight summaries', async () => {
  const f = await fixture(),
    [owner, member, stranger] = f.users;
  try {
    const now = new Date().toISOString(),
      a: Album = {
        ...createAlbumContent(),
        id: randomUUID(),
        revision: 0,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        assets: [],
      };
    a.pages = Array.from({ length: 20 }, () => ({ ...a.pages[0], id: randomUUID() }));
    a.memories = [
      {
        id: randomUUID(),
        date: '2026-11-02',
        title: 'Kỉ niệm trong sổ',
        body: 'Đẹp 100%_!',
        assetId: null,
      },
    ];
    const imageId = randomUUID();
    a.assets = [
      {
        id: imageId,
        name: 'fixture.webp',
        width: 100,
        height: 100,
        bytes: 100,
        url: '/api/albums/' + a.id + '/assets/' + imageId,
      },
    ];
    await f.db.insert('album', a.id, owner, a);
    assert.equal(await f.library.ownsAlbumAsset(owner, a.id, imageId), true);
    assert.equal(await f.library.ownsAlbumAsset(stranger, a.id, imageId), false);
    assert.equal(await f.library.ownsAlbumAsset(owner, a.id, randomUUID()), false);
    assert.equal((await f.db.owned<Album>('album', a.id, owner))?.id, a.id);
    assert.equal(await f.db.owned<Album>('album', a.id, stranger), undefined);
    const ids = [];
    for (let i = 0; i < 45; i++)
      ids.push(
        (
          await f.journal.create(owner, {
            ...content,
            title: i === 44 ? 'THƯƠNG 100%_!' : 'Ngày ' + i,
          })
        ).id,
      );
    await f.journal.create(stranger, { ...content, title: 'Private stranger' });
    const latest = await f.db.get<JournalEntry>('journal', ids.at(-1)!);
    await f.db.put('journal', latest!.id, owner, {
      ...latest,
      createdAt: '2099-01-01T00:00:00.000Z',
    });
    const trashed = await f.journal.create(owner, { ...content, title: 'Hidden trash' });
    await f.journal.remove(owner, trashed.id, { expectedRevision: trashed.revision });
    const full = await f.library.page(owner, { limit: 7 });
    assert.equal(full.total, 47);
    assert.equal(full.items.length, 7);
    assert.equal(full.stats?.milestones, 45);
    assert.ok('id' in full.items[0]);
    assert.equal(full.items[0].id, ids.at(-1));
    const seen = new Set<string>();
    let page = full;
    for (;;) {
      for (const item of page.items) {
        assert.ok('id' in item);
        assert.ok(!seen.has(item.id));
        seen.add(item.id);
      }
      if (!page.nextCursor) break;
      page = await f.library.page(owner, { limit: 7, cursor: page.nextCursor });
    }
    assert.equal(seen.size, 47);
    assert.ok(seen.has('start-' + a.id));
    assert.ok(seen.has(a.id + ':' + a.memories[0].id));
    assert.equal((await f.library.page(owner, { q: 'thương 100%_!' })).total, 1);
    assert.equal((await f.library.page(owner, { q: '100%_!' })).total, 2);
    await assert.rejects(
      f.library.page(owner, { q: 'different', cursor: full.nextCursor! }),
      status(400),
    );
    await assert.rejects(f.library.page(stranger, { cursor: full.nextCursor! }), status(400));
    await assert.rejects(f.library.page(owner, { limit: 1000 }));
    const summaries = await f.library.summaries(owner);
    assert.equal(summaries[0].pages.length, 1);
    assert.equal(summaries[0].pageCount, 20);
    assert.equal(summaries[0].schemaVersion, 1);
    assert.ok(
      Buffer.byteLength(JSON.stringify(summaries)) < Buffer.byteLength(JSON.stringify([a])) * 0.2,
    );
    const grant = await f.journal.sharing.invite(owner, { email: member + '@fixture.test' });
    await f.journal.sharing.change(member, grant.id, { expectedRevision: 0, action: 'accept' });
    const shared = await f.library.page(member, { timeline: owner });
    assert.equal(shared.total, 47 - 2);
    assert.ok(shared.items.every((i) => 'timelineId' in i && i.timelineId === owner));
    const secondGrant = await f.journal.sharing.invite(stranger, {
      email: member + '@fixture.test',
    });
    await f.journal.sharing.change(member, secondGrant.id, {
      expectedRevision: 0,
      action: 'accept',
    });
    const originalQuery = f.db.query;
    let reverse = false;
    f.db.query = async function (sql, values) {
      const rows = await originalQuery.call(this, sql, values);
      return sql.includes('SELECT g.payload AS grant') && reverse ? rows.reverse() : rows;
    };
    try {
      const first = await f.library.page(member, { limit: 7 });
      reverse = true;
      const second = await f.library.page(member, { limit: 7, cursor: first.nextCursor! });
      assert.equal(second.total, 46);
      assert.equal(second.items.length, 7);
      const keys = new Set(first.items.map((item) => ('id' in item ? item.id : '')));
      assert.ok(second.items.every((item) => 'id' in item && !keys.has(item.id)));
    } finally {
      f.db.query = originalQuery;
    }
    await f.journal.sharing.change(stranger, secondGrant.id, { expectedRevision: 1 }, true);
    await f.journal.sharing.change(owner, grant.id, { expectedRevision: 1 }, true);
    await assert.rejects(f.library.page(member, { timeline: owner }), status(404));
    assert.equal((await f.library.page(member, {})).total, 0);
  } finally {
    await f.close();
  }
});

test('upload receipts replay after restart, reject changed bytes, serialize pending requests and fence expired attempts', async () => {
  const f = await fixture(),
    owner = f.users[0],
    receipt = new UploadReceipts(f.db, f.deletion);
  try {
    const values = new Map<string, string>(),
      target = randomUUID(),
      id = randomUUID(),
      bytes = Buffer.from('image');
    let calls = 0;
    const read = async (asset: string) => values.get(asset);
    const upload = (key: string, buffer = bytes) =>
      receipt.run(owner, target, key, buffer, read, async (commit) => {
        calls++;
        return commit('asset', async () => {
          values.set('asset', 'saved');
          return 'saved';
        });
      });
    assert.equal(await upload(id), 'saved');
    assert.equal(
      await new UploadReceipts(f.db, f.deletion).run(owner, target, id, bytes, read, async () => {
        throw new Error('Must replay');
      }),
      'saved',
    );
    assert.equal(calls, 1);
    await assert.rejects(upload(id, Buffer.from('changed')), status(409));
    values.clear();
    await assert.rejects(upload(id), status(410));
    const pendingId = randomUUID();
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => (entered = resolve)),
      waiting = new Promise<void>((resolve) => (release = resolve));
    const first = receipt.run(owner, 'pending', pendingId, bytes, read, async (commit) => {
      entered();
      await waiting;
      return commit('one', async () => 'one');
    });
    await started;
    await assert.rejects(
      receipt.run(owner, 'pending', pendingId, bytes, read, async () => 'duplicate'),
      status(409),
    );
    release();
    assert.equal(await first, 'one');
    const expiredId = randomUUID();
    let fail!: () => void;
    const old = receipt.run(owner, 'expiry', expiredId, bytes, read, async (commit) => {
      await new Promise<void>((resolve) => (fail = resolve));
      return commit('stale', async () => {
        throw new Error('Stale mutation must not run');
      });
    });
    while (!fail) await new Promise((r) => setTimeout(r, 5));
    const rows = await f.db.query(
      "SELECT id,payload FROM records WHERE kind='upload-receipt' AND owner=?",
      [owner],
    );
    for (const row of rows) {
      const r = JSON.parse(String(row.payload));
      if (!r.assetId) await f.db.put('upload-receipt', String(row.id), owner, { ...r, until: 0 });
    }
    assert.equal(
      await receipt.run(owner, 'expiry', expiredId, bytes, read, async (commit) =>
        commit('new', async () => 'new'),
      ),
      'new',
    );
    fail();
    await assert.rejects(old, status(409));
  } finally {
    await f.close();
  }
});

test('journal retry does not duplicate media, quota or versions; photos page and preview retain originals', async () => {
  const f = await fixture(),
    [owner, member] = f.users;
  try {
    const entry = await f.journal.create(owner, {
        ...content,
        location: { label: 'Nơi riêng', latitude: 10, longitude: 106 },
      }),
      buffer = await sharp({
        create: { width: 1600, height: 1200, channels: 3, background: '#789456' },
      })
        .png()
        .toBuffer();
    const file = { buffer, size: buffer.length, originalname: 'photo.png' } as Express.Multer.File,
      id = randomUUID();
    const first = await f.journal.upload(owner, entry.id, file, id),
      usage = await f.resources.usage(owner),
      history = await f.journal.history(owner, entry.id);
    const again = await f.journal.upload(owner, entry.id, file, id);
    assert.equal(again.revision, first.revision);
    assert.equal(again.assets.length, 1);
    assert.deepEqual(await f.resources.usage(owner), usage);
    assert.equal((await f.journal.history(owner, entry.id)).length, history.length);
    await assert.rejects(f.journal.upload(member, entry.id, file, id), status(404));
    const photos = await f.library.page(owner, { limit: 1 }, true);
    assert.equal(photos.total, 1);
    assert.ok('asset' in photos.items[0]);
    const map = await f.library.page(owner, {}, false, true);
    assert.equal(map.total, 1);
    assert.ok('note' in map.items[0]);
    assert.equal(map.items[0].note, '');
    assert.equal((await f.journal.read(owner, entry.id)).note, content.note);
    assert.equal(map.items[0].assets.length, 1);
    const key = 'journal/' + first.assets[0].id + '.jpg',
      cache = new ImagePreviews(f.store),
      original = await f.store.read(key);
    const [small, duplicate] = await Promise.all([cache.get(key), cache.get(key)]);
    assert.deepEqual(small, duplicate);
    const meta = await sharp(small).metadata();
    assert.equal(meta.width, 480);
    assert.equal(meta.height, 360);
    assert.ok(small.length < original.length);
    assert.deepEqual(await f.store.read(key), original);
  } finally {
    await f.close();
  }
});
