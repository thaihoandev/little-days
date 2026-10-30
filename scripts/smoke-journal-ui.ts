import { chromium, expect, type Locator } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1')
  throw new Error('Use test:journal on a local fixture.');
await mkdir('test-results', { recursive: true });
await writeFile(
  'test-results/journal-photo.png',
  await sharp({ create: { width: 320, height: 230, channels: 3, background: '#c4bea0' } })
    .png()
    .toBuffer(),
);
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
try {
  for (const width of [1440, 390, 320]) {
    const mobile = width < 600,
      device = mobile ? 'mobile-' + width : 'desktop',
      height = width === 320 ? 640 : mobile ? 844 : 1050;
    const context = await browser.newContext({
        viewport: { width, height },
      }),
      page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(origin);
      await expect(
        page.getByRole('heading', { name: 'Hôm nay, mình giữ lại điều gì?' }),
      ).toBeVisible();
      await expect(page.getByRole('region', { name: 'Lịch tháng' })).toBeVisible();
      await page.getByRole('button', { name: 'Thêm dấu mốc', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Thêm dấu mốc', exact: true });
      await expect(form).toBeVisible();
      async function visibleAction(action: Locator) {
        const bounds = await action.boundingBox();
        assert.ok(
          bounds &&
            bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.x + bounds.width <= width + 1 &&
            bounds.y + bounds.height <= height + 1,
          'Form action must remain inside the viewport without scrolling',
        );
        assert.ok(bounds.height >= 40, 'Form action must have a usable touch target');
      }
      await visibleAction(form.getByRole('button', { name: 'Lưu dấu mốc', exact: true }));
      const fields = await form.locator('.journal-form-fields').boundingBox(),
        footer = await form.locator('.journal-form-footer').boundingBox();
      assert.ok(
        fields && footer && fields.y + fields.height <= footer.y + 1,
        'Scrollable fields must not overlap the save action',
      );
      assert.ok(
        await form.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        'Journal form must not scroll horizontally',
      );
      await page.screenshot({ path: 'test-results/journal-form-' + device + '.png' });
      const title = 'Kỉ niệm có ảnh ' + crypto.randomUUID().slice(0, 6);
      await form.getByLabel('Tên dấu mốc', { exact: true }).fill(title);
      await form
        .getByLabel('Lời nhắn / ghi chú', { exact: true })
        .fill('Hôm ấy, chúng mình đã cùng nhau đi qua một ngày thật đẹp.');
      await form.getByLabel('Ảnh dấu mốc').setInputFiles('test-results/journal-photo.png');
      await form.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(form).not.toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.getByRole('img', { name: 'journal-photo.png', exact: true })).toBeVisible();
      const entries = await (await context.request.get(origin + '/api/journal')).json();
      const entry = entries.find((e: { title: string }) => e.title === title);
      assert.ok(entry.assets[0].url.startsWith('/api/journal/'));
      const other = await browser.newContext();
      await other.request.get(origin + '/api/session');
      assert.equal((await other.request.get(origin + entry.assets[0].url)).status(), 404);
      assert.equal(
        (
          await other.request.patch(origin + '/api/journal/' + entry.id, {
            data: {
              expectedRevision: entry.revision,
              content: { title: 'attack', date: entry.date, note: '', kind: 'note', annual: false },
            },
          })
        ).status(),
        404,
      );
      await other.close();
      await page.reload();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Sửa dấu mốc ' + title, exact: true }).click();
      const edit = page.getByRole('dialog', { name: 'Sửa dấu mốc', exact: true });
      await expect(edit).toBeVisible();
      await edit
        .getByLabel('Lời nhắn / ghi chú', { exact: true })
        .fill('Ghi chú đã được cập nhật.');
      await edit.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(edit).not.toBeVisible();
      await expect(page.getByText('Ghi chú đã được cập nhật.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /Ghi chú cho ngày/ }).click();
      const note = page.getByRole('dialog', { name: 'Thêm dấu mốc', exact: true });
      await expect(note.getByLabel('Loại dấu mốc', { exact: true })).toHaveValue('note');
      await note.getByLabel('Tên dấu mốc', { exact: true }).fill('Ghi chú ngày hẹn');
      await note
        .getByLabel('Lời nhắn / ghi chú', { exact: true })
        .fill('Mang theo máy ảnh và một bó hoa nhỏ.');
      await note.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(note).not.toBeVisible();
      await page.screenshot({
        path: 'test-results/journal-home-' + device + '.png',
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Dòng thời gian', exact: true }).click();
      await page.getByLabel('Tìm dấu mốc').fill(title);
      const searchLayout = await page.locator('.journal-search').evaluate((label) => {
        const icon = label.querySelector('svg')!.getBoundingClientRect(),
          input = label.querySelector('input')!.getBoundingClientRect();
        return {
          aligned: Math.abs(icon.y + icon.height / 2 - input.y - input.height / 2) < 2,
          iconRight: icon.right,
          inputLeft: input.left,
          overflow: label.scrollWidth > label.clientWidth + 1,
        };
      });
      assert.ok(
        searchLayout.aligned &&
          searchLayout.iconRight < searchLayout.inputLeft &&
          !searchLayout.overflow,
        'Search icon and input must align in one row without overflow',
      );
      await page
        .locator('.journal-filters')
        .screenshot({ path: 'test-results/journal-search-' + device + '.png' });
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await page.getByLabel('Lọc loại dấu mốc').selectOption('note');
      await expect(page.getByRole('heading', { name: title, exact: true })).not.toBeVisible();
      await page.getByLabel('Lọc loại dấu mốc').selectOption('all');
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await page.screenshot({
        path: 'test-results/journal-timeline-' + device + '.png',
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Lịch của mình', exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await page.screenshot({
        path: 'test-results/journal-calendar-' + device + '.png',
        fullPage: true,
      });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.getByRole('button', { name: 'Hôm nay', exact: true }).first().click();
      await page.getByRole('button', { name: 'Bắt đầu một cuốn sổ', exact: true }).click();
      await visibleAction(page.getByRole('button', { name: 'Tạo cuốn sổ của mình', exact: true }));
      const create = page.getByRole('dialog', { name: 'Bắt đầu một cuốn sổ', exact: true });
      assert.ok(
        await create.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        'Album form must not scroll horizontally',
      );
      await page.screenshot({ path: 'test-results/album-form-' + device + '.png' });
      await page.getByRole('button', { name: 'Bưu thiếp chuyến đi', exact: true }).click();
      await page.getByRole('button', { name: 'Tạo cuốn sổ của mình', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Tạo video', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Tạo video', exact: true }).click();
      await page
        .getByRole('combobox', { name: 'Nhạc nền', exact: true })
        .selectOption('warm-piano');
      await expect(page.getByLabel('Nghe thử Nắng qua ô cửa', { exact: true })).toHaveAttribute(
        'src',
        '/audio/warm-piano.wav',
      );
      await page.getByRole('button', { name: 'Lưu tùy chọn video', exact: true }).click();
      const book = (await (await context.request.get(origin + '/api/albums')).json())[0];
      assert.equal(book.pages[0].title, 'Bưu thiếp chuyến đi');
      assert.equal(
        (
          await (
            await context.request.get(origin + '/api/albums/' + book.id + '/video-settings')
          ).json()
        ).config.musicId,
        'warm-piano',
      );
      await page.getByRole('button', { name: 'Đóng', exact: true }).click();
      await page.getByRole('button', { name: 'Về danh sách album', exact: true }).click();
      page.once('dialog', (d) => d.accept());
      await page.getByRole('button', { name: 'Xóa dấu mốc ' + title, exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).not.toBeVisible();
      assert.equal((await context.request.get(origin + entry.assets[0].url)).status(), 404);
      assert.deepEqual(errors, []);
    } catch (error) {
      await page.screenshot({
        path: 'test-results/journal-failure-' + device + '.png',
        fullPage: true,
      });
      console.error(
        await page.locator('dialog').evaluateAll((elements) =>
          elements.map((e) => ({
            open: e.open,
            label: e.getAttribute('aria-label'),
            fields: e.querySelectorAll('textarea').length,
          })),
        ),
      );
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS journal UI: calendar-first home, milestones/notes/photos, reload/edit/delete, private media, timeline/search, mobile layout, built-in template and music selection.',
  );
} finally {
  await browser.close();
}
