import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { Album } from '../packages/domain/index.js';

const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1') throw new Error('Use isolated QA runner');
await mkdir('test-results', { recursive: true });
await writeFile(
  'test-results/design-photo.png',
  await sharp({ create: { width: 280, height: 340, channels: 3, background: '#b2bd9b' } })
    .png()
    .toBuffer(),
);
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1600, height: 1100 },
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await context.request.get(origin + '/api/session');
      const album: Album = await (
        await context.request.post(origin + '/api/albums', {
          data: { title: 'Thiết kế nhanh ' + crypto.randomUUID().slice(0, 6) },
        })
      ).json();
      const read = async (): Promise<Album> =>
        (await context.request.get(origin + '/api/albums/' + album.id)).json();
      const saved = async () => {
        await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
          timeout: 20000,
        });
        return read();
      };
      await page.goto(origin);
      await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
      await expect(page.locator('.canvas-sheet canvas')).toBeVisible();
      const quick = page.getByRole('toolbar', { name: 'Thiết kế nhanh' });
      await expect(page.locator('.page-delete')).toBeDisabled();
      await quick.getByRole('button', { name: 'Chữ', exact: true }).click();
      let current = await saved();
      assert.equal(current.pages[0].elements.length, album.pages[0].elements.length + 1);
      const original = current.pages[0].elements.at(-1)!;
      await page.keyboard.press('Control+d');
      current = await saved();
      const copy = current.pages[0].elements.at(-1)!;
      assert.notEqual(copy.id, original.id);
      assert.equal(copy.text, original.text);
      assert.equal(copy.x, original.x + 20);
      await quick.getByRole('button', { name: 'Căn giữa', exact: true }).click();
      current = await saved();
      assert.equal(current.pages[0].elements.at(-1)!.x, (720 - copy.width) / 2);
      assert.equal(current.pages[0].elements.at(-1)!.y, (900 - copy.height) / 2);
      await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
      current = await saved();
      assert.equal(current.pages[0].elements.at(-1)!.x, copy.x);
      const chooser = page.waitForEvent('filechooser');
      await quick.getByRole('button', { name: 'Tải ảnh', exact: true }).click();
      await (await chooser).setFiles('test-results/design-photo.png');
      await expect.poll(async () => (await read()).assets.length).toBe(1);
      await quick.getByRole('button', { name: 'Khung ảnh', exact: true }).click();
      current = await saved();
      assert.equal(current.pages[0].elements.at(-1)!.assetId, current.assets[0].id);
      await quick.getByRole('button', { name: 'Sticker', exact: true }).click();
      current = await saved();
      assert.equal(current.pages[0].elements.at(-1)!.type, 'sticker');
      await page.getByRole('button', { name: 'Trang sổ', exact: true }).click();
      await page.getByRole('button', { name: 'Nhân bản trang', exact: true }).click();
      current = await saved();
      assert.equal(current.pages.length, 2);
      await expect(page.getByLabel('Tên trang', { exact: true })).toHaveValue(
        current.pages[1].title,
      );
      page.once('dialog', (dialog) => dialog.dismiss());
      await page.locator('.page-delete').first().click();
      assert.equal((await read()).pages.length, 2);
      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('.page-delete').first().click();
      const remainingId = current.pages[1].id;
      current = await saved();
      assert.deepEqual(
        current.pages.map((p) => p.id),
        [remainingId],
      );
      await expect(page.getByLabel('Tên trang', { exact: true })).toHaveValue(
        current.pages[0].title,
      );
      await expect(page.locator('.page-delete')).toBeDisabled();
      await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
      current = await saved();
      assert.equal(current.pages.length, 2);
      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('.page-delete').last().click();
      current = await saved();
      assert.equal(current.pages.length, 1);
      await expect(page.getByLabel('Tên trang', { exact: true })).toHaveValue(
        current.pages[0].title,
      );
      await page.reload();
      await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
      await expect(page.locator('.page-delete')).toBeDisabled();
      await expect(page.locator('.canvas-sheet canvas')).toBeVisible();
      assert.equal((await read()).pages[0].elements.at(-1)!.type, 'sticker');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({
        path: 'test-results/design-tools-' + (mobile ? 'mobile' : 'desktop') + '.png',
        fullPage: true,
      });
      assert.deepEqual(errors, []);
    } catch (error) {
      await page.screenshot({ path: 'test-results/design-failure.png', fullPage: true });
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS design UI: quick text/photo/sticker, upload, Ctrl+D, center/undo, page delete/cancel/inactive/active/last-page guard, persistence and mobile overflow.',
  );
} finally {
  await browser.close();
}
