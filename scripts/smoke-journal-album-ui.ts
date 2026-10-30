import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { Album, JobView } from '../packages/domain/index.js';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1') throw new Error('Use isolated QA runner');
await mkdir('test-results', { recursive: true });
const photo = await sharp({
  create: { width: 400, height: 300, channels: 3, background: '#9fad8c' },
})
  .png()
  .toBuffer();
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1500, height: 1050 },
      }),
      page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await context.request.get(origin + '/api/session');
      const content = {
        title: 'Buổi hẹn đáng nhớ',
        date: '2026-10-20',
        note: 'Một lời nhắn riêng của hai đứa. '.repeat(70),
        kind: 'memory',
        annual: false,
      };
      let entry = await (
        await context.request.post(origin + '/api/journal', { data: content })
      ).json();
      entry = await (
        await context.request.post(origin + '/api/journal/' + entry.id + '/assets', {
          multipart: { file: { name: 'date.png', mimeType: 'image/png', buffer: photo } },
        })
      ).json();
      await page.goto(origin);
      await page.getByRole('button', { name: 'Giấy phép', exact: true }).click();
      const legal = page.getByRole('dialog', { name: 'Giấy phép Little Days', exact: true });
      await expect(legal).toContainText('AGPL-3.0');
      assert.equal((await context.request.get(origin + '/legal/AGPL-3.0-only.txt')).status(), 200);
      await page.keyboard.press('Escape');
      await expect(legal).not.toBeVisible();
      await page.getByRole('button', { name: 'Dòng thời gian', exact: true }).click();
      await page.getByLabel('Chọn dấu mốc ' + entry.title, { exact: true }).check();
      await page.getByRole('button', { name: 'Tạo scrapbook', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Tạo scrapbook từ dấu mốc', exact: true });
      await expect(dialog).toBeVisible();
      await dialog
        .getByLabel('Tên scrapbook', { exact: true })
        .fill('Sổ tạo từ timeline ' + (mobile ? 'mobile' : 'desktop'));
      await dialog.getByLabel('Tên của bạn', { exact: true }).fill('An');
      await dialog.getByLabel('Tên người thương', { exact: true }).fill('Bình');
      await dialog
        .getByRole('button', { name: 'Dùng mẫu Bưu thiếp chuyến đi', exact: true })
        .click();
      const create = dialog.getByRole('button', { name: /^Tạo scrapbook \d+ trang$/ });
      const button = await create.boundingBox();
      assert.ok(button && button.y + button.height <= (mobile ? 844 : 1050) + 1);
      assert.ok(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
      await page.screenshot({
        path: 'test-results/timeline-album-dialog-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      await create.click();
      await expect(dialog).not.toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('button', { name: 'Tạo video', exact: true })).toBeVisible();
      const album: Album = (await (await context.request.get(origin + '/api/albums')).json())[0];
      assert.ok(album.pages.length > 1);
      assert.equal(album.memories.map((m) => m.body).join(''), content.note);
      assert.ok(album.pages.flatMap((p) => p.elements).some((e) => e.text.includes('20/10/2026')));
      assert.notEqual(album.assets[0].id, entry.assets[0].id);
      assert.equal(
        (
          await context.request.delete(origin + '/api/journal/' + entry.id, {
            data: { expectedRevision: entry.revision },
          })
        ).status(),
        200,
      );
      assert.equal((await context.request.get(origin + album.assets[0].url)).status(), 200);
      await page.reload();
      await expect(page).toHaveURL(new RegExp('/albums/' + album.id + '$'));
      await expect(page.locator('.canvas-sheet canvas')).toBeVisible();
      await page.getByRole('button', { name: 'Xem album', exact: true }).click();
      const viewer = page.getByRole('dialog', { name: 'Xem album', exact: true });
      await viewer.getByRole('button', { name: 'Giấy phép', exact: true }).click();
      await expect(legal).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(legal).not.toBeVisible();
      await expect(viewer).toBeVisible();
      await page.screenshot({
        path: 'test-results/imported-album-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      await page.getByRole('button', { name: 'Đóng album', exact: true }).click();
      if (!mobile) {
        const pageIds = [album.pages[0].id, album.pages.at(-1)!.id];
        const response = await context.request.post(
          origin + '/api/albums/' + album.id + '/exports',
          {
            data: {
              expectedRevision: album.revision,
              idempotencyKey: crypto.randomUUID(),
              config: {
                seconds: 15,
                pageIds,
                sceneDurations: Object.fromEntries(pageIds.map((id) => [id, 1])),
                opening: 'Những ngày đã giữ',
                closing: 'Còn nhiều ngày thương',
                musicId: 'none',
              },
            },
          },
        );
        assert.equal(response.status(), 201);
        let job: JobView = await response.json();
        const deadline = Date.now() + 180000;
        while (!['completed', 'failed', 'canceled'].includes(job.status) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          job = await (await context.request.get(origin + '/api/exports/' + job.id)).json();
        }
        assert.equal(job.status, 'completed', job.error);
        const bytes = await (
          await context.request.get(origin + '/api/exports/' + job.id + '/download')
        ).body();
        assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
        await writeFile('test-results/timeline-import-recap.mp4', bytes);
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      await page.screenshot({ path: 'test-results/journal-album-failure.png', fullPage: true });
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS timeline→album: selection, template preview, names/dates/full notes, independent photos after source deletion, reload, private MP4 and legal/source dialog on desktop/mobile.',
  );
} finally {
  await browser.close();
}
