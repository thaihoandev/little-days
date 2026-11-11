import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1' || !process.env.AUTH_UI_DATA_DIR)
  throw Error('Isolated QA only');
await mkdir('test-results/moment-composer', { recursive: true });
const bytes = Buffer.alloc(800 * 600 * 3);
let seed = 17;
for (let i = 0; i < bytes.length; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  bytes[i] = seed >>> 24;
}
const photo = await sharp(bytes, { raw: { width: 800, height: 600, channels: 3 } })
  .png()
  .toBuffer();
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
const reports: object[] = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 320 ? 640 : 900 },
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const decode = window.createImageBitmap.bind(window);
      (window as any).__momentDecodes = 0;
      window.createImageBitmap = ((source: any, ...args: any[]) => {
        if (source instanceof File && source.name.startsWith('moment-'))
          (window as any).__momentDecodes++;
        return (decode as any)(source, ...args);
      }) as typeof createImageBitmap;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let uploads = 0,
      creates = 0,
      feedReads = 0,
      recording = false;
    let rejectPhoto = false;
    page.on('request', (r) => {
      const path = new URL(r.url()).pathname;
      if (recording && r.method() === 'GET' && path === '/api/library/feed') feedReads++;
      if (recording && r.method() === 'POST' && path === '/api/journal') creates++;
    });
    await page.route('**/api/journal/*/assets', async (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      if (rejectPhoto && r.request().postDataBuffer()?.includes(Buffer.from('moment-retry-b.png')))
        return r.fulfill({ status: 413, json: { message: 'Fixture: ảnh thứ hai chưa thể lưu.' } });
      const result = await r.fetch();
      uploads++;
      await gate;
      await r.fulfill({ response: result });
    });
    try {
      await page.goto(origin + '/today');
      const add = page.getByRole('button', { name: 'Thêm dấu mốc', exact: true });
      await expect(add).toBeVisible();
      await add.click();
      const form = page.getByRole('dialog', { name: 'Thêm dấu mốc', exact: true });
      await expect(form).toBeVisible();
      await expect(form.locator('.leaflet-container')).toHaveCount(0);
      await expect(form.getByLabel('Tên địa điểm', { exact: true })).toHaveCount(0);
      await form.getByLabel('Tên dấu mốc', { exact: true }).fill('Một chiều thật vui');
      const note = form.getByLabel('Lời nhắn / ghi chú', { exact: true });
      await note.fill('Mình cùng giữ một ngày đẹp.');
      await note.evaluate((node: HTMLTextAreaElement) => {
        node.focus();
        node.setSelectionRange(5, 5);
      });
      await page.keyboard.insertText('thương ');
      await expect(note).toHaveValue('Mình thương cùng giữ một ngày đẹp.');
      const picker = form.getByLabel('Ảnh dấu mốc', { exact: true });
      await picker.setInputFiles({
        name: 'broken.png',
        mimeType: 'image/png',
        buffer: Buffer.from('Fixture: not an image'),
      });
      await expect(form.getByText('Chưa xem được ảnh', { exact: true })).toBeVisible();
      await form.getByRole('button', { name: 'Bỏ ảnh đã chọn 1', exact: true }).click();
      for (const name of ['moment-a.png', 'moment-b.png'])
        await picker.setInputFiles({ name, mimeType: 'image/png', buffer: photo });
      await expect(form.getByRole('img', { name: 'Ảnh đã chọn 2', exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => (window as any).__momentDecodes), 2);
      await form.getByRole('button', { name: 'Đóng dấu mốc', exact: true }).click();
      const confirm = page.getByRole('dialog', { name: 'Rời dấu mốc đang viết?', exact: true });
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: 'Giữ lại', exact: true }).click();
      await expect(note).toHaveValue('Mình thương cùng giữ một ngày đẹp.');
      const save = form.getByRole('button', { name: 'Lưu dấu mốc', exact: true });
      const box = await save.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= (width === 320 ? 640 : 900));
      assert.ok(await form.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
      await page.screenshot({ path: `test-results/moment-composer/form-${width}.png` });
      recording = true;
      await save.click();
      await expect.poll(() => uploads).toBe(2);
      assert.equal(feedReads, 0, 'No feed reload while the photos are still being saved');
      assert.equal(creates, 1);
      assert.equal(
        await page.evaluate(() => (window as any).__momentDecodes),
        2,
        'Upload reuses the prepared preview instead of decoding again',
      );
      release();
      await expect(form).not.toBeVisible();
      const all = await (await context.request.get(origin + '/api/journal')).json();
      const entry = all.find((e: any) => e.title === 'Một chiều thật vui');
      assert.ok(entry && entry.assets.length === 2 && entry.assets[0].id !== entry.assets[1].id);
      reports.push({
        width,
        preparedDecodes: 2,
        metadataCreates: creates,
        uploads,
        feedReadsDuringUpload: 0,
        lazyMapBeforeOpen: true,
      });
      recording = false;
      await page
        .getByRole('button', { name: 'Sửa dấu mốc Một chiều thật vui', exact: true })
        .click();
      const edit = page.getByRole('dialog', { name: 'Sửa dấu mốc', exact: true });
      await edit.getByLabel('Lời nhắn / ghi chú', { exact: true }).fill('Ghi chú chưa lưu');
      const deletion = '**/api/journal/*/assets/*';
      await page.route(deletion, (r) =>
        r.request().method() === 'DELETE'
          ? r.fulfill({ status: 409, json: { message: 'Fixture: revision vừa thay đổi' } })
          : r.continue(),
      );
      await edit
        .getByRole('button', { name: 'Xóa ảnh ' + entry.assets[0].name, exact: true })
        .click();
      const deleteDialog = page.getByRole('dialog', { name: 'Xóa ảnh khỏi dấu mốc?', exact: true });
      await deleteDialog.getByRole('button', { name: 'Xóa ảnh', exact: true }).click();
      await expect(deleteDialog).not.toBeVisible();
      await expect(edit.getByRole('alert')).toContainText('revision vừa thay đổi');
      await expect(edit.getByLabel('Lời nhắn / ghi chú', { exact: true })).toHaveValue(
        'Ghi chú chưa lưu',
      );
      await page.unroute(deletion);
      await edit.getByRole('button', { name: 'Đóng dấu mốc', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Rời dấu mốc đang viết?', exact: true })
        .getByRole('button', { name: 'Rời và bỏ phần chưa lưu', exact: true })
        .click();
      await add.click();
      await form.getByLabel('Tên dấu mốc', { exact: true }).fill('Giữ phần đã lưu');
      await picker.setInputFiles(
        ['moment-retry-a.png', 'moment-retry-b.png'].map((name) => ({
          name,
          mimeType: 'image/png',
          buffer: photo,
        })),
      );
      rejectPhoto = true;
      await form.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(form.getByRole('alert')).toContainText('Đã lưu 1/2 ảnh');
      await expect(form.locator('.milestone-selected-photos > div')).toHaveCount(1);
      const partial = (await (await context.request.get(origin + '/api/journal')).json()).find(
        (e: any) => e.title === 'Giữ phần đã lưu',
      );
      assert.ok(partial && partial.assets.length === 1);
      rejectPhoto = false;
      await form.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(form).not.toBeVisible();
      const restored = (await (await context.request.get(origin + '/api/journal')).json()).filter(
        (e: any) => e.title === 'Giữ phần đã lưu',
      );
      assert.equal(restored.length, 1);
      assert.equal(restored[0].id, partial.id);
      assert.equal(restored[0].assets.length, 2);
      assert.deepEqual(errors, []);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile('test-results/moment-composer/report.json', JSON.stringify(reports, null, 2));
console.log(
  'PASS moment composer: photo previews, preparation reuse, no intermediate feed refresh, partial-save-safe flow, caret, discard confirmation and fixed actions at 1440/390/320.',
);
