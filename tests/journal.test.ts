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
import { createBackup, restoreBackup } from '../apps/api/src/backup.js';
import {
  journalContentSchema,
  occursOn,
  nextOccurrence,
  monthDays,
} from '../packages/domain/journal.js';
import { builtInTemplates, templatePage } from '../packages/domain/templates.js';
import { musicCatalog } from '../packages/domain/music.js';
import { decorationCatalog } from '../packages/domain/decorations.js';
import { pageSchema, videoConfigSchema } from '../packages/domain/index.js';
import { readFile } from 'node:fs/promises';

const content = {
  title: 'Ngày của mình',
  date: '2026-10-30',
  note: 'Một lời nhắn riêng tư.',
  kind: 'memory' as const,
  annual: false,
};
async function fixture() {
  const root = path.resolve('test-results/journal', randomUUID()),
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
  const journal = new JournalService(db, store, resources, deletion);
  return { root, db, store, journal, resources };
}
test('calendar dates, annual leap-day events and month grids use calendar days without timezone drift', () => {
  assert.equal(journalContentSchema.safeParse({ ...content, date: '2025-02-29' }).success, false);
  assert.equal(occursOn({ date: '2024-02-29', annual: true }, '2025-02-28'), true);
  assert.equal(occursOn({ date: '2024-02-29', annual: true }, '2028-02-29'), true);
  assert.equal(occursOn({ date: '2024-02-29', annual: true }, '2025-03-01'), false);
  assert.equal(nextOccurrence({ date: '2024-10-30', annual: true }, '2026-10-30'), '2026-10-30');
  assert.equal(nextOccurrence({ date: '2024-10-30', annual: false }, '2026-10-30'), null);
  const days = monthDays(2026, 9);
  assert.equal(days.length, 42);
  assert.equal(new Date(days[0] + 'T00:00Z').getUTCDay(), 1);
  assert.equal(new Set(days).size, 42);
});
test('built-in designs validate, clone fresh IDs and bind only supplied album photos', () => {
  for (const template of builtInTemplates) {
    const page = templatePage(template.id, ['photo-one', 'photo-two', 'photo-three', 'photo-four']),
      second = templatePage(template.id);
    assert.ok(pageSchema.safeParse(page).success, template.id);
    assert.notEqual(page.id, second.id);
    assert.ok(
      page.elements.filter((e) => e.decorationId).length >= 3,
      template.id + ' has illustrated layout',
    );
    assert.ok(page.elements.every((e) => e.x + e.width <= 720 && e.y + e.height <= 900));
    assert.ok(
      page.elements.filter((e) => e.type === 'image').every((e) => e.assetId?.startsWith('photo-')),
    );
  }
  assert.throws(() => templatePage('../private'));
});
test('decoration catalog contains valid self-contained vector assets and persists through layout schema', async () => {
  assert.equal(new Set(decorationCatalog.map((d) => d.id)).size, decorationCatalog.length);
  assert.ok(new Set(decorationCatalog.map((d) => d.collection)).size >= 5);
  for (const art of decorationCatalog) {
    const svg = decodeURIComponent(art.src.split(',')[1]);
    assert.ok(!/<script|<foreignObject|https?:\/\/(?!www.w3.org\/2000\/svg)/i.test(svg));
    const metadata = await sharp(Buffer.from(svg)).metadata();
    assert.equal(metadata.width, art.width);
    assert.equal(metadata.height, art.height);
    await sharp(Buffer.from(svg)).png().toBuffer();
  }
});
test('music catalog uses distinct bundled PCM tracks accepted by saved video configuration', async () => {
  const hashes = new Set<string>();
  const { createHash } = await import('node:crypto');
  for (const track of musicCatalog) {
    const wav = await readFile('apps/web/public/audio/' + track.file);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.ok(wav.length > 100000);
    let peak = 0,
      energy = 0;
    for (let i = 44; i < wav.length; i += 2) {
      const sample = wav.readInt16LE(i);
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
    assert.ok(peak < 32767 && Math.sqrt(energy / ((wav.length - 44) / 2)) > 100);
    hashes.add(createHash('sha256').update(wav).digest('hex'));
    assert.ok(
      videoConfigSchema.safeParse({
        seconds: 15,
        pageIds: [randomUUID()],
        opening: '',
        closing: '',
        musicId: track.id,
      }).success,
    );
  }
  assert.equal(hashes.size, musicCatalog.length);
});
test('journal ownership/CAS, normalized private photos, quota references and backup restore stay consistent', async () => {
  const f = await fixture(),
    owner = randomUUID(),
    other = randomUUID();
  try {
    let entry = await f.journal.create(owner, content);
    assert.equal((await f.journal.list(other)).length, 0);
    await assert.rejects(f.journal.owned(other, entry.id));
    const first = await f.journal.save(owner, entry.id, {
      expectedRevision: entry.revision,
      content: { ...content, note: 'Bản mới' },
    });
    await assert.rejects(
      f.journal.save(owner, entry.id, { expectedRevision: entry.revision, content }),
    );
    entry = first;
    const bytes = await sharp({
      create: { width: 30, height: 40, channels: 4, background: '#d0bda8' },
    })
      .png()
      .toBuffer();
    entry = await f.journal.upload(owner, entry.id, {
      buffer: bytes,
      size: bytes.length,
      originalname: 'ảnh.png',
    } as Express.Multer.File);
    const key = 'journal/' + entry.assets[0].id + '.jpg';
    assert.equal((await sharp(await f.store.read(key)).metadata()).format, 'jpeg');
    assert.ok((await f.resources.references()).has(key));
    await assert.rejects(
      f.journal.upload(other, entry.id, {
        buffer: bytes,
        size: bytes.length,
        originalname: 'no.png',
      } as Express.Multer.File),
    );
    await assert.rejects(
      f.journal.upload(owner, entry.id, {
        buffer: Buffer.from('fake'),
        size: 4,
        originalname: 'fake.png',
      } as Express.Multer.File),
    );
    if (f.db.driver === 'sqlite') {
      const backup = path.join(f.root, 'snapshot');
      await createBackup(f.db, f.store, backup);
      const targetRoot = path.join(f.root, 'restored'),
        target = new Repository({ dataDir: targetRoot, databaseUrl: '' }),
        targetStore = new LocalMediaStore(targetRoot);
      await target.init();
      await targetStore.ready();
      try {
        await restoreBackup(target, targetStore, backup, true);
        assert.equal((await target.get<{ note: string }>('journal', entry.id))?.note, 'Bản mới');
        assert.deepEqual(await targetStore.read(key), await f.store.read(key));
      } finally {
        await target.close();
      }
    }
    await assert.rejects(f.journal.remove(owner, entry.id, { expectedRevision: 0 }));
    await f.journal.remove(owner, entry.id, { expectedRevision: entry.revision });
    await assert.rejects(f.store.read(key));
    assert.equal((await f.journal.list(owner)).length, 0);
  } finally {
    await f.db.query('DELETE FROM records WHERE owner IN (?,?) RETURNING id', [owner, other]);
    await f.db.close();
  }
});
