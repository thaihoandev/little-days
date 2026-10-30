import { chromium, expect, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { JournalEntry } from '../packages/domain/journal.js';

const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1' || !process.env.AUTH_UI_DATA_DIR)
  throw new Error('Use isolated QA runner with local email fixtures');
const outbox = path.join(process.env.AUTH_UI_DATA_DIR, 'mail');
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
async function register(context: BrowserContext, email: string) {
  await context.request.get(origin + '/api/session');
  const r = await context.request.post(origin + '/api/auth/register', {
    data: { email, password: 'Fixture-password-123!' },
  });
  assert.equal(r.status(), 201);
  const messages = await Promise.all(
    (await readdir(outbox))
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => JSON.parse(await readFile(path.join(outbox, f), 'utf8'))),
  );
  const mail = messages.find((m) => m.to === email && m.subject.includes('Xác minh'));
  assert.ok(mail);
  const token = new URLSearchParams(new URL(mail.text.match(/http[^\s]+/)[0]).hash.slice(1)).get(
    'token',
  );
  assert.ok(token);
  assert.equal(
    (await context.request.post(origin + '/api/auth/verify-email', { data: { token } })).status(),
    201,
  );
}
try {
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1600, height: 1100 },
      alice = await browser.newContext({ viewport }),
      bob = await browser.newContext({ viewport }),
      stranger = await browser.newContext();
    const a = await alice.newPage(),
      b = await bob.newPage(),
      errors: string[] = [];
    a.on('pageerror', (e) => errors.push(e.message));
    b.on('pageerror', (e) => errors.push(e.message));
    const suffix = crypto.randomUUID(),
      aliceMail = 'alice-' + suffix + '@example.test',
      bobMail = 'bob-' + suffix + '@example.test';
    try {
      await register(alice, aliceMail);
      await register(bob, bobMail);
      await stranger.request.get(origin + '/api/session');
      const session = await (await alice.request.get(origin + '/api/session')).json();
      let entry: JournalEntry = await (
        await alice.request.post(origin + '/api/journal', {
          data: {
            title: 'Cùng giữ một ngày ' + mobile,
            date: new Date().toISOString().slice(0, 10),
            note: 'Câu chuyện do hai người cùng viết',
            kind: 'memory',
            annual: false,
          },
        })
      ).json();
      const image = await sharp({
        create: { width: 100, height: 80, channels: 3, background: '#c4927b' },
      })
        .png()
        .toBuffer();
      entry = await (
        await alice.request.post(origin + '/api/journal/' + entry.id + '/assets', {
          multipart: { file: { name: 'anh-chung.png', mimeType: 'image/png', buffer: image } },
        })
      ).json();
      await a.route('**/api/timeline-sharing', (route) =>
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Legacy API fixture' }),
        }),
      );
      await a.goto(origin + '/today');
      await expect(a.getByRole('heading', { name: entry.title, exact: true })).toBeVisible();
      await expect(
        a.getByRole('button', { name: 'Chia sẻ dòng thời gian', exact: true }),
      ).toBeDisabled();
      await a.unroute('**/api/timeline-sharing');
      await a.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(
        a.getByRole('button', { name: 'Chia sẻ dòng thời gian', exact: true }),
      ).toBeEnabled();
      await a.goto(origin + '/timeline');
      await expect(a.getByRole('heading', { name: entry.title, exact: true })).toBeVisible();
      await a.getByRole('button', { name: 'Chia sẻ dòng thời gian', exact: true }).click();
      const ad = a.getByRole('dialog', { name: 'Chia sẻ dòng thời gian', exact: true });
      await ad.getByLabel('Email người cùng xây dựng').fill(bobMail);
      await ad.getByRole('button', { name: 'Mời cùng chỉnh sửa', exact: true }).click();
      await expect(ad.getByText('Đang chờ chấp nhận', { exact: true })).toBeVisible();
      assert.equal((await bob.request.get(origin + '/api/journal')).ok(), true);
      assert.equal((await (await bob.request.get(origin + '/api/journal')).json()).length, 0);
      assert.equal((await bob.request.get(origin + entry.assets[0].url)).status(), 404);
      await b.goto(origin + '/today');
      await b.getByRole('button', { name: 'Chia sẻ dòng thời gian', exact: false }).first().click();
      const bd = b.getByRole('dialog', { name: 'Chia sẻ dòng thời gian', exact: true });
      await bd.getByRole('button', { name: 'Chấp nhận lời mời ' + aliceMail, exact: true }).click();
      await expect(bd.getByLabel('Hiện trên lịch của tôi', { exact: true })).toBeChecked();
      await b.screenshot({ path: 'test-results/timeline-sharing-' + mobile + '.png' });
      await bd.getByRole('button', { name: 'Xong', exact: true }).click();
      await expect(b.getByRole('heading', { name: entry.title, exact: true })).toBeVisible();
      assert.equal((await bob.request.get(origin + entry.assets[0].url)).status(), 200);
      assert.equal((await stranger.request.get(origin + entry.assets[0].url)).status(), 404);
      await b.getByRole('button', { name: 'Dòng thời gian', exact: true }).click();
      await expect(b).toHaveURL(origin + '/timeline');
      await b.getByLabel('Chọn dòng thời gian', { exact: true }).selectOption(session.id);
      await b.getByRole('button', { name: 'Sửa dấu mốc ' + entry.title, exact: true }).click();
      const edit = b.getByRole('dialog', { name: 'Sửa dấu mốc', exact: true });
      await edit
        .getByLabel('Lời nhắn / ghi chú', { exact: true })
        .fill('Người được mời đã chỉnh sửa');
      await edit.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(edit).not.toBeVisible();
      assert.equal(
        (await (await alice.request.get(origin + '/api/journal')).json())[0].note,
        'Người được mời đã chỉnh sửa',
      );
      await b.getByRole('button', { name: 'Thêm dấu mốc', exact: true }).click();
      const create = b.getByRole('dialog', { name: 'Thêm dấu mốc', exact: true });
      await expect(create.getByLabel('Lưu vào dòng thời gian', { exact: true })).toHaveValue(
        session.id,
      );
      await create.getByLabel('Tên dấu mốc', { exact: true }).fill('Một ghi chú chung ' + mobile);
      await create.getByLabel('Loại dấu mốc', { exact: true }).selectOption('note');
      await create
        .getByLabel('Lời nhắn / ghi chú', { exact: true })
        .fill('Ghi chú xuất hiện ở bên phải lịch');
      await create.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(create).not.toBeVisible();
      await b.getByRole('button', { name: 'Lịch của mình', exact: true }).click();
      await expect(b).toHaveURL(origin + '/calendar');
      await b.getByRole('button', { name: /^Ghi chú cho ngày / }).click();
      const privateNote = b.getByRole('dialog', { name: 'Thêm dấu mốc', exact: true });
      const bobSession = await (await bob.request.get(origin + '/api/session')).json();
      await expect(privateNote.getByLabel('Lưu vào dòng thời gian', { exact: true })).toHaveValue(
        bobSession.id,
      );
      await privateNote.getByRole('button', { name: 'Đóng dấu mốc', exact: true }).click();
      await expect(
        b
          .getByRole('region', { name: 'Ghi chú ngày đang chọn', exact: true })
          .getByText('Một ghi chú chung ' + mobile, { exact: true }),
      ).toBeVisible();
      if (!mobile) {
        const bounds = await b.locator('.journal-overview').evaluate((e) => {
          const [calendar, aside] = Array.from(e.children).map((c) => c.getBoundingClientRect());
          return calendar.width / aside.width;
        });
        assert.ok(bounds > 2.9 && bounds < 3.1, 'Calendar must occupy three of four columns');
      }
      await b.screenshot({
        path: 'test-results/shared-calendar-' + mobile + '.png',
        fullPage: true,
      });
      await b.getByRole('button', { name: 'Chia sẻ dòng thời gian', exact: true }).click();
      await bd.getByLabel('Hiện trên lịch của tôi', { exact: true }).uncheck();
      await expect(bd.getByLabel('Hiện trên lịch của tôi', { exact: true })).not.toBeChecked();
      await bd.getByRole('button', { name: 'Xong', exact: true }).click();
      await expect(b.getByRole('heading', { name: entry.title, exact: true })).toHaveCount(0);
      await b.getByRole('button', { name: 'Dòng thời gian', exact: true }).click();
      await expect(b.getByRole('heading', { name: entry.title, exact: true })).toBeVisible();
      await b.reload();
      await expect(b).toHaveURL(origin + '/timeline');
      await expect(b.getByRole('heading', { name: entry.title, exact: true })).toBeVisible();
      await b.getByRole('button', { name: 'Lịch của mình', exact: true }).click();
      await b.goBack();
      await expect(b).toHaveURL(origin + '/timeline');
      await b.goForward();
      await expect(b).toHaveURL(origin + '/calendar');
      await ad.getByRole('button', { name: 'Tải lại lời mời', exact: true }).click();
      await expect(ad.getByText('Có thể chỉnh sửa', { exact: true })).toBeVisible();
      await ad.getByRole('button', { name: 'Thu hồi quyền ' + bobMail, exact: true }).click();
      await a
        .getByRole('dialog', { name: 'Thu hồi quyền truy cập?', exact: true })
        .getByRole('button', { name: 'Xác nhận', exact: true })
        .click();
      await expect(
        ad.getByText('Dòng thời gian này hiện chỉ mình bạn xem và chỉnh sửa.', { exact: true }),
      ).toBeVisible();
      assert.equal((await bob.request.get(origin + entry.assets[0].url)).status(), 404);
      assert.equal((await (await bob.request.get(origin + '/api/journal')).json()).length, 0);
      await b.reload();
      await expect(b.getByRole('heading', { name: entry.title, exact: true })).toHaveCount(0);
      await ad.getByRole('button', { name: 'Xong', exact: true }).click();
      let album = await (
        await alice.request.post(origin + '/api/albums', {
          data: { title: 'Album đường dẫn ' + mobile, templateId: 'minimal' },
        })
      ).json();
      await a.goto(origin + '/albums');
      await a.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
      await expect(a).toHaveURL(origin + '/albums/' + album.id);
      await expect(a.locator('.canvas-sheet canvas')).toBeVisible();
      await a.goBack();
      await expect(a).toHaveURL(origin + '/albums');
      const newestTitle = 'Bản mới nhất từ máy chủ ' + mobile;
      const patched = await alice.request.patch(origin + '/api/albums/' + album.id, {
        data: { expectedRevision: album.revision, content: { ...album, title: newestTitle } },
      });
      assert.equal(patched.status(), 200);
      album = await patched.json();
      await a.goForward();
      await expect(a.getByRole('button', { name: 'Đổi tên sổ', exact: true })).toContainText(
        newestTitle,
      );
      await a.reload();
      await expect(a.getByRole('button', { name: 'Đổi tên sổ', exact: true })).toContainText(
        newestTitle,
      );
      await b.goto(origin + '/albums/' + album.id);
      await expect(b.locator('.error-banner').first()).toContainText('Không tìm thấy album');
      await expect(b.locator('.canvas-sheet canvas')).toHaveCount(0);
      await a.goto(origin + '/today');
      await a.screenshot({ path: 'test-results/today-focus-' + mobile + '.png', fullPage: true });
      assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.ok(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
    } catch (error) {
      await a.screenshot({
        path: 'test-results/timeline-sharing-owner-failure.png',
        fullPage: true,
      });
      await b.screenshot({
        path: 'test-results/timeline-sharing-member-failure.png',
        fullPage: true,
      });
      throw error;
    } finally {
      await alice.close();
      await bob.close();
      await stranger.close();
    }
  }
  console.log(
    'PASS timeline collaboration: verified named invitation/consent, shared editing and notes, private photos/revocation, calendar preference, 3:1 layout, direct routes/reload/back/forward, focused today and mobile.',
  );
} finally {
  await browser.close();
}
