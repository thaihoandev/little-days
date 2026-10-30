import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { builtInTemplates } from '../packages/domain/templates.js';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1') throw new Error('Use isolated QA runner');
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1000, height: 1050 } }),
  page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await context.request.get(origin + '/api/session');
  const thumbnails: Buffer[] = [];
  for (const template of builtInTemplates) {
    const title = 'Mẫu ' + template.name;
    const response = await context.request.post(origin + '/api/albums', {
      data: { title, templateId: template.id },
    });
    assert.equal(response.status(), 201);
    const album = await response.json();
    assert.ok(
      album.pages[0].elements.filter((e: { decorationId?: string }) => e.decorationId).length >= 3,
    );
    await page.goto(origin);
    await page.getByRole('button', { name: 'Mở ' + title, exact: true }).click();
    await page.getByRole('button', { name: 'Xem album', exact: true }).click();
    const viewer = page.getByRole('dialog', { name: 'Xem album', exact: true });
    await expect(viewer).toBeVisible();
    await expect
      .poll(() =>
        viewer
          .locator('.viewer-page img')
          .evaluateAll(
            (images) =>
              images.length > 0 &&
              images.every(
                (img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0,
              ),
          ),
      )
      .toBe(true);
    const path = 'test-results/template-design-' + template.id + '.png';
    await viewer.locator('.viewer-page > div').screenshot({ path });
    thumbnails.push(
      await sharp(await readFile(path))
        .resize(288, 360)
        .png()
        .toBuffer(),
    );
    await page.getByRole('button', { name: 'Đóng album', exact: true }).click();
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  }
  await sharp({ create: { width: 924, height: 1140, channels: 3, background: '#e7e4d8' } })
    .composite(
      thumbnails.map((input, i) => ({
        input,
        left: 18 + (i % 3) * 306,
        top: 18 + Math.floor(i / 3) * 378,
      })),
    )
    .png()
    .toFile('test-results/templates-contact-sheet.png');
  assert.deepEqual(errors, []);
  console.log(
    'PASS templates: all 9 illustrated layouts persist via API, SVG/photos decode in viewer, screenshots and contact sheet, scroll lock restored.',
  );
} finally {
  await browser.close();
}
