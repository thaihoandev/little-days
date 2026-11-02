import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Repository } from '../apps/api/src/database.js';
import type { Album, Asset } from '../packages/domain/index.js';
import type { JournalEntry } from '../packages/domain/journal.js';
const origin = process.env.SMOKE_UI_ORIGIN!,
  dataDir = process.env.AUTH_UI_DATA_DIR!;
if (
  !origin ||
  new URL(origin).hostname !== '127.0.0.1' ||
  !dataDir ||
  !path.resolve(dataDir).includes(path.join('test-results', 'pilot'))
)
  throw Error('Isolated QA only');
const png = await sharp('apps/web/public/illustrations/demo-1.svg')
  .resize(1200, 1600)
  .png()
  .toBuffer();
const second = await sharp('apps/web/public/illustrations/demo-2.svg')
  .resize(900, 1200)
  .png()
  .toBuffer();
const webp = await sharp(png).webp({ quality: 80 }).toBuffer();
await writeFile('test-results/performance-upload.png', png);
await writeFile('test-results/performance-reject.png', second);
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1600, height: 1000 },
      }),
      page = await context.newPage(),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (r.method() === 'GET') requests.push(new URL(r.url()).pathname + new URL(r.url()).search);
    });
    await page.route('https://tile.openstreetmap.org/**', (r) =>
      r.fulfill({ contentType: 'image/png', body: png }),
    );
    try {
      const user = await (await context.request.get(origin + '/api/session')).json();
      let album: Album = await (
        await context.request.post(origin + '/api/albums', {
          data: { title: 'Sổ nhiều ảnh ' + crypto.randomUUID().slice(0, 5) },
        })
      ).json();
      const db = new Repository({ dataDir, databaseUrl: '' });
      await db.init();
      try {
        await mkdir(path.join(dataDir, 'uploads'), { recursive: true });
        const assets: Asset[] = [];
        for (let i = 0; i < 65; i++) {
          const id = crypto.randomUUID();
          assets.push({
            id,
            name: 'fixture-' + i + '.webp',
            width: 1200,
            height: 1600,
            bytes: webp.length,
            url: '/api/albums/' + album.id + '/assets/' + id,
          });
          await writeFile(path.join(dataDir, 'uploads', id + '.webp'), webp);
        }
        album = {
          ...album,
          assets,
          pages: Array.from({ length: 20 }, () => ({ ...album.pages[0], id: crypto.randomUUID() })),
        };
        await db.put('album', album.id, user.id, album);
        const now = new Date().toISOString();
        for (let i = 0; i < 45; i++) {
          const entry: JournalEntry = {
            id: crypto.randomUUID(),
            title: 'Chặng đường ' + i,
            date: '2026-11-02',
            note: 'Lời nhắn ' + i,
            kind: 'memory',
            annual: false,
            revision: 0,
            createdAt: now,
            updatedAt: now,
            assets: [],
            ...(i === 0
              ? { location: { label: 'Địa điểm riêng', latitude: 10.77, longitude: 106.69 } }
              : {}),
          };
          await db.insert('journal', entry.id, user.id, entry);
        }
      } finally {
        await db.close();
      }
      await page.goto(origin + '/albums');
      await expect(
        page
          .locator('.album-card')
          .filter({ has: page.getByRole('button', { name: 'Mở ' + album.title, exact: true }) }),
      ).toContainText('20 trang');
      assert.ok(requests.includes('/api/albums?summary=1'));
      assert.ok(!requests.includes('/api/albums'));
      await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
      await expect(page.locator('.canvas-sheet canvas')).toBeVisible();
      let posts = 0,
        statusReads = 0;
      await page.route('**/api/albums/' + album.id + '/assets', async (route) => {
        posts++;
        assert.match(route.request().headers()['x-upload-id'], /^[a-f0-9-]{36}$/);
        const response = await route.fetch();
        assert.equal(response.status(), 201);
        await route.abort('connectionreset');
      });
      page.on('request', (r) => {
        if (r.url().includes('/uploads/')) statusReads++;
      });
      const choose = page.waitForEvent('filechooser');
      await page
        .getByRole('toolbar', { name: 'Thiết kế nhanh' })
        .getByRole('button', { name: 'Tải ảnh', exact: true })
        .click();
      await (await choose).setFiles('test-results/performance-upload.png');
      await expect
        .poll(
          async () =>
            (await (await context.request.get(origin + '/api/albums/' + album.id)).json()).assets
              .length,
        )
        .toBe(66);
      await expect(page.locator('.upload-progress')).toHaveCount(0, { timeout: 25000 });
      assert.equal(posts, 1);
      assert.ok(statusReads >= 1);
      await page.unroute('**/api/albums/' + album.id + '/assets');
      await page.route('**/api/albums/' + album.id + '/assets', async (route) => {
        if (route.request().postDataBuffer()?.includes(Buffer.from('performance-reject.png')))
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Fixture rejected' }),
          });
        else await route.continue();
      });
      const choose2 = page.waitForEvent('filechooser');
      await page
        .getByRole('toolbar', { name: 'Thiết kế nhanh' })
        .getByRole('button', { name: 'Tải ảnh', exact: true })
        .click();
      await (
        await choose2
      ).setFiles(['test-results/performance-upload.png', 'test-results/performance-reject.png']);
      await expect(page.getByRole('button', { name: 'Thử lại ảnh 1', exact: true })).toBeVisible({
        timeout: 25000,
      });
      assert.equal(
        (await (await context.request.get(origin + '/api/albums/' + album.id)).json()).assets
          .length,
        67,
      );
      await page.unroute('**/api/albums/' + album.id + '/assets');
      await page.getByRole('button', { name: 'Thử lại ảnh 1', exact: true }).click();
      await expect(page.locator('.upload-progress')).toHaveCount(0, { timeout: 25000 });
      await expect(page.getByRole('button', { name: 'Thử lại ảnh 1', exact: true })).toHaveCount(
        0,
        { timeout: 25000 },
      );
      assert.equal(
        (await (await context.request.get(origin + '/api/albums/' + album.id)).json()).assets
          .length,
        68,
      );
      await page.goto(origin + '/photos');
      await expect(page.locator('.memory-photo-tile')).toHaveCount(60);
      await page.getByRole('button', { name: 'Xem thêm ảnh', exact: true }).click();
      await expect(page.locator('.memory-photo-tile')).toHaveCount(68);
      await expect(page.locator('.memory-photo-tile img').first()).toHaveAttribute(
        'src',
        /thumbnail=1/,
      );
      await page.getByLabel('Tìm ảnh theo kỉ niệm').fill('không tồn tại');
      await expect(page.locator('.memory-photo-tile')).toHaveCount(0);
      await expect(page.locator('.data-loading')).toHaveCount(0);
      await page.goto(origin + '/timeline');
      await expect(page.locator('.journal-entry')).toHaveCount(20);
      await page.getByRole('button', { name: 'Xem thêm dấu mốc', exact: true }).click();
      await expect(page.locator('.journal-entry')).toHaveCount(40);
      await page.getByRole('button', { name: 'Xem thêm dấu mốc', exact: true }).click();
      await expect(page.locator('.journal-entry')).toHaveCount(46);
      const search = page.getByLabel('Tìm dấu mốc');
      await search.fill('Chặng đường 44');
      await expect(page.locator('.journal-entry')).toHaveCount(1);
      await expect(page.locator('.journal-entry')).toContainText('Chặng đường 44');
      assert.ok(!requests.includes('/api/journal'));
      assert.ok(requests.some((r) => r.startsWith('/api/library/feed?')));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: 'test-results/library-performance-' + mobile + '.png',
        fullPage: true,
      });
    } catch (error) {
      await page.screenshot({
        path: 'test-results/library-performance-failure.png',
        fullPage: true,
      });
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS library performance: SQL-backed 20/60 pagination and search, lightweight 20-page album summaries, lazy private thumbnails, lost-response reconciliation without a second POST and individual failed-file retry on desktop/mobile.',
  );
} finally {
  await browser.close();
}
