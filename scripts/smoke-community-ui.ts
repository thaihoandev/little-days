import { chromium, expect, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1' || !process.env.AUTH_UI_DATA_DIR)
  throw new Error('Isolated fixture only');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
await mkdir('test-results', { recursive: true });
const photo = await sharp('apps/web/public/illustrations/demo-2.svg')
  .resize(700, 500)
  .png()
  .toBuffer();
async function register(context: BrowserContext, email: string) {
  await context.request.get(origin + '/api/session');
  assert.equal(
    (
      await context.request.post(origin + '/api/auth/register', {
        data: { email, password: 'Community-password-123!' },
      })
    ).status(),
    201,
  );
  const files = await readdir(path.join(process.env.AUTH_UI_DATA_DIR!, 'mail'));
  const rows = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) =>
        JSON.parse(await readFile(path.join(process.env.AUTH_UI_DATA_DIR!, 'mail', f), 'utf8')),
      ),
  );
  const mail = rows.find((m) => m.to === email),
    token = new URLSearchParams(new URL(mail.text.match(/http[^\s]+/)[0]).hash.slice(1)).get(
      'token',
    );
  assert.equal(
    (await context.request.post(origin + '/api/auth/verify-email', { data: { token } })).status(),
    201,
  );
}
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1500, height: 1000 },
        acceptDownloads: true,
      }),
      other = await browser.newContext(),
      page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: photo }),
    );
    try {
      const email = 'memory-' + crypto.randomUUID() + '@example.test',
        otherEmail = 'friend-' + crypto.randomUUID() + '@example.test';
      await register(context, email);
      await register(other, otherEmail);
      await context.request.patch(origin + '/api/profile', {
        data: { displayName: 'Minh An', expectedRevision: -1 },
      });
      await other.request.patch(origin + '/api/profile', {
        data: { displayName: 'Người thương', expectedRevision: -1 },
      });
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const past = String(Number(today.slice(0, 4)) - 2) + today.slice(4),
        title = 'Buổi hẹn đáng nhớ ' + mobile;
      let album = await (
        await context.request.post(origin + '/api/albums', {
          data: { title: 'Những ngày dịu dàng', startDate: today, templateId: 'minimal' },
        })
      ).json();
      for (const name of ['private-file-one.png', 'private-file-two.png'])
        album = await (
          await context.request.post(origin + '/api/albums/' + album.id + '/assets', {
            multipart: { file: { name, mimeType: 'image/png', buffer: photo } },
          })
        ).json();
      const base = { title, date: today, note: 'Lời nhắn ban đầu', kind: 'memory', annual: false };
      let entry = await (
        await context.request.post(origin + '/api/journal', { data: base })
      ).json();
      entry = await (
        await context.request.post(origin + '/api/journal/' + entry.id + '/assets', {
          multipart: {
            file: { name: 'private-journal.png', mimeType: 'image/png', buffer: photo },
          },
        })
      ).json();
      await context.request.post(origin + '/api/journal', {
        data: { ...base, title: 'Ngày mình cùng đi xa', date: past },
      });
      const grant = await (
        await context.request.post(origin + '/api/timeline-sharing', {
          data: { email: otherEmail },
        })
      ).json();
      await other.request.patch(origin + '/api/timeline-sharing/' + grant.id, {
        data: { expectedRevision: 0, action: 'accept' },
      });
      await other.request.patch(origin + '/api/journal/' + entry.id, {
        data: {
          expectedRevision: entry.revision,
          content: { ...base, note: 'Lời nhắn từ người thương' },
        },
      });
      await page.goto(origin + '/today');
      const flashback = page.getByRole('region', { name: 'Ngày này năm trước', exact: true });
      await expect(flashback).toContainText('Ngày mình cùng đi xa');
      await expect(flashback).toContainText('2 năm trước');
      await page.goto(origin + '/timeline');
      await page.getByRole('button', { name: 'Lời nhắn và cảm xúc ' + title, exact: true }).click();
      const details = page.getByRole('dialog', { name: 'Câu chuyện dấu mốc', exact: true });
      await details.getByRole('button', { name: 'Cảm xúc heart', exact: true }).click();
      await expect(
        details.getByRole('button', { name: 'Cảm xúc heart', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await details.getByLabel('Viết bình luận', { exact: true }).fill('Mình vẫn nhớ hôm ấy.');
      await details.getByRole('button', { name: 'Gửi lời nhắn', exact: true }).click();
      await expect(details).toContainText('Mình vẫn nhớ hôm ấy.');
      await other.request.post(origin + '/api/journal/' + entry.id + '/comments', {
        data: { text: 'Mình cũng vậy!', requestId: crypto.randomUUID() },
      });
      await details.getByRole('button', { name: 'Đóng câu chuyện', exact: true }).click();
      await page.getByRole('button', { name: 'Lời nhắn và cảm xúc ' + title, exact: true }).click();
      await expect(details).toContainText('Mình cũng vậy!');
      await page.screenshot({ path: 'test-results/community-social-' + mobile + '.png' });
      await details.getByRole('button', { name: 'Đóng câu chuyện', exact: true }).click();
      await page.getByRole('button', { name: 'Lịch sử dấu mốc ' + title, exact: true }).click();
      await details.getByRole('button', { name: 'Xem phiên bản #1', exact: true }).click();
      await expect(
        details.getByRole('region', { name: 'Xem trước phiên bản dấu mốc', exact: true }),
      ).toContainText('Lời nhắn ban đầu');
      await expect(details.locator('.version-photos img')).toBeVisible();
      await details.getByRole('button', { name: 'Khôi phục phiên bản #1', exact: true }).click();
      await expect(details).not.toBeVisible();
      await expect(
        page
          .getByRole('region', { name: 'Kỉ niệm ngày ' + today, exact: true })
          .getByText('Lời nhắn ban đầu', { exact: true }),
      ).toBeVisible();
      await page.goto(origin + '/photos');
      const library = page.getByRole('region', { name: 'Thư viện ảnh kỉ niệm', exact: true });
      await expect(library.locator('.memory-photo-tile')).toHaveCount(3);
      await expect(library).not.toContainText('private-file');
      await expect(library).not.toContainText('private-journal');
      await library.getByLabel('Lọc nguồn ảnh', { exact: true }).selectOption('milestone');
      await expect(library.locator('.memory-photo-tile')).toHaveCount(1);
      await library.locator('.memory-photo-open').first().click();
      const lightbox = page.getByRole('dialog', { name: 'Xem ảnh kỉ niệm', exact: true });
      await expect(lightbox).not.toContainText('private-journal');
      const downloadEvent = page.waitForEvent('download');
      await lightbox.getByRole('button', { name: 'Tải ảnh xuống', exact: true }).click();
      const download = await downloadEvent;
      assert.match(download.suggestedFilename(), /^little-days-.*\.jpg$/);
      const downloaded = await readFile((await download.path())!),
        expected = await (await context.request.get(origin + entry.assets[0].url)).body();
      assert.equal(
        createHash('sha256').update(downloaded).digest('hex'),
        createHash('sha256').update(expected).digest('hex'),
      );
      await lightbox.getByRole('button', { name: 'Đóng ảnh', exact: true }).click();
      await library.getByLabel('Lọc nguồn ảnh', { exact: true }).selectOption('all');
      await expect
        .poll(() =>
          library
            .locator('.memory-photo-open img')
            .evaluateAll((images) =>
              images.every(
                (img) =>
                  (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
              ),
            ),
        )
        .toBe(true);
      await page.screenshot({
        path: 'test-results/community-photo-library-' + mobile + '.png',
        fullPage: true,
      });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.goto(origin + '/timeline');
      await page.getByRole('button', { name: 'Xóa dấu mốc ' + title, exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Xóa dấu mốc?', exact: true })
        .getByRole('button', { name: 'Xóa dấu mốc', exact: true })
        .click();
      await expect(page.getByRole('heading', { name: title, exact: true })).not.toBeVisible();
      await page.getByRole('button', { name: 'Mở thùng rác dấu mốc', exact: true }).click();
      const trash = page.getByRole('dialog', { name: 'Thùng rác dấu mốc', exact: true });
      await expect(trash).toContainText(title);
      await expect(trash.locator('.journal-trash-list img')).toBeVisible();
      await page.screenshot({ path: 'test-results/community-trash-' + mobile + '.png' });
      await trash.getByRole('button', { name: 'Lấy lại dấu mốc ' + title, exact: true }).click();
      await expect(trash).not.toContainText(title);
      await trash.getByRole('button', { name: 'Đóng thùng rác', exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Xóa dấu mốc ' + title, exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Xóa dấu mốc?', exact: true })
        .getByRole('button', { name: 'Xóa dấu mốc', exact: true })
        .click();
      await page.getByRole('button', { name: 'Mở thùng rác dấu mốc', exact: true }).click();
      await trash.getByRole('button', { name: 'Xóa vĩnh viễn ' + title, exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Xóa vĩnh viễn dấu mốc?', exact: true })
        .getByRole('button', { name: 'Xóa vĩnh viễn', exact: true })
        .click();
      await expect(trash).not.toContainText(title);
      assert.equal(
        (await other.request.get(origin + '/api/journal/' + entry.id + '/social')).status(),
        404,
      );
      assert.deepEqual(errors, []);
    } catch (e) {
      await page.screenshot({
        path: 'test-results/community-failure-' + mobile + '.png',
        fullPage: true,
      });
      throw e;
    } finally {
      await context.close();
      await other.close();
    }
  }
  console.log(
    'PASS community: on-this-day, shared comments/reactions, historical content/photos restoration, soft-delete/restore/permanent purge, private photo library without filenames and exact-byte download on desktop/mobile.',
  );
} finally {
  await browser.close();
}
