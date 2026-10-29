import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  albumContentSchema,
  createAlbumContent,
  dateString,
  daysTogether,
  imageCrop,
  nextAnnual,
  todayIn,
  videoConfigSchema,
  displayedText,
  element,
} from '../packages/domain/index.js';

test('calendar days use the album timezone, including midnight', () => {
  assert.equal(todayIn('Asia/Ho_Chi_Minh', new Date('2026-10-27T18:00:00Z')), '2026-10-28');
  assert.equal(todayIn('America/New_York', new Date('2026-10-28T02:00:00Z')), '2026-10-27');
  assert.equal(daysTogether('2024-02-28', '2024-03-01'), 2);
  assert.equal(daysTogether('2026-10-28', '2026-10-28'), 0);
  assert.equal(daysTogether('2026-10-29', '2026-10-28'), -1);
});
test('annual anniversaries use Feb 28 in non-leap years and keep today', () => {
  assert.deepEqual(nextAnnual('2024-02-29', '2025-02-27'), {
    date: '2025-02-28',
    days: 1,
    years: 1,
  });
  assert.deepEqual(nextAnnual('2024-02-29', '2028-02-28'), {
    date: '2028-02-29',
    days: 1,
    years: 4,
  });
  assert.equal(nextAnnual('2024-10-20', '2026-10-20').days, 0);
  assert.equal(nextAnnual('2024-10-20', '2026-10-21').date, '2027-10-20');
  assert.equal(nextAnnual('2027-01-01', '2026-10-28').years, 0);
});
test('date validation rejects rollover dates and invalid timezones', () => {
  assert.equal(dateString.safeParse('2025-02-29').success, false);
  assert.equal(dateString.safeParse('2024-02-29').success, true);
  assert.equal(dateString.safeParse('2026-13-01').success, false);
  const album = createAlbumContent();
  album.timezone = 'Somewhere/Unknown';
  assert.equal(albumContentSchema.safeParse(album).success, false);
});
test('all template documents validate and reject duplicate IDs / invalid crop', () => {
  const album = createAlbumContent();
  assert.equal(albumContentSchema.safeParse(album).success, true);
  album.pages[0].elements.push(structuredClone(album.pages[0].elements[0]));
  assert.equal(albumContentSchema.safeParse(album).success, false);
  album.pages[0].elements.pop();
  album.pages[0].elements[0].crop = { x: 0.8, y: 0, width: 0.5, height: 1 };
  assert.equal(albumContentSchema.safeParse(album).success, false);
});
test('shared crop calculations preserve target aspect ratio and source bounds', () => {
  for (const [w, h, tw, th] of [
    [1200, 800, 240, 270],
    [600, 1000, 400, 200],
    [600, 650, 240, 270],
  ]) {
    const crop = imageCrop(w, h, tw, th, { x: 0.1, y: 0.2, width: 0.7, height: 0.6 });
    assert.ok(Math.abs(crop.width / crop.height - tw / th) < 1e-10);
    assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= w && crop.y + crop.height <= h);
  }
});
test('video config requires supported length and at least one scene', () => {
  const base = {
    seconds: 30,
    pageIds: [crypto.randomUUID()],
    opening: 'Hello',
    closing: 'Goodbye',
    musicId: 'none',
  };
  assert.equal(videoConfigSchema.safeParse(base).success, true);
  assert.equal(videoConfigSchema.safeParse({ ...base, seconds: 120 }).success, false);
  assert.equal(videoConfigSchema.safeParse({ ...base, pageIds: [] }).success, false);
});
test('dynamic milestone and annual labels resolve against a fixed reference date', () => {
  const e = element('anniversary', { dateMode: 'milestone', milestoneDays: 100 });
  assert.match(displayedText(e, { startDate: '2026-01-01' }, '2026-01-11'), /Còn 90 ngày/);
  assert.match(displayedText(e, { startDate: '2026-01-01' }, '2026-04-11'), /hôm nay/);
  assert.match(
    displayedText({ ...e, dateMode: 'annual' }, { startDate: '2024-02-29' }, '2025-02-28'),
    /tròn 1 năm/,
  );
});
