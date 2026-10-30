import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { builtInTemplates } from '../packages/domain/templates.js';
import { counterPresets, counterPreset } from '../packages/domain/presets.js';
import { element, type Album } from '../packages/domain/index.js';
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
  await sharp({
    create: {
      width: 924,
      height: Math.ceil(thumbnails.length / 3) * 380,
      channels: 3,
      background: '#e7e4d8',
    },
  })
    .composite(
      thumbnails.map((input, i) => ({
        input,
        left: 18 + (i % 3) * 306,
        top: 18 + Math.floor(i / 3) * 378,
      })),
    )
    .png()
    .toFile('test-results/templates-contact-sheet.png');
  const poster: Album = await (
    await context.request.post(origin + '/api/albums', { data: { title: 'Các kiểu ngày kỉ niệm' } })
  ).json();
  const pieces = counterPresets.flatMap((spec, i) => {
    const counter = counterPreset(spec.id),
      y = [130, 370, 650][Math.floor(i / 2)];
    counter.x = i % 2 ? 375 : 45;
    counter.y = y;
    counter.width = spec.style === 'seal' ? 230 : 300;
    return [
      counter,
      element('text', {
        text: spec.name,
        font: 'sans',
        fontSize: 17,
        color: '#8d826c',
        x: counter.x,
        y: y + counter.height + 7,
        width: 300,
        height: 30,
      }),
    ];
  });
  const {
    id: posterId,
    revision: posterRevision,
    assets: posterAssets,
    createdAt: posterCreated,
    updatedAt: posterUpdated,
    schemaVersion: posterSchema,
    ...posterContent
  } = poster;
  const posterResponse = await context.request.patch(origin + '/api/albums/' + poster.id, {
    data: {
      expectedRevision: poster.revision,
      content: {
        ...posterContent,
        pages: [
          {
            ...poster.pages[0],
            elements: [
              element('text', {
                text: 'Những kiểu ngày thương',
                font: 'serif',
                fontSize: 35,
                x: 50,
                y: 45,
                width: 620,
                height: 60,
              }),
              ...pieces,
            ],
          },
        ],
      },
    },
  });
  assert.equal(posterResponse.status(), 200);
  await page.goto(origin);
  await page.getByRole('button', { name: 'Mở ' + poster.title, exact: true }).click();
  await page.getByRole('button', { name: 'Xem album', exact: true }).click();
  const posterViewer = page.getByRole('dialog', { name: 'Xem album', exact: true });
  await expect(posterViewer.locator('[data-counter-style]')).toHaveCount(5);
  assert.ok(
    await posterViewer
      .locator('[data-counter-style]')
      .evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1,
        ),
      ),
    'Styled counters must fit their own boxes',
  );
  await posterViewer
    .locator('.viewer-page > div')
    .screenshot({ path: 'test-results/counter-designs.png' });
  await page.getByRole('button', { name: 'Đóng album', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    `PASS templates: all ${builtInTemplates.length} illustrated layouts persist via API, SVG/photos decode in viewer, screenshots and contact sheet, scroll lock restored.`,
  );
} finally {
  await browser.close();
}
