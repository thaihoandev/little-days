import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Repository } from '../apps/api/src/database.js';
import { personalArchive } from '../apps/api/src/personal-archive.js';
import { createAlbumContent } from '../packages/domain/index.js';
import { calendarEvent } from '../packages/domain/icalendar.js';
import { summarizeRhythm } from '../packages/domain/rhythm.js';
import {
  catalogQuestion,
  questionCatalog,
  questionPreferencesInput,
} from '../packages/domain/question-catalog.js';
import { zipFiles, imagePdf } from '../apps/web/src/portable-files.js';

test('weekly sand counts distinct member-days, including partial days, excludes outsiders/future', () => {
  const result = summarizeRhythm('space', '2026-11-09', ['a', 'b'], 'a', [
    { date: '2026-11-09', author: 'a' },
    { date: '2026-11-09', author: 'a' },
    { date: '2026-11-09', author: 'outsider' },
    { date: '2026-11-10', author: 'b' },
  ]);
  assert.equal(result.memberDays, 1);
  assert.equal(result.weeklyCapacity, 14);
  assert.equal(result.completedDays, 0);
  assert.equal(result.days[0].contributors, 1);
  assert.equal(summarizeRhythm('s', '2026-11-09', ['a', 'b'], 'a', []).memberDays, 0);
});
test('calendar all-day exclusive end, leap date, stable UID and UTF-8 folding resist line injection', () => {
  const content = calendarEvent(
    {
      id: randomUUID(),
      title: 'Ngày thương tiếng Việt, '.repeat(20) + '\nBEGIN:VEVENT',
      date: '2028-02-29',
      annual: true,
    },
    new Date('2026-11-09T00:00:00Z'),
  );
  assert.match(content, /DTSTART;VALUE=DATE:20280229/);
  assert.match(content, /DTEND;VALUE=DATE:20280301/);
  assert.match(content, /RRULE:FREQ=YEARLY/);
  assert.equal(content.match(/\r\nBEGIN:VEVENT/g)?.length, 1);
  for (const line of content.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.throws(() => calendarEvent({ id: 'x', title: 'x', date: '2026-02-29', annual: false }));
});
test('question catalog IDs are unique, excluded topics never selected and full cycle has no repeats', () => {
  assert.equal(new Set(questionCatalog.map((q) => q.id)).size, questionCatalog.length);
  assert.equal(questionCatalog.length, 96);
  const ids = Array.from(
    { length: questionCatalog.length },
    (_, day) => catalogQuestion(day, 45, []).id,
  );
  assert.equal(new Set(ids).size, questionCatalog.length);
  for (let day = 0; day < 120; day++)
    assert.equal(catalogQuestion(day, 99, ['everyday', 'gratitude', 'plans']).topic, 'memories');
  assert.equal(
    questionPreferencesInput.safeParse({
      expectedRevision: -1,
      excluded: ['everyday', 'gratitude', 'plans', 'memories'],
    }).success,
    false,
  );
});
test('personal archive allows only personal content, strips credentials, fingerprints changes and scopes actor', async () => {
  const actor = randomUUID(),
    other = randomUUID(),
    db = new Repository({
      dataDir: path.resolve('test-results/archive-unit', randomUUID()),
      databaseUrl: process.env.TEST_DATABASE_URL || '',
    });
  await db.init();
  try {
    const id = randomUUID(),
      content = createAlbumContent();
    await db.insert('album', id, actor, {
      ...content,
      id,
      revision: 0,
      createdAt: '2026-11-09',
      updatedAt: '2026-11-09',
      schemaVersion: 1,
      assets: [],
      credential: 'must-not-export',
    });
    await db.insert('account', randomUUID(), actor, {
      password: 'secret',
      email: 'private@fixture.test',
    });
    await db.insert('love-note', randomUUID(), actor, { text: 'sealed-secret' });
    const personal = randomUUID(),
      common = randomUUID();
    const entry = {
      title: 'Riêng',
      date: '2026-11-09',
      note: 'Một dòng riêng',
      kind: 'memory',
      annual: false,
      revision: 0,
      createdAt: '2026-11-09',
      updatedAt: '2026-11-09',
      assets: [],
    };
    await db.insert('journal', personal, actor, { ...entry, id: personal, visibility: 'private' });
    await db.insert('journal', common, actor, {
      ...entry,
      id: common,
      visibility: 'shared',
      note: 'shared-secret',
    });
    const result = await personalArchive(db, actor);
    assert.equal(result.albums.length, 1);
    assert.equal(result.journal.length, 1);
    assert.ok(!/secret|credential|password/.test(JSON.stringify(result)));
    assert.equal((await personalArchive(db, other)).albums.length, 0);
    assert.equal((await personalArchive(db, actor)).fingerprint, result.fingerprint);
    await db.compareAndSwap('album', id, actor, 0, {
      ...result.albums[0],
      revision: 1,
      title: 'Mới',
    });
    assert.notEqual((await personalArchive(db, actor)).fingerprint, result.fingerprint);
  } finally {
    await db.query('DELETE FROM records WHERE owner=? RETURNING id', [actor]);
    await db.close();
  }
});
test('portable ZIP has valid local/central offsets and PDF has valid cross reference offsets', async () => {
  const vector = new DataView(
    await zipFiles([
      { name: 'vector.txt', data: new TextEncoder().encode('123456789') },
    ]).arrayBuffer(),
  );
  assert.equal(vector.getUint32(14, true), 0xcbf43926, 'standard CRC-32 check vector');
  const zip = new Uint8Array(
    await zipFiles([
      { name: 'memories.md', data: new TextEncoder().encode('Tiếng Việt') },
    ]).arrayBuffer(),
  );
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const end = zip.length - 22,
    central = view.getUint32(end + 16, true);
  assert.equal(view.getUint32(central, true), 0x02014b50);
  assert.equal(view.getUint32(central + 42, true), 0);
  assert.throws(() => zipFiles([{ name: '../secret', data: new Uint8Array() }]));
  const pdf = Buffer.from(
    await (
      await imagePdf([{ jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 720, height: 900 }])
    ).arrayBuffer(),
  );
  const text = pdf.toString('latin1'),
    start = Number(/startxref\n(\d+)/.exec(text)![1]);
  assert.equal(text.slice(start, start + 4), 'xref');
  const offsets = [...text.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  offsets.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`)));
});
test('archive enforces raw payload bounds before deserializing records', async () => {
  const owner = randomUUID(),
    db = new Repository({
      dataDir: path.resolve('test-results/archive-limit', randomUUID()),
      databaseUrl: process.env.TEST_DATABASE_URL || '',
    });
  await db.init();
  try {
    await db.insert('album', randomUUID(), owner, { padding: 'x'.repeat(8 * 1024 * 1024 + 1) });
    await assert.rejects(
      personalArchive(db, owner),
      (e: any) => e.getStatus?.() === 400 && e.message.includes('8 MiB'),
    );
  } finally {
    await db.query('DELETE FROM records WHERE owner=? RETURNING id', [owner]);
    await db.close();
  }
});
