import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

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
  other = await browser.newContext(),
  page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const email = 'delete-ui-' + crypto.randomUUID() + '@example.test',
  password = 'delete-ui-password-123';
try {
  const user = await (await context.request.get(base + '/session')).json();
  await context.request.post(base + '/auth/register', { data: { email, password } });
  const album = await (
    await context.request.post(base + '/albums', { data: { title: 'Album xóa bằng UI' } })
  ).json();
  const image = await sharp({
    create: { width: 40, height: 40, channels: 3, background: '#b7c2a1' },
  })
    .png()
    .toBuffer();
  await context.request.post(base + '/albums/' + album.id + '/assets', {
    multipart: { file: { name: 'private.png', mimeType: 'image/png', buffer: image } },
  });
  const current = await (await context.request.get(base + '/albums/' + album.id)).json();
  const share = await (await context.request.post(base + '/albums/' + album.id + '/share')).json();
  await other.request.get(base + '/session');
  const otherUser = await (await other.request.get(base + '/session')).json();
  const otherAlbum = await (
    await other.request.post(base + '/albums', { data: { title: 'Album giữ lại' } })
  ).json();
  await context.request.post(base + '/albums/' + album.id + '/exports', {
    data: {
      expectedRevision: current.revision,
      idempotencyKey: crypto.randomUUID(),
      config: {
        seconds: 15,
        pageIds: [current.pages[0].id],
        opening: 'Test',
        closing: 'Done',
        musicId: 'none',
      },
    },
  });
  await page.goto(origin);
  await page.evaluate(
    ({ owner, other }) => {
      localStorage.setItem('scrapbook-draft:' + owner + ':test', 'private draft');
      localStorage.setItem('scrapbook-draft:' + other + ':test', 'other draft');
    },
    { owner: user.id, other: otherUser.id },
  );
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Xóa tài khoản', exact: true }).click();
  const submit = page.getByRole('button', {
    name: 'Xác nhận xóa tài khoản vĩnh viễn',
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await page.getByLabel('Mật khẩu để xóa tài khoản', { exact: true }).fill('wrong-password');
  await page.getByLabel('Nhập XÓA TÀI KHOẢN để xác nhận', { exact: true }).fill('XÓA TÀI KHOẢN');
  await page.getByLabel('Tôi hiểu dữ liệu sẽ bị xóa vĩnh viễn', { exact: true }).check();
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Mật khẩu hiện tại chưa đúng');
  assert.equal((await context.request.get(base + '/albums/' + album.id)).status(), 200);
  await page.getByLabel('Mật khẩu để xóa tài khoản', { exact: true }).fill(password);
  await page.screenshot({ path: 'test-results/delete-account-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/delete-account-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await submit.click();
  await expect(
    page.getByRole('region', { name: 'Trạng thái xóa tài khoản', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở ' + album.title, exact: true })).toHaveCount(0);
  await expect(
    page.getByText('Đã xóa tài khoản và dữ liệu trên ứng dụng', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  assert.equal((await context.request.get(base + '/albums/' + album.id)).status(), 404);
  assert.equal((await context.request.get(base + '/shared/' + share.token)).status(), 404);
  assert.equal((await other.request.get(base + '/albums/' + otherAlbum.id)).status(), 200);
  const drafts = await page.evaluate(
    ({ owner, other }) => ({
      own: localStorage.getItem('scrapbook-draft:' + owner + ':test'),
      other: localStorage.getItem('scrapbook-draft:' + other + ':test'),
    }),
    { owner: user.id, other: otherUser.id },
  );
  assert.equal(drafts.own, null);
  assert.equal(drafts.other, 'other draft');
  await page.reload();
  await expect(
    page.getByText('Đã xóa tài khoản và dữ liệu trên ứng dụng', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Đóng thông báo xóa', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Trạng thái xóa tài khoản', exact: true }),
  ).toHaveCount(0);
  assert.equal(
    (await context.request.post(base + '/auth/login', { data: { email, password } })).status(),
    401,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS deletion UI: explicit confirmation/password, wrong-password protection, logout, durable progress after reload, canceled export, shared link revoked, owned draft cleared, other user preserved, desktop/mobile.',
  );
} catch (error) {
  await page.screenshot({ path: 'test-results/deletion-ui-failure.png', fullPage: true });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
