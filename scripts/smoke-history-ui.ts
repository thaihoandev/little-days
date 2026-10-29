import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { type Album, type AlbumVersions } from '../packages/domain/index.js';

await mkdir('test-results', { recursive: true });
const origin = process.env.SMOKE_UI_ORIGIN || 'http://127.0.0.1:5173',
  base = origin + '/api';
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    path.resolve(
      'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe',
    ),
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await context.request.get(base + '/session');
  const album: Album = await (
    await context.request.post(base + '/albums', {
      data: { title: 'Lịch sử kiểm thử ' + Date.now() },
    })
  ).json();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
  await page.getByRole('button', { name: 'Lịch sử phiên bản', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Lịch sử phiên bản', exact: true })).toBeVisible();
  await page.getByLabel('Tên mốc lưu').fill('Trước khi viết lời nhắn');
  await page.getByRole('button', { name: 'Lưu mốc hiện tại', exact: true }).click();
  await expect(page.getByRole('button', { name: /Bản 0 · Trước khi viết lời nhắn/ })).toBeVisible();
  await page.getByRole('button', { name: 'Đóng lịch sử', exact: true }).click();
  await page.getByLabel('Tên trang', { exact: true }).fill('Trang đã sửa nhầm');
  await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
  await page.getByRole('button', { name: 'Lịch sử phiên bản', exact: true }).click();
  await page.getByRole('button', { name: /Bản 0 · Trước khi viết lời nhắn/ }).click();
  await expect(page.getByRole('button', { name: 'Khôi phục bản 0', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'test-results/history-desktop.png', fullPage: true });
  const before: Album = await (await context.request.get(base + '/albums/' + album.id)).json();
  await page.getByRole('button', { name: 'Khôi phục bản 0', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận khôi phục', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Lịch sử phiên bản', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Tên trang', { exact: true })).toHaveValue(album.pages[0].title);
  await expect(page.getByRole('button', { name: 'Hoàn tác', exact: true })).toBeDisabled();
  const restored: Album = await (await context.request.get(base + '/albums/' + album.id)).json();
  assert.equal(restored.revision, before.revision + 1);
  const versions: AlbumVersions = await (
    await context.request.get(base + '/albums/' + album.id + '/versions')
  ).json();
  assert.ok(versions.versions.some((version) => version.revision === before.revision));
  await page.getByRole('button', { name: 'Lịch sử phiên bản', exact: true }).click();
  await page.getByRole('button', { name: new RegExp('Bản ' + before.revision + ' ·') }).click();
  await page.getByRole('button', { name: 'Khôi phục bản ' + before.revision, exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận khôi phục', exact: true }).click();
  await expect(page.getByLabel('Tên trang', { exact: true })).toHaveValue('Trang đã sửa nhầm');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Lịch sử phiên bản', exact: true }).click();
  await page.getByRole('button', { name: /Bản 0 · Trước khi viết lời nhắn/ }).click();
  await expect(page.getByRole('button', { name: 'Khôi phục bản 0', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'test-results/history-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  // A save from another session must prevent overwriting that newer version.
  const latest: Album = await (await context.request.get(base + '/albums/' + album.id)).json();
  const { id, revision, assets, createdAt, updatedAt, schemaVersion, ...content } = latest;
  assert.equal(
    (
      await context.request.patch(base + '/albums/' + id, {
        data: { expectedRevision: revision, content: { ...content, title: 'Phiên khác mới sửa' } },
      })
    ).status(),
    200,
  );
  await page.getByRole('button', { name: 'Khôi phục bản 0', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận khôi phục', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Lịch sử phiên bản', exact: true })
      .getByRole('alert')
      .filter({ hasText: 'phiên khác' }),
  ).toBeVisible();
  assert.equal(
    (await (await context.request.get(base + '/albums/' + album.id)).json()).title,
    'Phiên khác mới sửa',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS history UI: named checkpoint, reload, preview, restore/revert, clean undo state, mobile, stale-revision protection.',
  );
} catch (error) {
  await page.screenshot({ path: 'test-results/history-ui-failure.png', fullPage: true });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
