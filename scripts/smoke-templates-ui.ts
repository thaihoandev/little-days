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
    await page.goto(origin + '/albums');
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
    await expect
      .poll(() =>
        viewer.locator('.book-paper [data-visual-effect]').evaluateAll(
          (nodes, expected) =>
            nodes.every(
              (n, i) =>
                Math.abs(Number((n.parentElement as HTMLElement).style.opacity) - expected[i]) <
                0.001,
            ),
          album.pages[0].elements
            .filter((e: { visible?: boolean }) => e.visible !== false)
            .map((e: { opacity: number }) => e.opacity),
        ),
      )
      .toBe(true);
    await viewer.locator('.book-shell').screenshot({ path });
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
      y = [110, 360, 620][Math.floor((i % 6) / 2)];
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
        pages: Array.from({ length: Math.ceil(counterPresets.length / 6) }, (_, i) => ({
          ...poster.pages[0],
          id: crypto.randomUUID(),
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
            ...pieces.slice(i * 12, i * 12 + 12),
          ],
        })),
      },
    },
  });
  assert.equal(posterResponse.status(), 200, await posterResponse.text());
  await page.goto(origin + '/albums');
  await page.getByRole('button', { name: 'Mở ' + poster.title, exact: true }).click();
  await page.getByRole('button', { name: 'Xem album', exact: true }).click();
  const posterViewer = page.getByRole('dialog', { name: 'Xem album', exact: true });
  for (let i = 0; i < Math.ceil(counterPresets.length / 6); i++) {
    const styled = counterPresets.slice(i * 6, i * 6 + 6).filter((p) => p.style !== 'plain').length;
    await expect(posterViewer.locator('[data-counter-style]')).toHaveCount(styled);
    assert.ok(
      await posterViewer
        .locator('[data-counter-style]')
        .evaluateAll((nodes) =>
          nodes.every(
            (node) =>
              node.scrollWidth <= node.clientWidth + 1 &&
              node.scrollHeight <= node.clientHeight + 1,
          ),
        ),
      'Styled counters must fit their own boxes',
    );
    await posterViewer
      .locator('.book-shell')
      .screenshot({ path: 'test-results/counter-designs-' + i + '.png' });
    if (i + 1 < Math.ceil(counterPresets.length / 6))
      await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Đóng album', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    `PASS templates: all ${builtInTemplates.length} illustrated layouts persist via API, SVG/photos decode in viewer, screenshots and contact sheet, scroll lock restored.`,
  );
} finally {
  await browser.close();
}
