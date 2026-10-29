import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { LocalMediaStore, ObjectNotFoundError } from '../apps/api/src/storage.js';
import { AccountSecurity, authHash, passwordHash, type Account } from '../apps/api/src/auth.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { createBackup } from '../apps/api/src/backup.js';
import { type Album, createAlbumContent } from '../packages/domain/index.js';
import { makeJob } from './job-fixture.js';

async function fixture() {
  const root = path.resolve('test-results/deletion', crypto.randomUUID()),
    db = new Repository({ dataDir: root, databaseUrl: process.env.TEST_DATABASE_URL || '' });
  await db.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  await new AlbumHistory(db).init();
  const store = new LocalMediaStore(root);
  await store.ready();
  const deletion = new AccountDeletion(db, jobs, store, root);
  const security = new AccountSecurity(
    db,
    { kind: 'test', async send() {}, close() {} },
    'http://127.0.0.1:5173',
    deletion,
  );
  await security.init();
  await deletion.init();
  const owner = crypto.randomUUID(),
    other = crypto.randomUUID(),
    salt = crypto.randomUUID();
  const account: Account = {
    id: owner,
    email: owner + '@example.test',
    salt,
    password: (await passwordHash('correct-password', salt)).toString('hex'),
  };
  await db.put('account', authHash(account.email), owner, account);
  const image = crypto.randomUUID(),
    audio = crypto.randomUUID(),
    otherImage = crypto.randomUUID();
  const album: Album = {
    ...createAlbumContent(),
    id: crypto.randomUUID(),
    revision: 0,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assets: [{ id: image, name: 'private', width: 10, height: 10, bytes: 5, url: '/api/private' }],
  };
  album.pages[0].elements.find((e) => e.type === 'image')!.assetId = image;
  await db.put('album', album.id, owner, album);
  await db.compareAndSwap('album', album.id, owner, 0, { ...album, revision: 1 });
  await db.put('audio', audio, owner, { id: audio, albumId: album.id });
  await db.put('session', 'session', owner, { userId: owner, expires: Date.now() + 60000 });
  await db.put('share', 'share', owner, { albumId: album.id });
  await db.put('layout-template', 'template', owner, { name: 'Mẫu riêng' });
  await db.put('album', crypto.randomUUID(), other, {
    ...album,
    id: crypto.randomUUID(),
    assets: [{ id: otherImage }],
  });
  await store.put('uploads/' + image + '.webp', Buffer.from('image'), 'image/webp');
  await store.put('audio/' + audio + '.mp3', Buffer.from('audio'), 'audio/mpeg');
  await store.put('uploads/' + otherImage + '.webp', Buffer.from('other'), 'image/webp');
  await mkdir(path.join(root, 'mail'), { recursive: true });
  await writeFile(
    path.join(root, 'mail', crypto.randomUUID() + '.json'),
    JSON.stringify({ to: account.email, text: 'private link' }),
  );
  await writeFile(
    path.join(root, 'mail', crypto.randomUUID() + '.json'),
    JSON.stringify({ to: 'other@example.test', text: 'other link' }),
  );
  return {
    root,
    db,
    jobs,
    store,
    deletion,
    security,
    account,
    owner,
    other,
    album,
    image,
    audio,
    otherImage,
  };
}
test('deletion revokes sessions/shares immediately and erases only the confirmed owner, including private files and mail', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.deletion.request(f.owner, 'wrong-password', f.security));
    assert.ok(await f.db.get('session', 'session'));
    const receipt = await f.deletion.request(f.owner, 'correct-password', f.security);
    assert.equal(await f.db.get('session', 'session'), undefined);
    assert.equal(await f.db.get('share', 'share'), undefined);
    assert.equal(
      await f.security.validSession({ userId: f.owner, expires: Date.now() + 60000 }),
      false,
    );
    await assert.rejects(
      f.db.put('session', 'new-session', f.owner, { userId: f.owner }),
      /account_deleting/,
    );
    await assert.rejects(f.deletion.begin(f.owner, 'uploads/new.webp'));
    await f.deletion.tick();
    assert.equal((await f.deletion.status(receipt)).status, 'completed');
    assert.equal((await f.db.query('SELECT id FROM records WHERE owner=?', [f.owner])).length, 0);
    assert.equal(
      (await f.db.query('SELECT album_id FROM album_versions WHERE owner=?', [f.owner])).length,
      0,
    );
    await assert.rejects(f.store.get('uploads/' + f.image + '.webp'), ObjectNotFoundError);
    await assert.rejects(f.store.get('audio/' + f.audio + '.mp3'), ObjectNotFoundError);
    assert.equal((await f.store.read('uploads/' + f.otherImage + '.webp')).toString(), 'other');
    assert.equal((await f.db.list('album', f.other)).length, 1);
    assert.equal((await readdir(path.join(f.root, 'mail'))).length, 1);
    await assert.rejects(f.deletion.status('not-the-receipt'));
  } finally {
    await f.db.close();
  }
});
test('cleanup retries after storage failure and resumes through a new repository/process instance', async () => {
  const f = await fixture();
  try {
    const remove = f.store.remove.bind(f.store);
    let failed = false;
    f.store.remove = async (key) => {
      if (!failed) {
        failed = true;
        throw new Error('Storage offline');
      }
      await remove(key);
    };
    const receipt = await f.deletion.request(f.owner, 'correct-password', f.security);
    await f.deletion.tick();
    assert.equal((await f.deletion.status(receipt)).status, 'retrying');
    await assert.rejects(createBackup(f.db, f.store, path.join(f.root, 'backup')), /cleanup|xóa/i);
    assert.ok(await f.db.get('album', f.album.id));
    await f.db.query('UPDATE account_deletions SET available_at=0 WHERE owner=?', [f.owner]);
    const replacement = new Repository({
      dataDir: f.root,
      databaseUrl: process.env.TEST_DATABASE_URL || '',
    });
    await replacement.init();
    const next = new AccountDeletion(
      replacement,
      new JobRepository(replacement),
      new LocalMediaStore(f.root),
      f.root,
    );
    await next.init();
    try {
      await next.tick();
      assert.equal((await next.status(receipt)).status, 'completed');
    } finally {
      await replacement.close();
    }
  } finally {
    await f.db.close();
  }
});

test('expired operations from a crashed process drain, while a changed storage target cannot complete cleanup', async () => {
  const f = await fixture();
  try {
    const key = 'uploads/' + crypto.randomUUID() + '.webp';
    await f.deletion.begin(f.owner, key);
    await f.store.put(key, Buffer.from('interrupted upload'), 'image/webp');
    const receipt = await f.deletion.request(f.owner, 'correct-password', f.security);
    await f.db.query('UPDATE owner_operations SET expires_at=0 WHERE owner=?', [f.owner]);
    const changed = new AccountDeletion(f.db, f.jobs, f.store, path.join(f.root, 'changed-target'));
    await changed.tick();
    assert.equal((await f.deletion.status(receipt)).status, 'retrying');
    assert.ok(await f.db.get('album', f.album.id));
    assert.equal((await f.store.read(key)).toString(), 'interrupted upload');
    await f.db.query('UPDATE account_deletions SET available_at=0 WHERE owner=?', [f.owner]);
    await f.deletion.tick();
    assert.equal((await f.deletion.status(receipt)).status, 'completed');
    await assert.rejects(f.store.get(key), ObjectNotFoundError);
  } finally {
    await f.db.close();
  }
});
test('in-flight uploads and render leases drain before media cleanup; late resource writes are fenced', async () => {
  const f = await fixture();
  try {
    const key = 'uploads/' + crypto.randomUUID() + '.webp',
      operation = await f.deletion.begin(f.owner, key);
    const job = { ...makeJob(), albumId: f.album.id, snapshot: f.album };
    await f.jobs.create(job, f.owner);
    const lease = await f.jobs.claim(30000);
    assert.ok(lease);
    const receipt = await f.deletion.request(f.owner, 'correct-password', f.security);
    await f.deletion.tick();
    assert.equal((await f.deletion.status(receipt)).status, 'waiting');
    assert.equal(await f.jobs.complete(lease, 'exports/late.mp4'), false);
    assert.equal((await f.jobs.heartbeat(lease, 30000)).canceled, true);
    await f.store.put(key, Buffer.from('late upload'), 'image/webp');
    await assert.rejects(
      f.db.compareAndSwap('album', f.album.id, f.owner, 1, { ...f.album, revision: 2 }),
      /account_deleting/,
    );
    await f.deletion.end(operation);
    await f.jobs.fail(lease, 'User canceled', false);
    await f.db.query('UPDATE account_deletions SET available_at=0 WHERE owner=?', [f.owner]);
    await f.deletion.tick();
    assert.equal((await f.deletion.status(receipt)).status, 'completed');
    await assert.rejects(f.store.get(key), ObjectNotFoundError);
    assert.equal(await f.jobs.get(job.id, f.owner), undefined);
  } finally {
    await f.db.close();
  }
});
