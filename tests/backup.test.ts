import { AccountSecurity } from '../apps/api/src/auth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { createBackup, restoreBackup, verifyBackup } from '../apps/api/src/backup.js';
import { createAlbumContent, type Album } from '../packages/domain/index.js';
import { makeJob } from './job-fixture.js';

async function fixture(root: string) {
  const db = new Repository({ dataDir: root, databaseUrl: '' });
  await db.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  const history = new AlbumHistory(db);
  await history.init();
  const store = new LocalMediaStore(root);
  await store.ready();
  return { db, jobs, history, store };
}
test('backup restores records, private media, completed downloads and version history into an empty database', async () => {
  const root = path.resolve('test-results/backup', crypto.randomUUID());
  const source = await fixture(path.join(root, 'source')),
    target = await fixture(path.join(root, 'target'));
  const owner = crypto.randomUUID(),
    imageId = crypto.randomUUID(),
    audioId = crypto.randomUUID();
  const album: Album = {
    ...createAlbumContent(),
    id: crypto.randomUUID(),
    assets: [
      {
        id: imageId,
        name: 'photo',
        width: 100,
        height: 100,
        bytes: 11,
        url: '/api/image/' + imageId,
      },
    ],
    revision: 0,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  album.pages[0].elements.find((e) => e.type === 'image')!.assetId = imageId;
  const backup = path.join(root, 'snapshot');
  try {
    await source.db.put('album', album.id, owner, album);
    await source.db.compareAndSwap('album', album.id, owner, 0, {
      ...album,
      revision: 1,
      title: 'Bản hiện tại',
    });
    await source.db.put('audio', audioId, owner, {
      id: audioId,
      albumId: album.id,
      name: 'music',
      duration: 8,
      bytes: 11,
      url: '/api/audio/' + audioId,
    });
    await source.db.put('account', owner, owner, {
      id: owner,
      email: 'backup@example.test',
      salt: 'test salt',
      password: 'hashed password',
    });
    const job = { ...makeJob(), albumId: album.id, snapshot: album };
    await source.jobs.create(job, owner);
    const lease = await source.jobs.claim(30000);
    assert.ok(lease);
    const videoKey = 'exports/' + job.id + '/' + lease.token + '.mp4';
    assert.ok(await source.jobs.complete(lease, videoKey));
    await source.store.put(
      'uploads/' + imageId + '.webp',
      Buffer.from('image bytes'),
      'image/webp',
    );
    await source.store.put('audio/' + audioId + '.mp3', Buffer.from('audio bytes'), 'audio/mpeg');
    await source.store.put(videoKey, Buffer.from('video bytes'), 'video/mp4');
    const manifest = await createBackup(source.db, source.store, backup);
    assert.equal(manifest.files.length, 4);
    await verifyBackup(backup);
    const auth = new AccountSecurity(
      target.db,
      { kind: 'test', async send() {}, close() {} },
      'http://127.0.0.1:5173',
    );
    await auth.init();
    await target.db.query(
      'INSERT INTO auth_tokens(token_hash,account_key,owner,purpose,expires_at,credential_version) VALUES(?,?,?,?,?,?)',
      ['old-target-token', 'old-key', 'old-owner', 'reset-password', Date.now() + 60000, 0],
    );
    assert.equal((await restoreBackup(target.db, target.store, backup)).executed, false);
    assert.equal((await target.db.list('album')).length, 0);
    await target.store.put(
      'uploads/' + imageId + '.webp',
      Buffer.from('different existing image'),
      'image/webp',
    );
    await assert.rejects(restoreBackup(target.db, target.store, backup, true), /không ghi đè/);
    assert.equal((await target.db.list('album')).length, 0);
    assert.equal(
      (await target.store.read('uploads/' + imageId + '.webp')).toString(),
      'different existing image',
    );
    await target.store.remove('uploads/' + imageId + '.webp');
    await target.db.query(
      "CREATE TRIGGER reject_import BEFORE INSERT ON records WHEN NEW.kind='account' BEGIN SELECT RAISE(ABORT,'import failed'); END",
    );
    await assert.rejects(restoreBackup(target.db, target.store, backup, true), /import failed/);
    assert.equal(
      (await target.db.list('album')).length,
      0,
      'Failed import must roll back earlier album inserts',
    );
    await target.db.query('DROP TRIGGER reject_import');
    assert.equal((await restoreBackup(target.db, target.store, backup, true)).executed, true);
    assert.equal((await target.db.get<Album>('album', album.id))?.title, 'Bản hiện tại');
    assert.equal((await target.db.query('SELECT COUNT(*) AS count FROM auth_tokens'))[0].count, 0);
    assert.deepEqual(await target.history.get(album.id, 0, owner), album);
    assert.equal((await target.jobs.get(job.id, owner))?.outputKey, videoKey);
    assert.equal((await target.store.read(videoKey)).toString(), 'video bytes');
    assert.equal((await target.store.read('audio/' + audioId + '.mp3')).toString(), 'audio bytes');
    assert.deepEqual(await target.db.get('account', owner), await source.db.get('account', owner));
    await assert.rejects(restoreBackup(target.db, target.store, backup, true), /phải trống/);
    const original = await readFile(path.join(backup, 'database.json'));
    await writeFile(path.join(backup, 'database.json'), '{}');
    await assert.rejects(verifyBackup(backup), /Checksum/);
    await writeFile(path.join(backup, 'database.json'), original);
    const content = JSON.parse(await readFile(path.join(backup, 'manifest.json'), 'utf8'));
    content.files[0].path = '../escape';
    await writeFile(path.join(backup, 'manifest.json'), JSON.stringify(content));
    await assert.rejects(verifyBackup(backup));
  } finally {
    source.store.close();
    target.store.close();
    await source.db.close();
    await target.db.close();
  }
});
test('backup refuses live workers and active export jobs', async () => {
  const root = path.resolve('test-results/backup-guards', crypto.randomUUID()),
    f = await fixture(root);
  try {
    await f.db.put('worker', 'test-worker', 'system', { lastSeen: await f.db.now() });
    await assert.rejects(
      createBackup(f.db, f.store, path.join(root, 'live')),
      /Dừng API và worker/,
    );
    await f.db.remove('worker', 'test-worker');
    await f.jobs.create(makeJob(), 'owner');
    await assert.rejects(
      createBackup(f.db, f.store, path.join(root, 'active-job')),
      /tác vụ render/,
    );
  } finally {
    f.store.close();
    await f.db.close();
  }
});
test('backup pruning only removes verified, old automatic archives after explicit execution', async () => {
  const root = path.resolve('test-results/backup-retention', crypto.randomUUID()),
    source = path.join(root, 'source'),
    archive = path.join(root, 'archives'),
    f = await fixture(source);
  try {
    await mkdir(archive, { recursive: true });
    for (const name of ['auto-old', 'auto-recent', 'manual-keep']) {
      const target = path.join(archive, name),
        manifest = await createBackup(f.db, f.store, target);
      if (name !== 'auto-recent')
        await writeFile(
          path.join(target, 'manifest.json'),
          JSON.stringify({ ...manifest, createdAt: '2020-01-01T00:00:00.000Z' }),
        );
    }
    await mkdir(path.join(archive, 'auto-corrupt'));
    await writeFile(path.join(archive, 'auto-corrupt', 'keep'), 'private');
    const run = promisify(execFile),
      args = ['--import', 'tsx', 'scripts/backup-retention.ts', '--root', archive, '--days', '14'];
    const dry = await run(process.execPath, args, {
      env: { ...process.env, DATA_DIR: source },
      windowsHide: true,
    });
    assert.equal(JSON.parse(dry.stdout).removed, 0);
    await access(path.join(archive, 'auto-old'));
    const executed = await run(process.execPath, [...args, '--execute'], {
      env: { ...process.env, DATA_DIR: source },
      windowsHide: true,
    });
    assert.equal(JSON.parse(executed.stdout).removed, 1);
    await assert.rejects(access(path.join(archive, 'auto-old')));
    await access(path.join(archive, 'auto-recent'));
    await access(path.join(archive, 'manual-keep'));
    assert.equal(await readFile(path.join(archive, 'auto-corrupt', 'keep'), 'utf8'), 'private');
  } finally {
    await f.db.close();
    f.store.close();
  }
});
