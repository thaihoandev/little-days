import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import type { Album } from '../packages/domain/index.js';
const origin = process.env.SMOKE_UI_ORIGIN;
if (!origin || !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
  throw new Error('Save recovery QA requires a local fixture origin.');
if (!process.env.BROWSER_EXECUTABLE) throw new Error('Run via npm run test:pilot.');
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      }),
      page = await context.newPage();
    try {
      await context.request.get(origin + '/api/session');
      const album: Album = await (
        await context.request.post(origin + '/api/albums', {
          data: { title: 'Phục hồi lưu ' + crypto.randomUUID() },
        })
      ).json();
      await page.goto(origin);
      await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
      await page.getByRole('button', { name: 'Trang trí', exact: true }).click();
      await page.getByRole('button', { name: 'Thêm tiêu đề', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
        timeout: 15000,
      });
      let requests = 0,
        firstAt = 0,
        secondAt = 0;
      await page.route('**/api/albums/' + album.id, async (route) => {
        if (route.request().method() !== 'PATCH') {
          await route.continue();
          return;
        }
        requests++;
        if (requests === 1) {
          firstAt = Date.now();
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            headers: { 'Retry-After': '3' },
            body: JSON.stringify({ message: 'Đang sao lưu dữ liệu.', code: 'BACKUP_IN_PROGRESS' }),
          });
        } else {
          secondAt = Date.now();
          await route.continue();
        }
      });
      const text = page.getByLabel('Nội dung', { exact: true });
      await text.fill('Lời nhắn trong lúc bảo trì');
      await expect(page.getByRole('alert')).toContainText('sẽ tự lưu lại');
      await text.fill('Lời nhắn mới nhất — vẫn còn đầy đủ');
      await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
        timeout: 15000,
      });
      assert.ok(
        secondAt - firstAt >= 2900,
        'Retry must respect Retry-After even when editing again',
      );
      const saved: Album = await (
        await context.request.get(origin + '/api/albums/' + album.id)
      ).json();
      assert.ok(
        saved.pages.some((p) =>
          p.elements.some((e) => e.text === 'Lời nhắn mới nhất — vẫn còn đầy đủ'),
        ),
      );
      await page.unroute('**/api/albums/' + album.id);
      let manual = 0;
      await page.route('**/api/albums/' + album.id, async (route) => {
        if (route.request().method() !== 'PATCH') {
          await route.continue();
          return;
        }
        manual++;
        if (manual === 1)
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            headers: { 'Retry-After': '1' },
            body: JSON.stringify({ message: 'Đang sao lưu dữ liệu.', code: 'BACKUP_IN_PROGRESS' }),
          });
        else await route.continue();
      });
      await text.fill('Lưu thủ công cũng phục hồi');
      await page.getByRole('button', { name: 'Chưa lưu', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Đang sao lưu dữ liệu.');
      await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByRole('alert')).not.toBeVisible();
      assert.equal(manual, 2);
      await page.unroute('**/api/albums/' + album.id);
      let conflicts = 0;
      await page.route('**/api/albums/' + album.id, async (route) => {
        if (route.request().method() !== 'PATCH') {
          await route.continue();
          return;
        }
        conflicts++;
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Bản này đã được sửa ở tab khác.' }),
        });
      });
      await text.fill('Bản nháp có xung đột');
      await expect(page.getByRole('button', { name: 'Có xung đột', exact: true })).toBeVisible();
      await page.waitForTimeout(3500);
      assert.equal(conflicts, 1, 'A conflict must not be retried automatically');
      assert.ok(
        await page.evaluate(
          (id) =>
            Object.entries(localStorage).some(
              ([k, v]) => k.endsWith(':' + id) && v.includes('Bản nháp có xung đột'),
            ),
          album.id,
        ),
      );
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({
        path: 'test-results/save-recovery-' + (mobile ? 'mobile' : 'desktop') + '.png',
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS save recovery: desktop/mobile preserve latest edits, honor Retry-After, recover autosave/manual save, clear resolved errors and keep 409 conflicts blocked with a local draft.',
  );
} finally {
  await browser.close();
}
