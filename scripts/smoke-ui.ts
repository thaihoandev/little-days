import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Album } from '../packages/domain/index.js';
const origin = process.env.SMOKE_UI_ORIGIN || 'http://127.0.0.1:5173';
await mkdir('test-results', { recursive: true });
const executablePath =
  process.env.BROWSER_EXECUTABLE ||
  path.resolve(
    'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe',
  );
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Hôm nay của bạn', exact: true })).toBeVisible();
  await expect(page.locator('.calendar-card')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Tạo album', exact: true }).click();
  await page.getByLabel('Tên cuốn sổ').fill('Nhật ký kiểm thử giao diện');
  await page.getByRole('button', { name: 'Tạo cuốn sổ của mình' }).click();
  await expect(page.getByRole('button', { name: 'Tạo video', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trang trí', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm tiêu đề', exact: true }).click();
  await page.getByLabel('Nội dung', { exact: true }).fill('Chúng mình — một ngày thật đẹp!');
  await page.getByLabel('Vị trí X', { exact: true }).fill('100');
  await page.getByLabel('Vị trí Y', { exact: true }).fill('680');
  await page.getByLabel('Chiều rộng', { exact: true }).fill('500');
  await page.getByLabel('Chiều cao', { exact: true }).fill('70');
  await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
    timeout: 15000,
  });
  const getAlbum = async () => {
    const response = await context.request.get(origin + '/api/albums');
    const albums: Album[] = await response.json();
    return albums.find((a) => a.title === 'Nhật ký kiểm thử giao diện')!;
  };
  await page.getByLabel('Chiều cao', { exact: true }).fill('24');
  await expect(page.getByText(/Nội dung có thể bị cắt trong khung/)).toBeVisible();
  await page.getByLabel('Chiều cao', { exact: true }).fill('70');
  await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
    timeout: 15000,
  });
  let album = await getAlbum();
  const text = album.pages[0].elements.find((e) => e.text === 'Chúng mình — một ngày thật đẹp!');
  assert.ok(text);
  assert.equal(text.x, 100);
  assert.equal(text.width, 500);
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.getByLabel('Chiều cao', { exact: true })).not.toHaveValue('70');
  await page.getByRole('button', { name: 'Làm lại', exact: true }).click();
  await expect(page.getByLabel('Chiều cao', { exact: true })).toHaveValue('70');
  await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Ảnh', exact: true }).click();
  await writeFile(
    'test-results/ui-photo.png',
    await sharp({ create: { width: 720, height: 640, channels: 3, background: '#b7c2a1' } })
      .png()
      .toBuffer(),
  );
  await page.locator('input[type=file]').setInputFiles('test-results/ui-photo.png');
  await expect(page.getByRole('button', { name: 'Thêm ui-photo.png' })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Thêm ui-photo.png' }).click();
  await page.getByLabel('Chú thích ảnh').fill('Ảnh tải lên từ giao diện');
  await page.getByLabel('Góc xoay').focus();
  await page.getByLabel('Góc xoay').press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
  await page.reload();
  await expect(page).toHaveURL(/\/albums\/[a-f0-9-]+$/);
  await expect(page.getByRole('button', { name: 'Tạo video', exact: true })).toBeVisible();
  album = await getAlbum();
  assert.ok(
    album.pages[0].elements.some((e) => e.text === 'Ảnh tải lên từ giao diện' && e.rotation === -3),
  );
  await page.getByRole('button', { name: 'Kỉ niệm', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm kỉ niệm', exact: true }).click();
  await page.getByLabel('Tên dấu mốc').fill('Chuyến đi đầu tiên');
  await page.getByLabel('Lời nhắn', { exact: true }).fill('Một ngày để nhớ.');
  await page.getByRole('button', { name: 'Lưu kỉ niệm', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chuyến đi đầu tiên' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Xem album', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Xem album' })).toBeVisible();
  await page.screenshot({ path: 'test-results/viewer-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Đóng album' }).click();
  await page.getByRole('button', { name: 'Tạo video', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kỉ niệm, chuyển động.' })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: '15 giây', exact: true }).click();
  await page.screenshot({ path: 'test-results/video-preview.png', fullPage: true });
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Trang sổ', exact: true }).click();
  await page.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'Mobile editor overflows viewport',
  );
  await page.getByRole('button', { name: 'Về danh sách album' }).click();
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'Mobile dashboard overflows viewport',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS UI: create album, edit Vietnamese text, properties, undo/redo, upload, reload persistence, memory, viewer, video preview, desktop/mobile overflow, no page errors.',
  );
} catch (e) {
  await page.screenshot({ path: 'test-results/ui-failure.png', fullPage: true }).catch(() => {});
  console.error(errors);
  throw e;
} finally {
  await browser.close();
}
