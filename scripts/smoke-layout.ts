import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { type Album, type JobView, element } from '../packages/domain/index.js';
import { bounds } from '../packages/domain/layout.js';
import { counterPreset } from '../packages/domain/presets.js';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    path.resolve(
      'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe',
    ),
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const origin = process.env.SMOKE_UI_ORIGIN || 'http://127.0.0.1:5173';
const base = origin + '/api';
try {
  await context.request.get(base + '/session');
  let album: Album = await (
    await context.request.post(base + '/albums', {
      data: { title: 'Kiểm thử bố cục ' + Date.now() },
    })
  ).json();
  album.pages = [
    {
      id: crypto.randomUUID(),
      title: 'Bốn điều thương',
      background: '#f8f1e5',
      elements: [
        ...[80, 280, 480].map((x, i) =>
          element('image', {
            x,
            y: 100,
            width: 140,
            height: 180,
            rotation: 0,
            assetId: 'demo-' + (i + 1),
            text: 'Ảnh ' + (i + 1),
          }),
        ),
        element('text', {
          x: 150,
          y: 400,
          width: 400,
          height: 60,
          fontSize: 32,
          text: 'Nhóm kỉ niệm',
          rotation: 0,
        }),
        element('text', {
          x: 0,
          y: 0,
          width: 720,
          height: 900,
          fontSize: 160,
          text: 'KHÔNG HIỆN',
          color: '#ff0000',
          visible: false,
        }),
      ],
    },
  ];
  const { id, revision, assets, createdAt, updatedAt, schemaVersion, ...content } = album;
  assert.equal(
    (
      await context.request.patch(base + '/albums/' + id, {
        data: { expectedRevision: revision, content },
      })
    ).status(),
    200,
  );
  const read = async (): Promise<Album> =>
    await (await context.request.get(base + '/albums/' + id)).json();
  const saved = async () => {
    await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
      timeout: 15000,
    });
    return read();
  };
  await page.goto(origin);
  await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
  await expect(page.locator('.canvas-sheet canvas')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const clickAt = async (x: number, y: number, shift = false) => {
    const b = await page.locator('.canvas-sheet').boundingBox();
    assert.ok(b);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(b.x + (x * b.width) / 720, b.y + (y * b.height) / 900);
    if (shift) await page.keyboard.up('Shift');
  };
  await clickAt(130, 160);
  await clickAt(330, 160, true);
  await clickAt(530, 160, true);
  await clickAt(300, 425, true);
  await expect(page.getByText('Đã chọn 4 phần tử', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nhóm', exact: true }).click();
  album = await saved();
  const original = album.pages[0].elements.slice(0, 4);
  assert.ok(original[0].groupId);
  assert.ok(original.every((e) => e.groupId === original[0].groupId));
  // Drag one photo: all four elements must move in one undo step.
  const b = await page.locator('.canvas-sheet').boundingBox();
  assert.ok(b);
  await page.mouse.move(b.x + (130 * b.width) / 720, b.y + (160 * b.height) / 900);
  await page.mouse.down();
  await page.mouse.move(b.x + (170 * b.width) / 720, b.y + (190 * b.height) / 900, { steps: 12 });
  await page.mouse.up();
  album = await saved();
  const moved = album.pages[0].elements.slice(0, 4);
  assert.ok(Math.abs(moved[0].x - original[0].x) > 20);
  for (let i = 1; i < 4; i++) {
    assert.ok(Math.abs(moved[i].x - original[i].x - (moved[0].x - original[0].x)) < 0.01);
    assert.ok(Math.abs(moved[i].y - original[i].y - (moved[0].y - original[0].y)) < 0.01);
  }
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  album = await saved();
  assert.deepEqual(album.pages[0].elements.slice(0, 4), original);
  // Resize the multi-node Transformer using its actual visible corner.
  const corner = await page.evaluate(() => {
    const k = (
      window as unknown as {
        Konva: {
          stages: {
            findOne: (selector: string) => { getAbsolutePosition: () => { x: number; y: number } };
          }[];
        };
      }
    ).Konva;
    return k?.stages[0]?.findOne('.bottom-right')?.getAbsolutePosition();
  });
  assert.ok(corner, 'Konva transform handle missing');
  await page.mouse.move(b.x + corner.x, b.y + corner.y);
  await page.mouse.down();
  await page.mouse.move(b.x + corner.x + 35, b.y + corner.y + 25, { steps: 12 });
  await page.mouse.up();
  album = await saved();
  assert.ok(Math.abs(album.pages[0].elements[0].width - original[0].width) > 2);
  const factor = album.pages[0].elements[0].width / original[0].width;
  assert.ok(Math.abs(album.pages[0].elements[3].width / original[3].width - factor) < 0.01);
  await page.getByRole('button', { name: 'Giữa trang', exact: true }).click();
  album = await saved();
  const box = bounds(album.pages[0].elements.slice(0, 4));
  assert.ok(Math.abs(box.x + box.width / 2 - 360) < 0.01);
  assert.ok(Math.abs(box.y + box.height / 2 - 450) < 0.01);
  await page.getByRole('button', { name: 'Lớp', exact: true }).click();
  await page.getByRole('button', { name: 'Ẩn lựa chọn', exact: true }).click();
  album = await saved();
  assert.ok(album.pages[0].elements.slice(0, 4).every((e) => e.visible === false));
  await page.getByRole('button', { name: 'Hiện lựa chọn', exact: true }).click();
  await saved();
  await page.getByRole('button', { name: 'Khóa lựa chọn', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Giữa trang', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Mở khóa lựa chọn', exact: true }).click();
  await saved();
  await page.getByRole('button', { name: 'Trang sổ', exact: true }).click();
  await page.getByLabel('Tên mẫu cá nhân').fill('Bố cục bốn điều thương');
  await page.getByRole('button', { name: 'Lưu trang thành mẫu', exact: true }).click();
  await page
    .getByRole('button', { name: 'Thêm trang từ Bố cục bốn điều thương', exact: true })
    .click();
  album = await saved();
  assert.equal(album.pages.length, 2);
  assert.ok(album.pages[1].elements.slice(0, 3).every((e) => e.assetId === null));
  const source = album.pages[0].elements[0],
    copy = album.pages[1].elements[0];
  assert.equal(copy.width, source.width);
  assert.notEqual(copy.groupId, source.groupId);
  await page.reload();
  await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
  await page.getByRole('button', { name: 'Lớp', exact: true }).click();
  await page.locator('.layer-name').filter({ hasText: 'Ảnh 1' }).click();
  await expect(page.getByText('Đã chọn 4 phần tử', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/editor-layout-desktop.png', fullPage: true });
  // Clear and marquee-select all visible content, with the hidden overlay excluded.
  await clickAt(30, 30);
  const c = await page.locator('.canvas-sheet').boundingBox();
  assert.ok(c);
  await page.mouse.move(c.x + (25 * c.width) / 720, c.y + (25 * c.height) / 900);
  await page.mouse.down();
  await page.mouse.move(c.x + (690 * c.width) / 720, c.y + (850 * c.height) / 900, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByText('Đã chọn 4 phần tử', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bỏ nhóm', exact: true }).click();
  album = await saved();
  assert.ok(album.pages[0].elements.slice(0, 4).every((e) => e.groupId === null));
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  album = await saved();
  assert.ok(album.pages[0].elements[0].groupId);
  // Actual MP4 from the saved grouped layout, with the hidden element retained in the snapshot.
  await page.getByRole('button', { name: 'Trang trí', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm trang trí Cúc nhỏ', exact: true }).click();
  album = await saved();
  assert.equal(album.pages[0].elements.at(-1)!.decorationId, 'daisy');
  const nextCounter = counterPreset('calendar');
  nextCounter.x = 360;
  nextCounter.y = 570;
  const {
    id: renderId,
    revision: renderRevision,
    assets: renderAssets,
    createdAt: renderCreated,
    updatedAt: renderUpdated,
    schemaVersion: renderSchema,
    ...renderContent
  } = album;
  const patched = await context.request.patch(base + '/albums/' + id, {
    data: {
      expectedRevision: album.revision,
      content: {
        ...renderContent,
        pages: album.pages.map((p, i) =>
          i === 0 ? { ...p, elements: [...p.elements, nextCounter] } : p,
        ),
      },
    },
  });
  assert.equal(patched.status(), 200);
  album = await patched.json();
  const response = await context.request.post(base + '/albums/' + id + '/exports', {
    data: {
      expectedRevision: album.revision,
      idempotencyKey: crypto.randomUUID(),
      config: {
        seconds: 15,
        pageIds: [album.pages[0].id],
        opening: 'Những điều thương',
        closing: 'Cùng nhau giữ lại ♡',
        musicId: 'none',
      },
    },
  });
  assert.equal(response.status(), 201);
  let job: JobView = await response.json();
  const deadline = Date.now() + 600000;
  while (!['completed', 'failed', 'canceled'].includes(job.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    job = await (await context.request.get(base + '/exports/' + job.id)).json();
  }
  assert.equal(job.status, 'completed', job.error);
  const video = await (await context.request.get(base + '/exports/' + job.id + '/download')).body();
  assert.equal(video.toString('ascii', 4, 8), 'ftyp');
  await writeFile('test-results/layout-recap.mp4', video);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/editor-layout-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'PASS layout: Shift/marquee selection, group drag/resize/undo, alignment, visibility, locking, personal template, reload, actual MP4 (' +
      video.length +
      ' bytes).',
  );
} finally {
  await browser.close();
}
