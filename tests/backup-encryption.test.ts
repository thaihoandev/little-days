import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createCipheriv } from 'node:crypto';
import path from 'node:path';
import { access, readFile, writeFile, readdir } from 'node:fs/promises';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { BackupLock } from '../apps/api/src/backup-lock.js';
import { createBackup, restoreBackup } from '../apps/api/src/backup.js';
import { encryptionKey, sealBackup, unsealBackup } from '../apps/api/src/backup-encryption.js';

test('encrypted backups stream multi-megabyte private media, authenticate before exposing files and restore intact', async () => {
  const root = path.resolve('test-results/backup-encryption', randomUUID());
  const db = new Repository({ dataDir: path.join(root, 'source'), databaseUrl: '' });
  await db.init();
  await new JobRepository(db).init();
  await new AlbumHistory(db).init();
  const store = new LocalMediaStore(path.join(root, 'source'));
  await store.ready();
  const target = new Repository({ dataDir: path.join(root, 'target'), databaseUrl: '' });
  await target.init();
  const targetStore = new LocalMediaStore(path.join(root, 'target'));
  await targetStore.ready();
  try {
    const bytes = Buffer.alloc(9 * 1048576, 0xac),
      audioId = randomUUID(),
      owner = randomUUID();
    await db.put('audio', audioId, owner, {
      id: audioId,
      albumId: randomUUID(),
      bytes: bytes.length,
    });
    await db.put('account', 'private-account', owner, {
      email: 'private@example.test',
      password: 'fake-hash',
    });
    await store.put('audio/' + audioId + '.mp3', bytes, 'audio/mpeg');
    const snapshot = path.join(root, 'snapshot'),
      archive = path.join(root, 'archive.enc'),
      key = randomBytes(32);
    await createBackup(db, store, snapshot);
    await sealBackup(snapshot, archive, key);
    assert.ok(!(await readFile(archive)).includes(Buffer.from('private@example.test')));
    await assert.rejects(unsealBackup(archive, path.join(root, 'wrong'), randomBytes(32)));
    await assert.rejects(access(path.join(root, 'wrong')));
    await assert.rejects(unsealBackup(archive, path.join(root, 'too-large'), key, 1024));
    const output = path.join(root, 'opened');
    await unsealBackup(archive, output, key);
    await restoreBackup(target, targetStore, output, true);
    assert.deepEqual(await targetStore.read('audio/' + audioId + '.mp3'), bytes);
    assert.deepEqual(await target.get('account', 'private-account'), {
      email: 'private@example.test',
      password: 'fake-hash',
    });
    await assert.rejects(sealBackup(snapshot, archive, key));
    await assert.rejects(unsealBackup(archive, output, key));
    const damaged = await readFile(archive);
    damaged[80] ^= 1;
    await writeFile(path.join(root, 'damaged.enc'), damaged);
    await assert.rejects(
      unsealBackup(path.join(root, 'damaged.enc'), path.join(root, 'damaged'), key),
    );
    assert.ok(!(await readdir(root)).some((f) => f.startsWith('.backup-decrypt-')));
  } finally {
    await target.close();
    await db.close();
  }
});

test('authenticated archive indexes still reject traversal and duplicate paths', async () => {
  const root = path.resolve('test-results/backup-encryption', randomUUID());
  const { mkdir } = await import('node:fs/promises');
  await mkdir(root, { recursive: true });
  for (const paths of [
    ['../outside', 'manifest.json'],
    ['database.json', 'database.json', 'manifest.json'],
  ]) {
    const key = randomBytes(32),
      header = Buffer.concat([Buffer.from('LDBK2\0'), randomBytes(12)]),
      cipher = createCipheriv('aes-256-gcm', key, header.subarray(6));
    cipher.setAAD(header);
    const index = Buffer.from(JSON.stringify(paths.map((p) => ({ path: p, bytes: 0 })))),
      size = Buffer.alloc(4);
    size.writeUInt32BE(index.length);
    const archive = Buffer.concat([
      header,
      cipher.update(Buffer.concat([size, index])),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    const file = path.join(root, randomUUID() + '.enc'),
      out = path.join(root, randomUUID());
    await writeFile(file, archive);
    await assert.rejects(unsealBackup(file, out, key));
    await assert.rejects(access(out));
  }
  assert.throws(() => encryptionKey('smtp-secret'));
  assert.equal(encryptionKey('a'.repeat(64)).length, 32);
});

test('backup leases expire automatically and stale owners cannot renew or release a successor', async () => {
  const root = path.resolve('test-results/backup-lease', randomUUID()),
    db = new Repository({ dataDir: root, databaseUrl: '' });
  await db.init();
  try {
    const lock = new BackupLock(db);
    await lock.init();
    const first = await lock.acquire();
    assert.equal(await lock.paused(), true);
    await assert.rejects(lock.acquire());
    await db.query('UPDATE backup_lease SET lease_until=0');
    assert.equal(await lock.paused(), false);
    const second = await lock.acquire();
    assert.equal(await lock.renew(first), false);
    await lock.release(first);
    assert.equal(await lock.paused(), true);
    await lock.release(second);
    assert.equal(await lock.paused(), false);
  } finally {
    await db.close();
  }
});
