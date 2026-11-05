import { createBackup } from '../apps/api/src/backup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { Repository } from '../apps/api/src/database.js';
import { authHash } from '../apps/api/src/auth.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { JournalService } from '../apps/api/src/journal.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { CoupleRituals } from '../apps/api/src/couple-rituals.js';
import { builtInTemplates, templatePage } from '../packages/domain/templates.js';
import {
  VIETNAM_PROVINCES,
  detectProvince,
  groupFootprintsByProvince,
} from '../packages/domain/vietnam-provinces.js';
import type { JournalEntry } from '../packages/domain/journal.js';

test('Priority 3: Trendy Templates exist and generate valid 720x900 pages', () => {
  const templateIds = ['photobooth', 'wooden-clips', 'ticket-stubs'] as const;

  for (const id of templateIds) {
    const spec = builtInTemplates.find((t) => t.id === id);
    assert.ok(spec, `Template ${id} must be in builtInTemplates`);
    assert.ok(spec.name, `Template ${id} must have a name`);
    assert.ok(spec.description, `Template ${id} must have a description`);

    const page = templatePage(id, ['asset-1', 'asset-2', 'asset-3', 'asset-4']);
    assert.ok(page.id, 'Page must have an ID');
    assert.equal(page.title, spec.name);
    assert.equal(page.background, spec.color);
    assert.ok(page.elements.length >= 5, `Template ${id} must have elements`);

    // Verify photobooth has 4 photos
    if (id === 'photobooth') {
      const photos = page.elements.filter((e) => e.type === 'image');
      assert.equal(photos.length, 4, 'Photobooth must have 4 vertical photos');
      assert.ok(
        page.elements.some((e) => e.type === 'text' && e.text.includes('LIFE 4 CUTS')),
        'Photobooth must have title',
      );
    }

    // Verify wooden clips has rope and clips
    if (id === 'wooden-clips') {
      assert.ok(
        page.elements.some((e) => e.type === 'sticker' && e.decorationId === 'rope-rustic'),
        'Must have rustic rope',
      );
      assert.ok(
        page.elements.some((e) => e.type === 'sticker' && e.decorationId === 'clip-wood'),
        'Must have wooden clip',
      );
    }

    // Verify ticket stubs has boarding pass and tickets
    if (id === 'ticket-stubs') {
      assert.ok(
        page.elements.some((e) => e.type === 'sticker' && e.decorationId === 'boarding-pass'),
        'Must have boarding pass',
      );
      assert.ok(
        page.elements.some((e) => e.type === 'sticker' && e.decorationId === 'ticket-cinema'),
        'Must have cinema ticket',
      );
    }
  }
});

test('Priority 3: current 34 Vietnam provinces and island footprint detection', () => {
  assert.equal(VIETNAM_PROVINCES.length, 34, 'Must have exactly 34 provinces');

  // Test detection by label
  const entries: JournalEntry[] = [
    {
      id: 'e1',
      title: 'Đi dạo hồ Gươm',
      date: '2026-05-10',
      note: 'Một ngày hè mát mẻ',
      kind: 'memory',
      annual: false,
      assets: [],
      revision: 0,
      createdAt: '',
      updatedAt: '',
      location: { label: 'Hà Nội', latitude: 21.03, longitude: 105.85 },
    },
    {
      id: 'e2',
      title: 'Uống cà phê ngắm sương mù',
      date: '2026-06-12',
      note: 'Thời tiết se lạnh',
      kind: 'memory',
      annual: false,
      assets: [],
      revision: 0,
      createdAt: '',
      updatedAt: '',
      location: { label: 'Đà Lạt', latitude: 11.94, longitude: 108.44 },
    },
    {
      id: 'e3',
      title: 'Ngắm hoàng hôn bãi Sao',
      date: '2026-07-20',
      note: 'Biển xanh cát trắng',
      kind: 'memory',
      annual: false,
      assets: [],
      revision: 0,
      createdAt: '',
      updatedAt: '',
      location: { label: 'Phú Quốc', latitude: 10.22, longitude: 103.96 },
    },
    {
      id: 'e4',
      title: 'Đi dạo phố cổ',
      date: '2026-08-15',
      note: 'Đèn lồng lung linh',
      kind: 'memory',
      annual: false,
      assets: [],
      revision: 0,
      createdAt: '',
      updatedAt: '',
      location: { label: 'Hội An', latitude: 15.88, longitude: 108.33 },
    },
  ];

  assert.equal(detectProvince(entries[0]), 'ha-noi');
  assert.equal(detectProvince(entries[1]), 'lam-dong');
  assert.equal(detectProvince(entries[2]), 'an-giang');
  assert.equal(detectProvince(entries[3]), 'da-nang');

  const grouped = groupFootprintsByProvince(entries);
  assert.equal(grouped.get('ha-noi')?.length, 1);
  assert.equal(grouped.get('lam-dong')?.length, 1);
  assert.equal(grouped.get('an-giang')?.length, 1);
  assert.equal(grouped.get('da-nang')?.length, 1);
  const at = (label: string, latitude: number, longitude: number) => ({
    ...entries[0],
    location: { label, latitude, longitude },
  });
  assert.equal(detectProvince(at('Hoàng Sa', 16.5, 112)), 'da-nang');
  assert.equal(detectProvince(at('Trường Sa', 9.5, 114)), 'khanh-hoa');
  assert.equal(detectProvince({ ...entries[0], kind: 'plan' }), null);
  assert.equal(detectProvince({ ...entries[0], date: '2099-01-01' }), null);
  assert.equal(detectProvince(at('Hà Nội', 40, 20)), null);
});

test('Priority 3: Love Jar allows photo attachment, keeps photo secret until opened, and cleans up on delete', async () => {
  const root = path.resolve('test-results/priority-3-jar', randomUUID());
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
  const journal = new JournalService(db, store, resources, deletion);

  const actorA = randomUUID();
  const actorB = randomUUID();

  // Create accounts
  await db.insert('account', authHash('priority-a@example.test'), actorA, {
    id: actorA,
    email: 'priority-a@example.test',
    emailVerifiedAt: new Date().toISOString(),
  });
  await db.insert('account', authHash('priority-b@example.test'), actorB, {
    id: actorB,
    email: 'priority-b@example.test',
    emailVerifiedAt: new Date().toISOString(),
  });

  // Create shared space
  const grant = await journal.sharing.invite(actorA, { email: 'priority-b@example.test' });
  await journal.sharing.change(actorB, grant.id, { expectedRevision: 0, action: 'accept' });
  const spaceId = actorA;

  const rituals = new CoupleRituals(
    db,
    journal,
    deletion,
    resources,
    store,
    () => new Date('2026-11-05T12:00:00Z'),
  );

  // 1. Upload photo for love note
  const imageBuffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 150, b: 150 } },
  })
    .webp()
    .toBuffer();

  const fakeFile: Express.Multer.File = {
    buffer: imageBuffer,
    originalname: 'secret-moment.png',
    mimetype: 'image/png',
    size: imageBuffer.length,
    fieldname: 'file',
    encoding: '7bit',
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  };

  const uploadId = randomUUID();
  const uploadResult = await rituals.uploadPhoto(actorA, spaceId, fakeFile, uploadId);
  assert.deepEqual(await rituals.uploadPhoto(actorA, spaceId, fakeFile, uploadId), uploadResult);
  assert.deepEqual(
    await rituals.uploadPhotoStatus(
      actorA,
      spaceId,
      uploadId,
      createHash('sha256').update(imageBuffer).digest('hex'),
    ),
    {
      state: 'completed',
      result: uploadResult,
    },
  );
  assert.ok(uploadResult.assetId);
  assert.ok(uploadResult.url.includes(uploadResult.assetId));

  // 2. Add love note with photo scheduled for future
  const requestId = randomUUID();
  const note = await rituals.addNote(actorA, spaceId, {
    requestId,
    text: 'Lời nhắn gửi vào tương lai kèm bức ảnh bí mật',
    mode: 'scheduled',
    openDate: '2026-12-31',
    photoUrl: uploadResult.url,
  });

  assert.equal(note.hasPhoto, true);
  // Author A can see the photo in their own view
  assert.equal(note.photoUrl, uploadResult.url);

  // Actor B should NOT see the photo before it is opened!
  const stateB = await rituals.state(actorB, spaceId);
  const noteForB = stateB.jar.find((n) => n.id === note.id);
  assert.ok(noteForB);
  assert.equal(noteForB.hasPhoto, true);
  assert.equal(noteForB.opened, false);
  assert.equal(
    noteForB.photoUrl,
    undefined,
    'Photo must be kept secret from recipient before note is opened',
  );
  assert.equal(noteForB.text, undefined, 'Text must be kept secret before note is opened');

  // Verify direct photo key access check
  await assert.rejects(
    rituals.notePhotoKey(actorB, spaceId, uploadResult.assetId),
    /chưa đến ngày mở/,
    'Recipient cannot access secret photo key directly before opened',
  );

  // Author A CAN access photo key
  const keyA = await rituals.notePhotoKey(actorA, spaceId, uploadResult.assetId);
  assert.ok(keyA.endsWith('.webp'));

  assert.ok((await resources.references()).has(keyA), 'photo participates in retention references');
  if (db.driver === 'sqlite') await createBackup(db, store, path.join(root, 'backup'));
  await assert.rejects(
    rituals.addNote(actorB, spaceId, {
      requestId: randomUUID(),
      text: 'forged',
      mode: 'scheduled',
      openDate: '2026-12-31',
      photoUrl: uploadResult.url,
    }),
  );
  await assert.rejects(
    rituals.addNote(actorA, spaceId, {
      requestId: randomUUID(),
      text: 'duplicate',
      mode: 'scheduled',
      openDate: '2026-12-31',
      photoUrl: uploadResult.url,
    }),
  );
  await rituals.vote(actorA, spaceId, note.id, { expectedRevision: 0, approve: true });
  await assert.rejects(rituals.notePhotoKey(actorB, spaceId, uploadResult.assetId));
  const opened = await rituals.vote(actorB, spaceId, note.id, {
    expectedRevision: 1,
    approve: true,
  });
  assert.equal(await rituals.notePhotoKey(actorB, spaceId, uploadResult.assetId), keyA);
  // Delete note cleans up
  await rituals.removeNote(actorA, spaceId, note.id, { expectedRevision: opened.revision });
  const afterDeleteState = await rituals.state(actorA, spaceId);
  assert.equal(
    afterDeleteState.jar.some((n) => n.id === note.id),
    false,
  );
  assert.equal((await resources.references()).has(keyA), false);
  await db.close();
});
