import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { AlbumHistory, VERSION_LIMIT } from '../apps/api/src/history.js';
import { createAlbumContent, type Album } from '../packages/domain/index.js';

async function fixture(databaseUrl = process.env.TEST_DATABASE_URL || '') {
  const dataDir = path.resolve('test-results/history', crypto.randomUUID());
  const db = new Repository({ dataDir, databaseUrl });
  await db.init();
  const history = new AlbumHistory(db);
  await history.init();
  const owner = crypto.randomUUID();
  const album: Album = {
    ...createAlbumContent(),
    id: crypto.randomUUID(),
    assets: [],
    revision: 0,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.put('album', album.id, owner, album);
  return {
    db,
    history,
    owner,
    album,
    dataDir,
    async close() {
      await db.remove('album', album.id);
      await db.close();
    },
  };
}
test('history captures prior document only after successful CAS and survives a restore', async () => {
  const f = await fixture();
  try {
    const next = { ...f.album, revision: 1, title: 'Bản mới' };
    assert.ok(await f.db.compareAndSwap('album', f.album.id, f.owner, 0, next));
    assert.deepEqual(await f.history.get(f.album.id, 0, f.owner), f.album);
    assert.equal(
      await f.db.compareAndSwap('album', f.album.id, f.owner, 0, { ...next, title: 'Stale' }),
      false,
    );
    assert.equal((await f.history.list(f.album.id, f.owner)).length, 1);
    assert.equal(await f.history.get(f.album.id, 0, 'another-owner'), undefined);
    assert.equal(await f.history.checkpoint(f.album.id, f.owner, 0, 'Stale checkpoint'), false);
    assert.ok(await f.history.checkpoint(f.album.id, f.owner, 1, 'Trước thay đổi lớn'));
    const restored = { ...f.album, revision: 2 };
    assert.ok(await f.db.compareAndSwap('album', f.album.id, f.owner, 1, restored));
    assert.equal((await f.history.list(f.album.id, f.owner))[0].label, 'Trước thay đổi lớn');
    assert.deepEqual(await f.history.get(f.album.id, 1, f.owner), next);
  } finally {
    await f.close();
  }
});
test('bounded history preserves newest 50 revisions and album deletion removes history', async () => {
  const f = await fixture();
  try {
    for (let revision = 0; revision < 65; revision++)
      assert.ok(
        await f.db.compareAndSwap('album', f.album.id, f.owner, revision, {
          ...f.album,
          revision: revision + 1,
          title: 'Bản ' + (revision + 1),
        }),
      );
    const versions = await f.history.list(f.album.id, f.owner);
    assert.equal(versions.length, VERSION_LIMIT);
    assert.equal(versions[0].revision, 64);
    assert.equal(versions.at(-1)?.revision, 15);
    assert.equal(await f.history.get(f.album.id, 0, f.owner), undefined);
    await f.db.remove('album', f.album.id);
    assert.deepEqual(await f.history.list(f.album.id, f.owner), []);
  } finally {
    await f.close();
  }
});
test('SQLite refuses the album update if recording history fails', async () => {
  const f = await fixture('');
  try {
    await f.db.query(
      "CREATE TRIGGER fail_history BEFORE INSERT ON album_versions BEGIN SELECT RAISE(ABORT,'history unavailable'); END",
    );
    await assert.rejects(
      f.db.compareAndSwap('album', f.album.id, f.owner, 0, {
        ...f.album,
        revision: 1,
        title: 'Must not commit',
      }),
      /history unavailable/,
    );
    assert.deepEqual(await f.db.get('album', f.album.id), f.album);
    assert.deepEqual(await f.history.list(f.album.id, f.owner), []);
  } finally {
    await f.close();
  }
});
