import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { Album, JobView } from '../packages/domain/index.js';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1') throw new Error('Use isolated QA runner');
await mkdir('test-results', { recursive: true });
const samplePath = 'test-results/background-astronaut.png';
let sample: Buffer;
try {
  sample = await readFile(samplePath);
} catch {
  // NASA public-domain photograph, distributed as scikit-image's astronaut sample; QA only, never shipped.
  const response = await fetch(
    'https://raw.githubusercontent.com/scikit-image/scikit-image/v0.19.3/skimage/data/astronaut.png',
    { signal: AbortSignal.timeout(60000) },
  );
  assert.equal(response.status, 200);
  sample = Buffer.from(await response.arrayBuffer());
  await writeFile(samplePath, sample);
}
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1550, height: 1100 },
      }),
      page = await context.newPage(),
      errors: string[] = [],
      outside: string[] = [];
    page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (request) => {
      if (request.url().startsWith('http') && new URL(request.url()).origin !== origin)
        outside.push(request.url());
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('browser error:', msg.text());
    });
    try {
      await context.request.get(origin + '/api/session');
      let album: Album = await (
        await context.request.post(origin + '/api/albums', {
          data: { title: 'Tách nền ' + mobile, templateId: 'minimal' },
        })
      ).json();
      album = await (
        await context.request.post(origin + '/api/albums/' + album.id + '/assets', {
          multipart: {
            file: { name: 'NASA-astronaut.png', mimeType: 'image/png', buffer: sample },
          },
        })
      ).json();
      const originalId = album.assets[0].id;
      album.pages[0].elements = album.pages[0].elements.map((e) =>
        e.type === 'image' ? { ...e, assetId: originalId } : e,
      );
      album = await (
        await context.request.patch(origin + '/api/albums/' + album.id, {
          data: { expectedRevision: album.revision, content: album },
        })
      ).json();
      const targetId = album.pages[0].elements.find((e) => e.type === 'image')!.id;
      const read = async (): Promise<Album> =>
        (await context.request.get(origin + '/api/albums/' + album.id)).json();
      await page.goto(origin);
      await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
      assert.equal(
        await page
          .locator('body')
          .evaluate(() =>
            performance
              .getEntriesByType('resource')
              .some((entry) => entry.name.includes('/background-removal/')),
          ),
        false,
        'Do not load model before explicit action',
      );
      await page.getByRole('button', { name: 'Lớp', exact: true }).click();
      await page.getByRole('checkbox', { name: 'Chọn lớp một ngày để nhớ', exact: true }).check();
      await page.getByRole('button', { name: 'Chỉnh / thay ảnh trong khung', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Chỉnh ảnh trong khung', exact: true });
      await dialog.getByRole('button', { name: 'Tách nền', exact: true }).click();
      await dialog.getByRole('button', { name: 'Hủy tách nền', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Tách nền', exact: true })).toBeEnabled();
      assert.equal((await read()).assets.length, 1);
      await dialog.getByRole('button', { name: 'Tách nền', exact: true }).click();
      await expect(
        dialog.getByRole('img', { name: 'Xem trước ảnh đã tách nền', exact: true }),
      ).toBeVisible({ timeout: 175000 });
      await expect(dialog.getByRole('button', { name: 'Áp dụng ảnh', exact: true })).toBeEnabled();
      assert.equal((await read()).assets.length, 1, 'Preview must not upload or replace source');
      await dialog.getByRole('button', { name: 'So sánh ảnh gốc', exact: true }).click();
      await expect(
        dialog.getByRole('img', { name: 'Ảnh gốc trước khi tách nền', exact: true }),
      ).toBeVisible();
      await dialog.getByRole('button', { name: 'Xem ảnh tách nền', exact: true }).click();
      await dialog.getByLabel('Bóng đổ nhẹ', { exact: true }).check();
      await expect(
        dialog.getByRole('img', { name: 'Xem trước ảnh đã tách nền', exact: true }),
      ).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Áp dụng ảnh', exact: true })).toBeEnabled();
      await dialog
        .getByRole('img', { name: 'Xem trước ảnh đã tách nền', exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: 'test-results/background-preview-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      await dialog.getByRole('button', { name: 'Áp dụng ảnh', exact: true }).click();
      await expect(dialog).not.toBeVisible({ timeout: 30000 });
      await expect
        .poll(
          async () => (await read()).pages[0].elements.find((e) => e.id === targetId)?.photoStyle,
          { timeout: 20000 },
        )
        .toBe('cutout');
      album = await read();
      const cutout = album.pages[0].elements.find((e) => e.id === targetId)!;
      assert.notEqual(cutout.assetId, originalId);
      assert.equal(album.assets.length, 2);
      const asset = album.assets.find((a) => a.id === cutout.assetId)!;
      const bytes = await (await context.request.get(origin + asset.url)).body();
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let transparent = 0,
        opaque = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 16) transparent++;
        if (data[i] > 240) opaque++;
      }
      assert.ok(
        transparent > info.width * info.height * 0.05 && opaque > info.width * info.height * 0.1,
        'Real inference must produce both foreground and transparent background',
      );
      await writeFile('test-results/background-cutout-' + mobile + '.webp', bytes);
      const other = await browser.newContext();
      await other.request.get(origin + '/api/session');
      assert.equal((await other.request.get(origin + asset.url)).status(), 404);
      await other.close();
      await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
      await expect
        .poll(async () => (await read()).pages[0].elements.find((e) => e.id === targetId)?.assetId)
        .toBe(originalId);
      await page.getByRole('button', { name: 'Làm lại', exact: true }).click();
      await expect
        .poll(
          async () => (await read()).pages[0].elements.find((e) => e.id === targetId)?.photoStyle,
        )
        .toBe('cutout');
      await page.reload();
      await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
      await page.getByRole('button', { name: 'Xem album', exact: true }).click();
      await expect(
        page
          .getByRole('dialog', { name: 'Xem album', exact: true })
          .locator('[data-photo-style="cutout"] img'),
      ).toBeVisible();
      await page.screenshot({
        path: 'test-results/background-viewer-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      if (!mobile) {
        album = await read();
        const response = await context.request.post(
          origin + '/api/albums/' + album.id + '/exports',
          {
            data: {
              expectedRevision: album.revision,
              idempotencyKey: crypto.randomUUID(),
              config: {
                seconds: 15,
                pageIds: [album.pages[0].id],
                sceneDurations: { [album.pages[0].id]: 2 },
                opening: 'Giữ lại một hình bóng',
                closing: 'Một chút xinh trên trang sổ',
                musicId: 'none',
              },
            },
          },
        );
        assert.equal(response.status(), 201);
        let job: JobView = await response.json();
        const until = Date.now() + 180000;
        while (!['completed', 'failed', 'canceled'].includes(job.status) && Date.now() < until) {
          await new Promise((r) => setTimeout(r, 1000));
          job = await (await context.request.get(origin + '/api/exports/' + job.id)).json();
        }
        assert.equal(job.status, 'completed', job.error);
        const video = await (
          await context.request.get(origin + '/api/exports/' + job.id + '/download')
        ).body();
        assert.equal(video.toString('ascii', 4, 8), 'ftyp');
        await writeFile('test-results/background-recap.mp4', video);
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(outside, [], 'Image/model inference must not contact third-party origins');
    } catch (error) {
      await page.screenshot({ path: 'test-results/background-failure.png', fullPage: true });
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS background removal: real local model, cancel, compare, styling, alpha-preserving private copy, undo/redo, reload, viewer and MP4 on desktop/mobile; no third-party browser requests.',
  );
} finally {
  await browser.close();
}
