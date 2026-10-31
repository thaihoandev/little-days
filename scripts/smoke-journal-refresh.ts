import { chromium, expect, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Album } from '../packages/domain/index.js';
import type { JournalEntry } from '../packages/domain/journal.js';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1' || !process.env.AUTH_UI_DATA_DIR)
  throw new Error('Use isolated QA with local email fixtures');
await mkdir('test-results', { recursive: true });
const outbox = path.join(process.env.AUTH_UI_DATA_DIR, 'mail'),
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE,
    headless: true,
  });
async function register(context: BrowserContext, email: string) {
  await context.request.get(origin + '/api/session');
  assert.equal(
    (
      await context.request.post(origin + '/api/auth/register', {
        data: { email, password: 'Fixture-password-123!' },
      })
    ).status(),
    201,
  );
  const messages = await Promise.all(
    (await readdir(outbox))
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => JSON.parse(await readFile(path.join(outbox, f), 'utf8'))),
  );
  const mail = messages.find((m) => m.to === email);
  assert.ok(mail);
  const token = new URLSearchParams(new URL(mail.text.match(/http[^\s]+/)[0]).hash.slice(1)).get(
    'token',
  );
  assert.equal(
    (await context.request.post(origin + '/api/auth/verify-email', { data: { token } })).status(),
    201,
  );
}
const noise = Buffer.alloc(1200 * 900 * 3);
let seed = 317;
for (let i = 0; i < noise.length; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  noise[i] = seed >>> 24;
}
const large = await sharp(noise, { raw: { width: 1200, height: 900, channels: 3 } })
  .resize(4000, 3000)
  .jpeg({ quality: 92 })
  .withMetadata({ orientation: 6 })
  .toBuffer();
assert.ok(large.length > 128 * 1024 && large.length < 20 * 1048576);
const tile = await sharp({
    create: { width: 256, height: 256, channels: 3, background: '#e0e6d7' },
  })
    .png()
    .toBuffer(),
  reports: object[] = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1600, height: 1100 },
        geolocation: { latitude: 15.8801, longitude: 108.338 },
        permissions: ['geolocation'],
      }),
      other = await browser.newContext(),
      page = await context.newPage(),
      errors: string[] = [],
      tileRequests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://tile.openstreetmap.org/**', (route) => {
      tileRequests.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: tile,
        headers: { 'Cache-Control': 'public,max-age=604800' },
      });
    });
    const suffix = crypto.randomUUID(),
      email = 'profile-' + suffix + '@example.test',
      otherEmail = 'friend-' + suffix + '@example.test';
    try {
      await register(context, email);
      await register(other, otherEmail);
      const session = await (await context.request.get(origin + '/api/session')).json(),
        today = new Intl.DateTimeFormat('en-CA', {
          timeZone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
      let album: Album = await (
        await context.request.post(origin + '/api/albums', {
          data: { title: 'Một cuốn sổ riêng ' + mobile, startDate: today, templateId: 'minimal' },
        })
      ).json();
      album = await (
        await context.request.patch(origin + '/api/albums/' + album.id, {
          data: {
            expectedRevision: album.revision,
            content: { ...album, startDate: today, memories: [] },
          },
        })
      ).json();
      const base = { date: today, annual: false, note: 'Một ngày nhiều điều đáng nhớ.' };
      let entry: JournalEntry = await (
        await context.request.post(origin + '/api/journal', {
          data: { ...base, title: 'Nơi mình gặp nhau ' + mobile, kind: 'memory' },
        })
      ).json();
      await context.request.post(origin + '/api/journal', {
        data: { ...base, title: 'Nhớ mang máy ảnh ' + mobile, kind: 'note' },
      });
      for (const offset of [1, 2]) {
        const date = new Date(today + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() - offset);
        await context.request.post(origin + '/api/journal', {
          data: {
            ...base,
            date: date.toISOString().slice(0, 10),
            title: 'Một ngày đã qua ' + offset,
            kind: 'memory',
          },
        });
      }
      await page.goto(origin + '/today');
      await expect(
        page.getByRole('heading', { name: 'Những điều mình đã giữ', exact: true }),
      ).toBeVisible();
      const day = page.getByRole('region', { name: 'Kỉ niệm ngày ' + today, exact: true });
      await expect(day.locator('.journal-day-heading time')).toHaveCount(1);
      await expect(day.locator('.album-story')).toHaveCount(1);
      await expect(day.locator('.milestone-story')).toHaveCount(2);
      await expect(page.locator('.welcome,.journey-intro-copy')).toHaveCount(0);
      assert.equal(tileRequests.length, 0);
      await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
      const account = page.getByRole('dialog', { name: 'Tài khoản của bạn', exact: true }),
        profile = account.getByRole('region', { name: 'Hồ sơ cá nhân', exact: true });
      await profile.getByLabel('Tên hiển thị', { exact: true }).fill('Minh An');
      await profile.getByRole('button', { name: 'Lưu hồ sơ', exact: true }).click();
      await expect(profile.getByRole('status')).toContainText('Đã lưu tên');
      let avatarBytes = 0;
      page.on('request', (request) => {
        if (request.url().endsWith('/api/profile/avatar') && request.method() === 'POST')
          avatarBytes = request.postDataBuffer()?.length || 0;
      });
      await profile
        .getByLabel('Đổi ảnh đại diện', { exact: true })
        .setInputFiles({ name: 'avatar-large.jpg', mimeType: 'image/jpeg', buffer: large });
      await expect(profile.getByRole('status')).toContainText('Đã cập nhật ảnh đại diện', {
        timeout: 45000,
      });
      await expect(profile.locator('.user-avatar img')).toBeVisible();
      assert.ok(
        avatarBytes > 0 && avatarBytes < large.length * 0.5,
        'Browser must send a resized image, not full original',
      );
      await page.screenshot({ path: 'test-results/profile-refresh-' + mobile + '.png' });
      await account.getByRole('button', { name: 'Đóng', exact: true }).click();
      await expect(page.locator('.account-button strong')).toHaveText('Minh An');
      await page.getByRole('button', { name: 'Dòng thời gian', exact: true }).click();
      await expect(day.locator('.album-story')).toHaveCount(1);
      const inlineMap = page.getByRole('complementary', {
        name: 'Bản đồ dòng thời gian',
        exact: true,
      });
      await expect(inlineMap.locator('.leaflet-container')).toBeVisible();
      await expect.poll(() => tileRequests.length).toBeGreaterThan(0);
      await expect(page.locator('.timeline-trail .trail-thread')).toHaveAttribute('d', / C /);
      await expect(page.locator('.timeline-trail circle')).toHaveCount(3);
      const positions = await page
        .locator('.journal-timeline > .journal-day-group')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            x: node.getBoundingClientRect().x,
            width: node.getBoundingClientRect().width,
          })),
        );
      if (!mobile) {
        assert.ok(positions[1].x > positions[0].x + 100);
        assert.ok(positions[0].width >= 280 && positions[0].width < 500);
      } else assert.ok(Math.abs(positions[1].x - positions[0].x) < 2);
      await page.getByRole('button', { name: 'Sửa dấu mốc ' + entry.title, exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Sửa dấu mốc', exact: true });
      await form.getByLabel('Tên địa điểm', { exact: true }).fill('Hội An');
      await expect(form.getByLabel('Vĩ độ', { exact: true })).toHaveCount(0);
      await expect(form.getByLabel('Kinh độ', { exact: true })).toHaveCount(0);
      await expect(form.locator('.leaflet-container')).toBeVisible();
      await form.locator('.memory-map').click({ position: { x: 120, y: 100 } });
      await expect(form.getByRole('status').filter({ hasText: 'Đã ghim địa điểm' })).toBeVisible();
      await form.getByRole('button', { name: 'Vị trí hiện tại', exact: true }).click();
      await expect(
        form.getByRole('button', { name: 'Vị trí hiện tại', exact: true }),
      ).toBeEnabled();
      await form.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(form).not.toBeVisible();
      entry = (await (await context.request.get(origin + '/api/journal')).json()).find(
        (e: JournalEntry) => e.id === entry.id,
      );
      assert.equal(entry.location?.label, 'Hội An');
      assert.equal(entry.location?.latitude, 15.8801);
      entry = await (
        await context.request.post(origin + '/api/journal/' + entry.id + '/assets', {
          multipart: { file: { name: 'map-photo.png', mimeType: 'image/png', buffer: tile } },
        })
      ).json();
      await context.request.post(origin + '/api/journal', {
        data: {
          ...base,
          title: 'Lần quay lại ' + mobile,
          kind: 'memory',
          location: entry.location,
        },
      });
      await page.reload();
      await expect(page.getByRole('heading', { name: entry.title, exact: true })).toBeVisible();
      await expect(inlineMap.locator('.memory-pin-face img')).toBeVisible();
      await expect
        .poll(
          async () =>
            await inlineMap
              .locator('.memory-pin-face img')
              .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
        )
        .toBe(true);
      await inlineMap.locator('.memory-photo-pin').click();
      await expect(inlineMap.locator('.leaflet-popup-content')).toBeVisible();
      await page.getByRole('textbox', { name: 'Tìm dấu mốc', exact: true }).fill(' ');
      await expect(inlineMap.locator('.leaflet-popup-content')).toBeVisible();
      await page.getByRole('textbox', { name: 'Tìm dấu mốc', exact: true }).fill('');
      await page.getByRole('button', { name: 'Mở rộng bản đồ', exact: true }).click();
      const mapDialog = page.getByRole('dialog', { name: 'Bản đồ kỉ niệm', exact: true });
      await expect(mapDialog.locator('.leaflet-control-attribution')).toContainText(
        'OpenStreetMap',
      );
      await expect(mapDialog.locator('.map-marker-count')).toHaveText('2');
      await mapDialog.locator('.memory-photo-pin').click();
      await expect(mapDialog.locator('.leaflet-popup-content button')).toHaveCount(2);
      const zoom = mapDialog.getByLabel('Mức thu phóng', { exact: true });
      let level = Number(await zoom.textContent());
      await mapDialog.locator('.memory-map').focus();
      await page.keyboard.press('+');
      await expect.poll(async () => Number(await zoom.textContent())).toBeGreaterThan(level);
      level = Number(await zoom.textContent());
      await page.keyboard.press('-');
      await expect.poll(async () => Number(await zoom.textContent())).toBeLessThan(level);
      level = Number(await zoom.textContent());
      await mapDialog.locator('.memory-map').hover();
      await page.mouse.wheel(0, -200);
      await expect.poll(async () => Number(await zoom.textContent())).toBeGreaterThan(level);
      await mapDialog.getByRole('button', { name: 'Xem toàn bộ vị trí', exact: true }).click();
      await page.screenshot({ path: 'test-results/milestone-map-' + mobile + '.png' });
      await mapDialog.getByRole('button', { name: 'Đóng bản đồ kỉ niệm', exact: true }).click();
      await page.screenshot({
        path: 'test-results/timeline-groups-' + mobile + '.png',
        fullPage: true,
      });
      await page.goto(origin + '/calendar');
      const calendarFeed = page.getByRole('region', { name: 'Các dấu mốc', exact: true });
      await expect(calendarFeed.locator('.journal-day-heading time')).toHaveCount(0);
      await expect(calendarFeed.locator('header.section-heading > div > h2')).toHaveCount(1);
      await page.screenshot({
        path: 'test-results/calendar-single-date-' + mobile + '.png',
        fullPage: true,
      });
      await page.goto(origin + '/albums/' + album.id);
      await page.getByRole('button', { name: 'Ảnh', exact: true }).click();
      let active = 0,
        maxActive = 0,
        ordinal = 0;
      const transferred: number[] = [];
      await page.route('**/api/albums/*/assets', async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        const index = ordinal++;
        active++;
        maxActive = Math.max(maxActive, active);
        transferred.push(route.request().postDataBuffer()?.length || 0);
        try {
          const response = await route.fetch();
          await new Promise((r) => setTimeout(r, index === 0 ? 1400 : 100));
          await route.fulfill({ response });
        } finally {
          active--;
        }
      });
      const uploadStart = Date.now();
      await page.locator('input[type=file][multiple]').setInputFiles([
        { name: 'large-one.jpg', mimeType: 'image/jpeg', buffer: large },
        { name: 'large-two.jpg', mimeType: 'image/jpeg', buffer: large },
      ]);
      await expect(
        page.getByRole('status').filter({ hasText: 'Đang giữ lại những khoảnh khắc' }),
      ).not.toBeVisible({ timeout: 60000 });
      await expect(
        page.getByRole('button', { name: 'Thêm large-one.jpg', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Thêm large-two.jpg', exact: true }),
      ).toBeVisible();
      album = await (await context.request.get(origin + '/api/albums/' + album.id)).json();
      assert.equal(album.assets.length, 2);
      assert.equal(maxActive, 2);
      assert.ok(transferred.every((n) => n > 0 && n < large.length * 0.5));
      assert.ok(
        album.assets.every((a) => (a.height || 0) > (a.width || 0)),
        'EXIF rotation must survive client resize',
      );
      const fixtureUploadElapsedMs = Date.now() - uploadStart;
      const me = await (await context.request.get(origin + '/api/session')).json();
      const invite = await (
        await context.request.post(origin + '/api/timeline-sharing', {
          data: { email: otherEmail },
        })
      ).json();
      await other.request.patch(origin + '/api/timeline-sharing/' + invite.id, {
        data: { expectedRevision: 0, action: 'accept' },
      });
      assert.equal((await other.request.get(origin + me.avatarUrl)).status(), 200);
      const received = await (await other.request.get(origin + '/api/timeline-sharing')).json();
      assert.equal(received.grants[0].ownerLabel, 'Minh An');
      await context.request.delete(origin + '/api/timeline-sharing/' + invite.id, {
        data: { expectedRevision: 1 },
      });
      assert.equal((await other.request.get(origin + me.avatarUrl)).status(), 404);
      await page.goto(origin + '/today');
      await expect(
        page.getByRole('heading', { name: 'Hôm nay của Minh An', exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: 'test-results/home-data-first-' + mobile + '.png',
        fullPage: true,
      });
      await expect(page.locator('.sidebar .user-avatar')).toBeVisible();
      const longName = 'An'.repeat(30);
      const rename = await context.request.patch(origin + '/api/profile', {
        data: { displayName: longName, expectedRevision: me.profileRevision },
      });
      assert.equal(rename.status(), 200);
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Hôm nay của ' + longName, exact: true }),
      ).toBeVisible();
      await expect(page.locator('.sidebar .user-avatar')).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      reports.push({
        mobile,
        originalImageBytes: large.length,
        avatarRequestBytes: avatarBytes,
        albumRequestBytes: transferred,
        maxParallelUploads: maxActive,
        fixtureUploadElapsedMs,
      });
    } catch (error) {
      await page.screenshot({
        path: 'test-results/refresh-failure-' + mobile + '.png',
        fullPage: true,
      });
      throw error;
    } finally {
      await context.close();
      await other.close();
    }
  }
  await writeFile('test-results/upload-measurements.json', JSON.stringify(reports, null, 2));
  console.log(
    'PASS journal refresh: alternating day groups and winding line, padded compact cards, calendar date shown once, personalized profiles, reduced concurrent uploads, EXIF, inline photo map with wheel/keyboard zoom, pin/GPS without coordinate inputs and mobile.',
  );
} finally {
  await browser.close();
}
