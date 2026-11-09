import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import JSZip from 'jszip';
import pg from 'pg';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { JournalService } from '../apps/api/src/journal.js';
import { ArchiveImporter } from '../apps/api/src/archive-import.js';
import { authHash } from '../apps/api/src/auth.js';
import { privateSpaceId } from '../apps/api/src/journal-privacy.js';
import { createAlbumContent, element, type Album } from '../packages/domain/index.js';
import { featuredTemplates } from '../packages/domain/templates.js';
import { photoBox, film35Holes } from '../packages/domain/photo-frames.js';
import { vietnamDecorations } from '../packages/domain/vietnam-decorations.js';
import { musicCatalog } from '../packages/domain/music.js';
import { inspectArchive, readPersonalArchive } from '../apps/web/src/archive-reader.js';
import { zipFiles } from '../apps/web/src/portable-files.js';
import {
  createPasscode,
  checkPasscode,
  readPasscode,
  assertionSignature,
} from '../apps/web/src/device-passcode.js';
import type { ArchiveImportInput } from '../packages/domain/archive-import.js';
import { createBackup, verifyBackup } from '../apps/api/src/backup.js';
const hash = (value: Buffer | Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');
const status = (expected: number) => (e: any) =>
  e.getStatus?.() === expected || e.status === expected;
async function fixture() {
  const root = path.resolve('test-results/signature-unit', randomUUID());
  let databaseUrl = process.env.TEST_DATABASE_URL || '',
    admin: pg.Client | undefined;
  const schema = 'qa_signature_' + randomUUID().replaceAll('-', '');
  if (databaseUrl) {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query('CREATE SCHEMA ' + schema);
    const isolated = new URL(databaseUrl);
    isolated.searchParams.set('options', '-c search_path=' + schema);
    databaseUrl = isolated.toString();
  }
  const db = new Repository({ dataDir: root, databaseUrl });
  const close = db.close.bind(db);
  db.close = async () => {
    try {
      await close();
    } finally {
      if (admin) {
        await admin.query('DROP SCHEMA ' + schema + ' CASCADE');
        await admin.end();
        admin = undefined;
      }
    }
  };
  try {
    await db.init();
    const jobs = new JobRepository(db);
    await jobs.init();
    await new AlbumHistory(db).init();
    const store = new LocalMediaStore(root);
    await store.ready();
    const resources = new ResourcePolicy(db, store, root);
    await resources.init();
    const deletion = new AccountDeletion(db, jobs, store, root);
    await deletion.init();
    const journal = new JournalService(db, store, resources, deletion);
    const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const id of users)
      await db.insert('account', authHash(id + '@fixture.test'), id, {
        id,
        email: id + '@fixture.test',
        emailVerifiedAt: new Date().toISOString(),
        revision: 0,
      });
    return {
      db,
      store,
      resources,
      deletion,
      journal,
      users,
      importer: new ArchiveImporter(db, deletion, resources, store, journal),
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}
async function imageRecord(): Promise<{ input: ArchiveImportInput; files: Express.Multer.File[] }> {
  const sourceId = randomUUID(),
    assetId = randomUUID(),
    content = createAlbumContent(),
    buffer = await sharp({ create: { width: 80, height: 60, channels: 4, background: '#aeba94' } })
      .webp()
      .toBuffer(),
    filePath = `media/albums/${sourceId}/${assetId}.webp`;
  content.pages[0].elements = [element('image', { assetId, photoStyle: 'film-35' })];
  content.memories = [
    {
      id: randomUUID(),
      title: 'Ảnh cũ',
      date: '2026-11-09',
      body: 'Một chút',
      featured: false,
      assetId,
    },
  ];
  return {
    input: {
      archiveHash: hash('fixture-archive'),
      kind: 'album',
      sourceId,
      content,
      assets: [{ id: assetId, name: 'fixture.webp', path: filePath, sha256: hash(buffer) }],
      audio: [],
    },
    files: [{ buffer, size: buffer.length, originalname: filePath } as Express.Multer.File],
  };
}
test('featured templates, Vietnamese outlines, 35mm geometry and original music are available', () => {
  assert.deepEqual(
    featuredTemplates.slice(0, 3).map((t) => t.id),
    ['photobooth', 'wooden-clips', 'ticket-stubs'],
  );
  assert.equal(vietnamDecorations.length, 10);
  assert.equal(new Set(vietnamDecorations.map((d) => d.id)).size, 10);
  for (const item of vietnamDecorations) {
    assert.match(decodeURIComponent(item.src), /<svg/);
    if (item.id.startsWith('vn-washi')) assert.doesNotMatch(decodeURIComponent(item.src), /<text/);
  }
  const photo = element('image', { photoStyle: 'film-35', width: 240, height: 300 });
  assert.deepEqual(photoBox(photo), { x: 28, y: 16, width: 184, height: 268 });
  for (const h of film35Holes(240, 300))
    assert.ok(h.x >= 0 && h.x + h.width <= 240 && h.y + h.height <= 300);
  assert.ok(musicCatalog.some((m) => m.id === 'piano-postcard'));
  assert.ok(musicCatalog.some((m) => m.id === 'acoustic-sunday'));
});
test('device PIN is salted, account-scoped, throttled and never stored as plaintext', async () => {
  const memory = new Map<string, string>(),
    old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => memory.set(k, v),
    },
  });
  try {
    const first = await createPasscode('alice', '4826'),
      other = await createPasscode('bob', '4826');
    assert.notEqual(first.verifier, other.verifier);
    assert.notEqual(first.salt, other.salt);
    assert.ok(!JSON.stringify(first).includes('4826'));
    memory.set('little-days:device-lock:alice', JSON.stringify(first));
    await assert.rejects(checkPasscode('bob', '4826'));
    await assert.rejects(checkPasscode('alice', '0000'));
    assert.equal(readPasscode('alice')!.failures, 1);
    await checkPasscode('alice', '4826');
    assert.equal(readPasscode('alice')!.failures, 0);
    memory.set(
      'little-days:device-lock:alice',
      JSON.stringify({ ...first, failures: 5, retryAt: Date.now() + 60000 }),
    );
    await assert.rejects(checkPasscode('alice', '4826'), /Thử lại sau/);
    memory.set('little-days:device-lock:alice', '{}');
    assert.throws(() => readPasscode('alice'), /bị hỏng/);
  } finally {
    if (old) Object.defineProperty(globalThis, 'localStorage', old);
    else delete (globalThis as any).localStorage;
  }
  assert.equal(assertionSignature(Uint8Array.from([48, 6, 2, 1, 1, 2, 1, 2])).length, 64);
  assert.throws(() => assertionSignature(Uint8Array.from([48, 5, 2, 1, 1, 2, 1, 2])));
});
test('QR pairing requires explicit verified consent, consumes once, retries safely and revokes immediately', async () => {
  const f = await fixture();
  try {
    const [owner, peer, outsider, unverified] = f.users;
    const account = await f.db.get<any>('account', authHash(unverified + '@fixture.test'));
    await f.db.put('account', authHash(account.email), unverified, {
      ...account,
      emailVerifiedAt: undefined,
    });
    const pair = await f.journal.sharing.createPair(owner);
    assert.match(pair.token, /^[a-f0-9]{64}$/);
    assert.equal((await f.journal.sharing.state(peer)).grants.length, 0);
    const preview = await f.journal.sharing.pairing(peer, { token: pair.token });
    assert.ok('displayName' in preview);
    assert.ok(!JSON.stringify(await f.db.list('timeline-pair', owner)).includes(pair.token));
    await assert.rejects(
      f.journal.sharing.pairing(unverified, { token: pair.token }, true),
      status(403),
    );
    await assert.rejects(
      f.journal.sharing.pairing(owner, { token: pair.token }, true),
      status(400),
    );
    const joined = await f.journal.sharing.pairing(peer, { token: pair.token }, true);
    assert.equal((joined as any).spaceId, owner);
    assert.deepEqual(await f.journal.sharing.pairing(peer, { token: pair.token }, true), joined);
    await assert.rejects(
      f.journal.sharing.pairing(outsider, { token: pair.token }, true),
      status(404),
    );
    const grant = (await f.journal.sharing.state(peer)).grants[0];
    await f.journal.sharing.change(owner, grant.id, { expectedRevision: grant.revision }, true);
    await assert.rejects(f.journal.sharing.pairing(peer, { token: pair.token }, true), status(404));
    const next = await f.journal.sharing.createPair(owner);
    await assert.rejects(f.journal.sharing.pairing(peer, { token: pair.token }, true), status(404));
    await f.journal.sharing.revokePair(owner);
    await assert.rejects(f.journal.sharing.pairing(peer, { token: next.token }, true), status(404));
    const expired = await f.journal.sharing.createPair(owner),
      key = authHash(expired.token),
      row = await f.db.get<any>('timeline-pair', key);
    await f.db.put('timeline-pair', key, owner, { ...row, expiresAt: 0 });
    await assert.rejects(
      f.journal.sharing.pairing(peer, { token: expired.token }, true),
      status(404),
    );
  } finally {
    await f.db.close();
  }
});
test('ZIP reader rejects traversal, compressed bombs and checksum mismatches before restore', async () => {
  const row = await imageRecord(),
    input = row.input;
  const media = input.assets[0],
    manifest = {
      version: 1,
      actor: randomUUID(),
      albums: [
        {
          ...input.content,
          id: input.sourceId,
          assets: [{ id: media.id, name: media.name, url: media.path }],
        },
      ],
      journal: [],
      audio: [],
      media: [{ path: media.path, bytes: row.files[0].size }],
    };
  const content = new TextEncoder().encode(JSON.stringify(manifest)),
    image = new Uint8Array(row.files[0].buffer),
    sums = new TextEncoder().encode(
      JSON.stringify({ 'little-days.json': hash(content), [media.path]: hash(image) }),
    );
  const valid = await zipFiles([
    { name: 'little-days.json', data: content },
    { name: media.path, data: image },
    { name: 'checksums.json', data: sums },
  ]).arrayBuffer();
  const records = await readPersonalArchive(valid);
  assert.equal(records.length, 1);
  assert.equal(records[0].input.sourceId, input.sourceId);
  const corrupt = await zipFiles([
    { name: 'little-days.json', data: content },
    { name: media.path, data: image },
    {
      name: 'checksums.json',
      data: new TextEncoder().encode(
        JSON.stringify({ 'little-days.json': '0'.repeat(64), [media.path]: hash(image) }),
      ),
    },
  ]).arrayBuffer();
  await assert.rejects(readPersonalArchive(corrupt), /Checksum/);
  const unsafe = new JSZip();
  unsafe.file('../little-days.json', '{}');
  unsafe.file('checksums.json', '{}');
  const unsafeBytes = await unsafe.generateAsync({ type: 'uint8array', compression: 'STORE' });
  assert.throws(() => inspectArchive(unsafeBytes), /không an toàn/);
  const compressed = new JSZip();
  compressed.file('little-days.json', 'x'.repeat(100000));
  compressed.file('checksums.json', '{}');
  assert.throws(() => inspectArchive(new Uint8Array()), /ZIP/);
  const compressedBytes = await compressed.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  });
  assert.throws(() => inspectArchive(compressedBytes), /Chỉ nhận ZIP gốc/);
});
test('archive copies remap private media, preserve source, deduplicate retries and never overwrite edits', async () => {
  const f = await fixture();
  try {
    const source = await imageRecord(),
      actor = f.users[0],
      other = f.users[1];
    if (source.input.kind === 'album')
      source.input.content.weeklyRecap = {
        weekStart: '2026-11-09',
        spaceId: other,
        layout: 'film',
      };
    const result = await f.importer.restore(actor, source.input, source.files);
    const album = await f.db.owned<Album>('album', result.id, actor);
    assert.ok(album);
    assert.deepEqual(
      album.weeklyRecap,
      source.input.kind === 'album' ? source.input.content.weeklyRecap : undefined,
    );
    assert.notEqual(album.assets[0].id, source.input.assets[0].id);
    assert.equal(album.pages[0].elements[0].assetId, album.assets[0].id);
    assert.equal(album.memories[0].assetId, album.assets[0].id);
    assert.equal(await f.db.owned('album', result.id, other), undefined);
    assert.equal(await f.db.get('album', source.input.sourceId), undefined);
    const usage = (await f.resources.usage(actor)).storageBytes;
    await f.db.compareAndSwap('album', album.id, actor, 0, {
      ...album,
      title: 'Đã sửa sau nhập',
      revision: 1,
    });
    const retry = await f.importer.restore(actor, source.input, source.files);
    assert.equal(retry.id, result.id);
    assert.equal(retry.reused, true);
    assert.equal((await f.db.get<Album>('album', album.id))!.title, 'Đã sửa sau nhập');
    assert.equal((await f.resources.usage(actor)).storageBytes, usage);
    const forOther = await f.importer.restore(other, source.input, source.files);
    assert.notEqual(forOther.id, result.id);
    await assert.rejects(
      f.importer.restore(
        actor,
        { ...source.input, content: { ...source.input.content, title: 'Nội dung khác' } },
        source.files,
      ),
      status(409),
    );
    await f.db.remove('album', album.id);
    await assert.rejects(f.importer.restore(actor, source.input, source.files), status(410));
    const invalid = await imageRecord();
    invalid.files[0].buffer = Buffer.from('wrong');
    invalid.files[0].size = 5;
    const before = (await f.resources.usage(actor)).storageBytes;
    await assert.rejects(f.importer.restore(actor, invalid.input, invalid.files), status(400));
    assert.equal((await f.resources.usage(actor)).storageBytes, before);
  } finally {
    await f.db.close();
  }
});
test('archive journal import stays private, clears old assignees and creates consistent history', async () => {
  const f = await fixture();
  try {
    const source = await imageRecord(),
      actor = f.users[0];
    const grant = await f.journal.sharing.invite(actor, { email: f.users[1] + '@fixture.test' });
    await f.journal.sharing.change(f.users[1], grant.id, { expectedRevision: 0, action: 'accept' });
    const sourceId = randomUUID(),
      asset = source.input.assets[0],
      filePath = `media/journal/${sourceId}/${asset.id}.webp`;
    source.files[0].originalname = filePath;
    const input: ArchiveImportInput = {
      archiveHash: source.input.archiveHash,
      kind: 'journal',
      sourceId,
      content: {
        title: 'Một kế hoạch cũ',
        date: '2026-11-09',
        note: 'Riêng',
        kind: 'plan',
        annual: false,
        plan: {
          status: 'planned',
          checklist: [
            { id: randomUUID(), text: 'Chuẩn bị', done: false, assigneeId: f.users[2] },
            { id: randomUUID(), text: 'Việc của mình', done: true, assigneeId: actor },
          ],
        },
      },
      assets: [{ ...asset, path: filePath }],
      audio: [],
    };
    const result = await f.importer.restore(actor, input, source.files),
      entry = await f.journal.read(actor, result.id);
    assert.equal(entry.visibility, 'private');
    assert.equal(entry.createdBy, actor);
    assert.equal(entry.plan!.checklist[0].assigneeId, null);
    assert.equal(entry.plan!.checklist[1].assigneeId, actor);
    assert.equal(entry.assets.length, 1);
    await assert.rejects(f.journal.read(f.users[1], result.id), status(404));
    const history = await f.journal.history(actor, result.id);
    assert.equal(history[0].snapshot.assets.length, 1);
    await assert.rejects(
      f.journal.create(actor, {
        ...input.content,
        kind: 'memory',
        plan: { status: 'completed', checklist: [] },
        timelineId: privateSpaceId(actor),
      }),
      status(400),
    );
    const completedSource = randomUUID(),
      completedPath = `media/journal/${completedSource}/${asset.id}.webp`;
    const restored = await f.importer.restore(
      actor,
      {
        ...input,
        sourceId: completedSource,
        content: {
          ...input.content,
          kind: 'memory',
          plan: { ...input.content.plan!, status: 'completed' },
        },
        assets: [{ ...input.assets[0], path: completedPath }],
      },
      [{ ...source.files[0], originalname: completedPath }],
    );
    const memory = await f.journal.read(actor, restored.id);
    assert.equal(memory.kind, 'memory');
    assert.equal(memory.plan!.status, 'completed');
    assert.equal(memory.plan!.checklist[0].assigneeId, null);
    assert.equal(memory.plan!.checklist[1].assigneeId, actor);
    await assert.rejects(f.journal.read(f.users[1], restored.id), status(404));
  } finally {
    await f.db.close();
  }
});
test('simultaneous archive attempts publish once and an uncertain successful commit keeps media', async () => {
  const f = await fixture();
  let release = () => {};
  try {
    const row = await imageRecord(),
      actor = f.users[0];
    let signal!: () => void;
    const started = new Promise<void>((r) => (signal = r)),
      held = new Promise<void>((r) => (release = r)),
      put = f.store.put.bind(f.store);
    let hold = true;
    f.store.put = async (...args) => {
      if (hold) {
        hold = false;
        signal();
        await held;
      }
      return put(...args);
    };
    const pending = f.importer.restore(actor, row.input, row.files);
    await started;
    await assert.rejects(f.importer.restore(actor, row.input, row.files), status(409));
    release();
    await pending;
    assert.equal((await f.db.list('album', actor)).length, 1);
    const second = await imageRecord(),
      transaction = f.db.transaction.bind(f.db);
    let thrown = false;
    f.db.transaction = async (action, readOnly) => {
      const result = await transaction(action, readOnly);
      if (
        !thrown &&
        (await f.db.list<any>('archive-import-receipt', actor)).filter((r) => r.completed)
          .length === 2
      ) {
        thrown = true;
        throw Error('Commit acknowledgement lost');
      }
      return result;
    };
    const restored = await f.importer.restore(actor, second.input, second.files);
    assert.equal(thrown, true);
    const saved = await f.db.get<Album>('album', restored.id);
    assert.ok(saved);
    await f.store.read('uploads/' + saved.assets[0].id + '.webp', 1048576);
    assert.equal((await f.db.list('album', actor)).length, 2);
  } finally {
    release();
    await f.db.close();
  }
});
test('archive restores private music references and quota failures publish nothing', async () => {
  const f = await fixture();
  try {
    const row = await imageRecord(),
      actor = f.users[0];
    assert.equal(row.input.kind, 'album');
    if (row.input.kind !== 'album') throw Error('fixture');
    const data = Buffer.alloc(44 + 22050 * 2 * 2);
    data.write('RIFF');
    data.writeUInt32LE(data.length - 8, 4);
    data.write('WAVEfmt ', 8);
    data.writeUInt32LE(16, 16);
    data.writeUInt16LE(1, 20);
    data.writeUInt16LE(1, 22);
    data.writeUInt32LE(22050, 24);
    data.writeUInt32LE(44100, 28);
    data.writeUInt16LE(2, 32);
    data.writeUInt16LE(16, 34);
    data.write('data', 36);
    data.writeUInt32LE(data.length - 44, 40);
    for (let i = 0; i < 44100; i++)
      data.writeInt16LE(Math.round(2000 * Math.sin((i / 22050) * 440 * Math.PI * 2)), 44 + i * 2);
    const sourceId = randomUUID(),
      filePath = `media/audio/${row.input.sourceId}/${sourceId}.mp3`;
    row.input.audio.push({ id: sourceId, path: filePath, name: 'Nhạc cũ', sha256: hash(data) });
    row.files.push({
      buffer: data,
      size: data.length,
      originalname: filePath,
    } as Express.Multer.File);
    row.input.content.presentation = {
      binding: 'stitched',
      transition: 'turn',
      ambience: 'none',
      musicId: 'custom',
      audioId: sourceId,
      audioStart: 0.2,
      audioEnd: 1.5,
      volume: 0.4,
    };
    const result = await f.importer.restore(actor, row.input, row.files),
      album = await f.db.get<Album>('album', result.id);
    assert.notEqual(album!.presentation!.audioId, sourceId);
    const audio = await f.db.owned<any>('audio', album!.presentation!.audioId!, actor);
    assert.equal(audio.albumId, result.id);
    assert.ok(audio.duration >= 1.9);
    await f.store.read('audio/' + audio.id + '.mp3', 1048576);
    const next = await imageRecord(),
      before = (await f.resources.usage(actor)).storageBytes;
    f.resources.limits.storageBytes = before + 1;
    await assert.rejects(f.importer.restore(actor, next.input, next.files), status(413));
    assert.equal((await f.db.list('album', actor)).length, 1);
    assert.equal((await f.resources.usage(actor)).storageBytes, before);
  } finally {
    await f.db.close();
  }
});
test('archive publication is fenced by account deletion; committed imports participate in backup', async () => {
  const f = await fixture();
  try {
    const source = await imageRecord(),
      actor = f.users[0],
      put = f.store.put.bind(f.store),
      blocked = f.deletion.blocked.bind(f.deletion);
    let deleting = false;
    f.deletion.blocked = async (id) => (id === actor && deleting) || (await blocked(id));
    f.store.put = async (...args) => {
      await put(...args);
      deleting = true;
    };
    await assert.rejects(f.importer.restore(actor, source.input, source.files), status(409));
    assert.equal((await f.db.list('album', actor)).length, 0);
    assert.equal((await f.resources.usage(actor)).storageBytes, 0);
    deleting = false;
    f.store.put = put;
    const imported = await f.importer.restore(actor, source.input, source.files);
    assert.ok(await f.db.owned('album', imported.id, actor));
    if (f.db.driver === 'sqlite') {
      const output = path.resolve('test-results/signature-backup', randomUUID());
      await createBackup(f.db, f.store, output);
      await verifyBackup(output);
    }
  } finally {
    await f.db.close();
  }
});
