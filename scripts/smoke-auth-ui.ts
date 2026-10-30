import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

await mkdir('test-results', { recursive: true });
const origin = process.env.SMOKE_UI_ORIGIN || 'http://127.0.0.1:5173',
  base = origin + '/api';
const outbox = path.resolve(process.env.AUTH_UI_DATA_DIR || 'test-results/auth-ui-data', 'mail');
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    path.resolve(
      'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe',
    ),
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  page = await context.newPage(),
  other = await browser.newContext();
const errors: string[] = [];
context.on('page', (newPage) => newPage.on('pageerror', (error) => errors.push(error.message)));
page.on('pageerror', (error) => errors.push(error.message));
const email = 'ui-' + crypto.randomUUID() + '@example.test',
  original = 'original-password-123',
  changed = 'changed-password-123',
  replacement = 'replacement-password-123';
async function linkFor(subject: string) {
  const messages = await Promise.all(
    (await readdir(outbox))
      .filter((file) => file.endsWith('.json'))
      .map(
        async (file) =>
          JSON.parse(await readFile(path.join(outbox, file), 'utf8')) as {
            to: string;
            subject: string;
            text: string;
            createdAt: string;
          },
      ),
  );
  const mail = messages
    .filter((message) => message.to === email && message.subject.includes(subject))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  assert.ok(mail);
  return mail.text.match(/http[^\s]+/)![0];
}
try {
  await context.request.get(base + '/session');
  const album = await (
    await context.request.post(base + '/albums', {
      data: { title: 'Album tài khoản ' + Date.now() },
    })
  ).json();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(original);
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByText('Tài khoản cá nhân', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  await expect(page.getByText('Email chưa xác minh', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Gửi lại email xác minh', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Tài khoản của bạn', exact: true })
      .getByRole('status')
      .filter({ hasText: 'Kiểm tra email' }),
  ).toBeVisible();
  const verifyPage = await context.newPage();
  await verifyPage.goto(await linkFor('Xác minh'));
  await expect(
    verifyPage.getByRole('heading', { name: 'Xác minh email', exact: true }),
  ).toBeVisible();
  await expect.poll(() => new URL(verifyPage.url()).hash).toBe('');
  await verifyPage.getByRole('button', { name: 'Xác minh email', exact: true }).click();
  await expect(verifyPage.getByText('Email đã được xác minh.', { exact: true })).toBeVisible();
  await verifyPage.getByRole('button', { name: 'Tiếp tục tới tài khoản', exact: true }).click();
  await expect(verifyPage.getByText('Email đã xác minh', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  assert.equal(
    (
      await other.request.post(base + '/auth/login', { data: { email, password: original } })
    ).status(),
    201,
  );
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(original);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(changed);
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill('mismatch-password');
  await page.getByRole('button', { name: 'Lưu mật khẩu mới', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('chưa khớp');
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(changed);
  await page.getByRole('button', { name: 'Lưu mật khẩu mới', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Tài khoản của bạn', exact: true })
      .getByRole('status')
      .filter({ hasText: 'Đã đổi mật khẩu' }),
  ).toBeVisible();
  assert.equal((await other.request.get(base + '/albums')).status(), 401);
  await page.screenshot({ path: 'test-results/account-security-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByText('Tài khoản cá nhân', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).first().click();
  await page.getByRole('button', { name: 'Quên mật khẩu?', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Gửi link đặt lại mật khẩu', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText(
    'Nếu email đã được đăng ký',
  );
  assert.equal(
    (
      await other.request.post(base + '/auth/login', { data: { email, password: changed } })
    ).status(),
    201,
  );
  const resetLink = await linkFor('Đặt lại'),
    resetPage = await context.newPage();
  await resetPage.setViewportSize({ width: 390, height: 844 });
  await resetPage.goto(resetLink);
  await expect(
    resetPage.getByRole('heading', { name: 'Đặt lại mật khẩu', exact: true }),
  ).toBeVisible();
  await expect.poll(() => new URL(resetPage.url()).hash).toBe('');
  await resetPage.getByLabel('Mật khẩu mới', { exact: true }).fill(replacement);
  await resetPage.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(replacement);
  await resetPage.screenshot({ path: 'test-results/password-reset-mobile.png', fullPage: true });
  assert.ok(
    await resetPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  );
  await resetPage.getByRole('button', { name: 'Lưu mật khẩu mới', exact: true }).click();
  await expect(resetPage.getByRole('status')).toContainText('Đã đặt lại mật khẩu');
  assert.equal((await other.request.get(base + '/albums')).status(), 401);
  await resetPage.getByRole('button', { name: 'Tiếp tục tới tài khoản', exact: true }).click();
  await resetPage.getByLabel('Email', { exact: true }).fill(email);
  await resetPage.getByLabel('Mật khẩu', { exact: true }).fill(replacement);
  await resetPage.getByRole('button', { name: 'Đăng nhập', exact: true }).last().click();
  await expect(
    resetPage.getByRole('button', { name: 'Mở ' + album.title, exact: true }),
  ).toBeVisible();
  const replay = await context.newPage();
  await replay.goto(resetLink);
  await replay.getByLabel('Mật khẩu mới', { exact: true }).fill('replay-password-123');
  await replay.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill('replay-password-123');
  await replay.getByRole('button', { name: 'Lưu mật khẩu mới', exact: true }).click();
  await expect(replay.getByRole('alert')).toContainText('đã được sử dụng');
  assert.deepEqual(errors, []);
  console.log(
    'PASS auth UI: guest register/ownership, resend/verify email, change password, forgot/reset, old-session revocation, replay rejection and mobile layout; tokens removed from URL.',
  );
} catch (error) {
  await page.screenshot({ path: 'test-results/auth-ui-failure.png', fullPage: true });
  console.error(errors);
  throw error;
} finally {
  await other.close();
  await browser.close();
}
