import { chromium, expect, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { element, fonts, type Album, type JobView } from '../packages/domain/index.js';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1' || !process.env.AUTH_UI_DATA_DIR)
  throw Error('Isolated fixture only');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
const picture = await sharp('apps/web/public/illustrations/demo-1.svg')
  .resize(600, 800)
  .png()
  .toBuffer();
async function register(context: BrowserContext) {
  const email = 'focus-' + crypto.randomUUID() + '@example.test';
  await context.request.get(origin + '/api/session');
  await context.request.post(origin + '/api/auth/register', {
    data: { email, password: 'Refinement-password-123!' },
  });
  const directory = path.join(process.env.AUTH_UI_DATA_DIR!, 'mail'),
    rows = await Promise.all(
      (await readdir(directory))
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => JSON.parse(await readFile(path.join(directory, f), 'utf8'))),
    );
  const mail = rows.find((row) => row.to === email),
    token = new URLSearchParams(new URL(mail.text.match(/http[^\s]+/)[0]).hash.slice(1)).get(
      'token',
    );
  await context.request.post(origin + '/api/auth/verify-email', { data: { token } });
  await context.request.patch(origin + '/api/profile', {
    data: { displayName: 'Minh An', expectedRevision: -1 },
  });
}
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1600, height: 1000 },
      }),
      page = await context.newPage(),
      errors: string[] = [],
      externalFonts: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) externalFonts.push(r.url());
    });
    await page.route('https://tile.openstreetmap.org/**', (r) =>
      r.fulfill({ status: 200, contentType: 'image/png', body: picture }),
    );
    try {
      await register(context);
      let album: Album = await (
        await context.request.post(origin + '/api/albums', {
          data: { title: 'Nét chữ của chúng mình' },
        })
      ).json();
      const text = element('text', {
        text: 'Thương nhớ Việt Nam',
        x: 60,
        y: 80,
        width: 600,
        height: 120,
        fontSize: 32,
        rotation: 0,
      });
      album = await (
        await context.request.patch(origin + '/api/albums/' + album.id, {
          data: {
            expectedRevision: album.revision,
            content: {
              ...album,
              pages: [
                {
                  id: album.pages[0].id,
                  title: 'Lời thương',
                  background: '#fff9ec',
                  elements: [text],
                },
              ],
            },
          },
        })
      ).json();
      await page.goto(origin + '/albums/' + album.id);
      await expect(page.locator('.canvas-sheet')).toBeVisible();
      await page.locator('.canvas-sheet').scrollIntoViewIfNeeded();
      const box = await page.locator('.canvas-sheet').boundingBox();
      assert.ok(box);
      await page
        .locator('.canvas-sheet')
        .dblclick({ position: { x: (box.width * 360) / 720, y: (box.height * 100) / 900 } });
      const dialog = page.getByRole('dialog', { name: 'Viết một lời thương', exact: true }),
        field = dialog.getByLabel('Nội dung chữ trong sổ', { exact: true });
      await expect(dialog).toBeVisible();
      await expect(field).toBeFocused();
      await field.fill('Một ngày thương nhớ');
      await field.evaluate((e: HTMLTextAreaElement) => e.setSelectionRange(4, 8));
      await page.keyboard.insertText('buổi hẹn');
      await expect(field).toHaveValue('Một buổi hẹn thương nhớ');
      await expect(field).toBeFocused();
      const position = await field.evaluate((e: HTMLTextAreaElement) => e.selectionStart);
      assert.equal(position, 12);
      await field.evaluate((e) =>
        e.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })),
      );
      await page.keyboard.insertText(' Việt');
      await field.evaluate((e) =>
        e.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }),
        ),
      );
      await expect(dialog).toBeVisible();
      await expect(field).toBeFocused();
      await field.evaluate((e) =>
        e.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: ' Việt' })),
      );
      for (const chunk of [' Nam', ' của', ' chúng', ' mình']) {
        await page.keyboard.insertText(chunk);
        await expect(field).toBeFocused();
      }
      const content = await field.inputValue();
      for (const [align, label] of [
        ['left', 'Căn trái'],
        ['center', 'Căn giữa'],
        ['right', 'Căn phải'],
      ] as const) {
        await dialog.getByRole('button', { name: label, exact: true }).click();
        await expect(field).toHaveCSS('text-align', align);
        await field.focus();
        await expect(field).toBeFocused();
      }
      const choices = Object.entries(fonts).filter(
        ([id]) => !['serif', 'sans', 'hand'].includes(id),
      );
      for (const [id, family] of mobile ? choices.slice(0, 1) : choices) {
        await dialog.getByLabel('Kiểu chữ trong nội dung', { exact: true }).selectOption(id);
        const loaded = await page.evaluate(async (family) => {
          return (await document.fonts.load(`400 32px "${family}"`, 'Thương nhớ Việt Nam')).filter(
            (face) => face.status === 'loaded',
          ).length;
        }, family);
        assert.ok(loaded >= 2, family + ' must load Latin and Vietnamese font faces');
        assert.ok(
          await page.evaluate(
            (family) => document.fonts.check(`400 32px "${family}"`, 'Thương nhớ Việt Nam'),
            family,
          ),
        );
        await field.focus();
        await expect(field).toBeFocused();
      }
      const family = mobile ? choices[0][1] : choices.at(-1)![1];
      await expect(field).toHaveCSS('font-family', new RegExp(family.replaceAll(' ', ' ?')));
      await page.screenshot({ path: 'test-results/text-focus-fonts-' + mobile + '.png' });
      await dialog.getByRole('button', { name: 'Viết xong rồi', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
        timeout: 20000,
      });
      album = await (await context.request.get(origin + '/api/albums/' + album.id)).json();
      assert.equal(album.pages[0].elements[0].text, content);
      assert.equal(album.pages[0].elements[0].align, 'right');
      await page.getByRole('button', { name: 'Xem album', exact: true }).click();
      const viewer = page.getByRole('dialog', { name: 'Xem album', exact: true });
      await expect(
        viewer
          .locator('div[style*="white-space"]')
          .filter({ hasText: new RegExp('^' + content + '$') }),
      ).toHaveCSS('text-align', 'right');
      await expect(
        viewer
          .locator('div[style*="white-space"]')
          .filter({ hasText: new RegExp('^' + content + '$') }),
      ).toHaveCSS('font-family', new RegExp(family.replaceAll(' ', ' ?')));
      await page.getByRole('button', { name: 'Đóng album', exact: true }).click();
      await page.goto(origin + '/today');
      await page.route('**/api/usage', async (r) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        await r.continue();
      });
      await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
      const account = page.getByRole('dialog', { name: 'Tài khoản của bạn', exact: true });
      await expect(
        account.getByRole('status').filter({ hasText: 'Đang tải dung lượng' }),
      ).toBeVisible();
      await expect(account.locator('progress')).toBeVisible();
      assert.ok(
        await account.evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
        'Account overview should fit without internal scrolling',
      );
      assert.ok(await account.evaluate((e) => e.getBoundingClientRect().right <= innerWidth));
      const name = account.getByLabel('Tên hiển thị', { exact: true });
      await name.focus();
      await page.keyboard.insertText('!');
      await expect(name).toBeFocused();
      await page.screenshot({ path: 'test-results/account-wide-' + mobile + '.png' });
      if (mobile) {
        await account.getByRole('button', { name: 'Bảo mật', exact: true }).click();
        await expect(
          account.getByRole('button', { name: 'Đổi mật khẩu', exact: true }),
        ).toBeVisible();
        await account.getByRole('button', { name: 'Hồ sơ', exact: true }).click();
      }
      await account.getByRole('button', { name: 'Đóng', exact: true }).click();
      album = await (
        await context.request.post(origin + '/api/albums/' + album.id + '/assets', {
          multipart: { file: { name: 'photo.png', mimeType: 'image/png', buffer: picture } },
        })
      ).json();
      await page.route('**/api/library/photos?**', async (r) => {
        if (r.request().method() === 'GET')
          await new Promise((resolve) => setTimeout(resolve, 700));
        await r.continue();
      });
      await page.goto(origin + '/photos');
      await expect(
        page.getByRole('status').filter({ hasText: 'Đang tải những khung hình' }),
      ).toBeVisible();
      await expect(page.locator('.memory-photo-open')).toHaveCount(1);
      await page.locator('.memory-photo-open').click();
      const lightbox = page.getByRole('dialog', { name: 'Xem ảnh kỉ niệm', exact: true }),
        download = lightbox.getByRole('button', { name: 'Tải ảnh xuống', exact: true });
      await expect(download).toBeVisible();
      const contrast = await download.evaluate((e) => {
        const s = getComputedStyle(e);
        return { color: s.color, background: s.backgroundColor };
      });
      assert.notEqual(contrast.color, contrast.background);
      const bounds = await download.boundingBox();
      assert.ok(bounds && bounds.width >= 38 && bounds.height >= 38);
      await page.screenshot({ path: 'test-results/lightbox-toolbar-' + mobile + '.png' });
      await lightbox.getByRole('button', { name: 'Đóng ảnh', exact: true }).click();
      await page.goto(origin + '/timeline');
      await expect(
        page.getByRole('button', { name: 'Mở thùng rác dấu mốc', exact: true }),
      ).toBeVisible();
      const trash = await page.locator('.journal-trash-action').boundingBox(),
        filters = await page.locator('.journal-filters').boundingBox();
      assert.ok(trash && filters && trash.y + trash.height <= filters.y + 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      assert.deepEqual(externalFonts, []);
      if (!mobile) {
        album = await (await context.request.get(origin + '/api/albums/' + album.id)).json();
        album = await (
          await context.request.patch(origin + '/api/albums/' + album.id, {
            data: {
              expectedRevision: album.revision,
              content: {
                ...album,
                pages: [
                  {
                    ...album.pages[0],
                    elements: choices.map(([font], i) =>
                      element('text', {
                        font: font as any,
                        text: 'Thương nhớ Việt Nam · ' + fonts[font as keyof typeof fonts],
                        x: 55,
                        y: 40 + i * 76,
                        width: 610,
                        height: 60,
                        fontSize: 25,
                        align: (['left', 'center', 'right'] as const)[i % 3],
                      }),
                    ),
                  },
                ],
              },
            },
          })
        ).json();
        const response = await context.request.post(
          origin + '/api/albums/' + album.id + '/exports',
          {
            data: {
              idempotencyKey: crypto.randomUUID(),
              expectedRevision: album.revision,
              config: {
                seconds: 15,
                pageIds: [album.pages[0].id],
                opening: '',
                closing: '',
                musicId: 'none',
              },
            },
          },
        );
        assert.equal(response.status(), 201, await response.text());
        let job: JobView = await response.json();
        const deadline = Date.now() + 180000;
        while (!['completed', 'failed', 'canceled'].includes(job.status) && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1000));
          job = await (await context.request.get(origin + '/api/exports/' + job.id)).json();
        }
        assert.equal(job.status, 'completed', job.error);
        const bytes = await (
          await context.request.get(origin + '/api/exports/' + job.id + '/download')
        ).body();
        assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
        await writeFile('test-results/ten-fonts-recap.mp4', bytes);
      }
    } catch (error) {
      await page.screenshot({
        path: 'test-results/refinement-failure-' + mobile + '.png',
        fullPage: true,
      });
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS refinement: typing/IME/caret survive rerenders, text alignment, 10 local Vietnamese fonts in canvas/viewer/actual MP4, readable download toolbar, aligned trash controls, account overview fits and async loading states on desktop/mobile.',
  );
} finally {
  await browser.close();
}
