import { chromium, expect, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const origin = process.env.SMOKE_UI_ORIGIN!;
const dataDir = process.env.AUTH_UI_DATA_DIR;
if (
  !origin ||
  new URL(origin).hostname !== '127.0.0.1' ||
  !dataDir ||
  !path.resolve(dataDir).startsWith(path.resolve('test-results') + path.sep)
)
  throw new Error('Use pilot QA with isolated local mail fixtures.');
const token = process.env.REMINDER_CRON_TOKEN!;
assert.equal(token, 'fixture-reminder-cron-token-0123456789abcdef');
const outbox = path.join(dataDir, 'mail');
async function messages(email: string) {
  return (
    await Promise.all(
      (await readdir(outbox))
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => JSON.parse(await readFile(path.join(outbox, f), 'utf8'))),
    )
  ).filter((m) => m.to === email);
}
async function register(context: BrowserContext, email: string) {
  await context.request.get(origin + '/api/session');
  assert.equal(
    (
      await context.request.post(origin + '/api/auth/register', {
        data: { email, password: 'Fixture-password-123!' },
      })
    ).status(),
    201,
  );
  const mail = (await messages(email))[0];
  const verify = new URLSearchParams(new URL(mail.text.match(/http[^\s]+/)[0]).hash.slice(1)).get(
    'token',
  );
  assert.equal(
    (
      await context.request.post(origin + '/api/auth/verify-email', { data: { token: verify } })
    ).status(),
    201,
  );
}
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
const reports: object[] = [];
await mkdir('test-results', { recursive: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1600, height: 1000 },
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      const email = `reminders-${crypto.randomUUID()}@example.test`;
      await register(context, email);
      const prefs = (await (await context.request.get(origin + '/api/reminder-settings')).json())
        .preferences;
      assert.equal(
        (
          await context.request.patch(origin + '/api/reminder-settings', {
            data: {
              expectedRevision: prefs.revision,
              content: { ...prefs, hour: 0, timeZone: 'UTC' },
            },
          })
        ).status(),
        200,
      );
      const today = new Date().toISOString().slice(0, 10),
        title = `Ngày riêng của mình ${mobile}`;
      const response = await context.request.post(origin + '/api/journal', {
        data: {
          title,
          date: today,
          note: 'Lời nhắn không đưa vào email',
          kind: 'anniversary',
          annual: false,
        },
      });
      assert.equal(response.status(), 201);
      await page.goto(origin + '/calendar?date=' + today);
      await page.getByRole('button', { name: 'Tùy chọn ' + title, exact: true }).click();
      await page.getByRole('button', { name: 'Nhắc tôi về ' + title, exact: true }).click();
      const edit = page.getByRole('dialog', { name: 'Nhắc tôi về ngày này', exact: true });
      await edit.getByLabel('Trước 1 ngày', { exact: true }).uncheck();
      await edit.getByLabel('Đúng ngày', { exact: true }).check();
      await edit.getByLabel('Nhận thêm email cho kỉ niệm này', { exact: true }).check();
      await edit.getByRole('button', { name: 'Lưu lời nhắc', exact: true }).click();
      await expect(edit).not.toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Thông báo · 1 chưa đọc', exact: true }),
      ).toBeVisible();
      const cron = () =>
        context.request.post(origin + '/api/reminder-cron', {
          headers: { Authorization: 'Bearer ' + token },
        });
      assert.equal(
        (
          await context.request.post(origin + '/api/reminder-cron', {
            headers: { Authorization: 'Bearer ' + 'x'.repeat(token.length) },
          })
        ).status(),
        401,
      );
      assert.equal((await context.request.post(origin + '/api/reminder-cron')).status(), 401);
      assert.equal((await cron()).status(), 200);
      assert.equal((await messages(email)).length, 1, 'Global email opt-in is required');
      await page.getByRole('button', { name: /^Thông báo/ }).click();
      const center = page.getByRole('dialog', { name: 'Những ngày muốn nhớ', exact: true });
      await center.locator('.notification-item').filter({ hasText: title }).click();
      await expect(center).not.toBeVisible();
      await expect(page).toHaveURL(origin + '/calendar?date=' + today);
      await expect(page.getByRole('button', { name: 'Thông báo', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Thông báo', exact: true }).click();
      await center.getByRole('button', { name: 'Cài đặt', exact: true }).click();
      await center
        .getByLabel('Tôi muốn nhận email cho những lời nhắc đã chọn', { exact: true })
        .check();
      await center.getByRole('button', { name: 'Lưu cách nhắc', exact: true }).click();
      await expect(center).toContainText('Đã lưu cách nhắc của bạn.');
      await center.getByRole('button', { name: 'Đóng lời nhắc', exact: true }).click();
      assert.equal((await cron()).status(), 200);
      assert.equal((await cron()).status(), 200);
      const sent = (await messages(email)).filter((m) =>
        m.subject.includes('Có một ngày bạn muốn nhớ'),
      );
      assert.equal(sent.length, 1);
      assert.ok(!sent[0].text.includes(title));
      await page.goto(origin + '/calendar?date=2026-12-25');
      const plan = page.getByRole('button', { name: 'Lên kế hoạch cho Giáng sinh', exact: true });
      await expect(plan).toBeVisible();
      await expect(page.locator('.calendar-holiday-icons').first()).toBeVisible();
      await page.screenshot({ path: `test-results/holidays-${mobile}.png`, fullPage: true });
      await plan.click();
      const journal = page.getByRole('dialog', { name: 'Thêm dấu mốc', exact: true });
      await expect(journal.getByLabel('Tên dấu mốc', { exact: true })).toHaveValue(
        'Kế hoạch · Giáng sinh',
      );
      await expect(journal.getByLabel('Ngày đáng nhớ', { exact: true })).toHaveValue('2026-12-25');
      await journal.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(journal).not.toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Kế hoạch · Giáng sinh', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: /^Thông báo/ }).click();
      await center.getByRole('button', { name: 'Cài đặt', exact: true }).click();
      await center
        .getByLabel('Hiển thị ngày lễ và dịp kỷ niệm trên lịch', { exact: true })
        .uncheck();
      await center.getByRole('button', { name: 'Lưu cách nhắc', exact: true }).click();
      await expect(center).toContainText('Đã lưu cách nhắc của bạn.');
      await center.getByRole('button', { name: 'Đóng lời nhắc', exact: true }).click();
      await expect(page.locator('.calendar-holiday-icons')).toHaveCount(0);
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Kế hoạch · Giáng sinh', exact: true }),
      ).toBeVisible();
      assert.equal(
        (await (await context.request.get(origin + '/api/session')).json()).showHolidays,
        false,
      );
      await page.getByRole('button', { name: /^Thông báo/ }).click();
      await center.getByRole('button', { name: 'Lời nhắc', exact: true }).click();
      await center.getByRole('button', { name: 'Xóa lời nhắc ' + title, exact: true }).click();
      const confirm = page.getByRole('dialog', { name: 'Xóa lời nhắc?', exact: true });
      await confirm.getByRole('button', { name: 'Xóa lời nhắc', exact: true }).click();
      await expect(confirm).not.toBeVisible();
      await expect(center).toContainText('Bạn chưa lưu lời nhắc nào.');
      await center.getByRole('button', { name: 'Đóng lời nhắc', exact: true }).click();
      assert.equal((await cron()).status(), 200);
      assert.equal((await messages(email)).length, 2);
      const notification = await (await context.request.get(origin + '/api/notifications')).json();
      assert.equal(notification.items.length, 0);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        'No horizontal overflow',
      );
      assert.deepEqual(errors, []);
      reports.push({ mobile, passed: true, duplicateEmails: 0, holidaysPlanPersisted: true });
    } finally {
      await context.close();
    }
  }
  await writeFile('test-results/reminders-holidays-ui.json', JSON.stringify(reports, null, 2));
  console.log(
    'PASS reminder bell, opt-ins, calendar deep links, holiday planning and settings on desktop/mobile; local mail only',
  );
} finally {
  await browser.close();
}
