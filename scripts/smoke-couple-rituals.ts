import { chromium, expect, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { decorationCatalog } from '../packages/domain/decorations.js';
const origin = process.env.SMOKE_UI_ORIGIN!,
  dataDir = process.env.AUTH_UI_DATA_DIR!;
if (
  !origin ||
  new URL(origin).hostname !== '127.0.0.1' ||
  !dataDir ||
  !path.resolve(dataDir).startsWith(path.resolve('test-results') + path.sep)
)
  throw Error('Isolated fixtures only');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
async function register(context: BrowserContext, name: string) {
  const email = 'plans-' + crypto.randomUUID() + '@example.test';
  await context.request.get(origin + '/api/session');
  assert.equal(
    (
      await context.request.post(origin + '/api/auth/register', {
        data: { email, password: 'Fixture-password-123!' },
      })
    ).status(),
    201,
  );
  const rows = await Promise.all(
    (await readdir(path.join(dataDir, 'mail')))
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => JSON.parse(await readFile(path.join(dataDir, 'mail', f), 'utf8'))),
  );
  const mail = rows.find((m) => m.to === email),
    token = new URLSearchParams(new URL(mail.text.match(/http[^\s]+/)[0]).hash.slice(1)).get(
      'token',
    );
  assert.equal(
    (await context.request.post(origin + '/api/auth/verify-email', { data: { token } })).status(),
    201,
  );
  assert.equal(
    (
      await context.request.patch(origin + '/api/profile', {
        data: { displayName: name, expectedRevision: -1 },
      })
    ).status(),
    200,
  );
  return { email, ...(await (await context.request.get(origin + '/api/session')).json()) };
}

try {
  for (const width of [1600, 390, 320]) {
    const a = await browser.newContext({ viewport: { width, height: width < 400 ? 844 : 1050 } }),
      b = await browser.newContext({ viewport: { width, height: width < 400 ? 844 : 1050 } });
    const pa = await a.newPage(),
      pb = await b.newPage(),
      errors: string[] = [];
    for (const p of [pa, pb]) p.on('pageerror', (e) => errors.push(e.message));
    try {
      const alice = await register(a, 'An'),
        bob = await register(b, 'Bình');
      const grant = await (
        await a.request.post(origin + '/api/timeline-sharing', { data: { email: bob.email } })
      ).json();
      assert.equal(
        (
          await b.request.patch(origin + '/api/timeline-sharing/' + grant.id, {
            data: { expectedRevision: 0, action: 'accept' },
          })
        ).status(),
        200,
      );
      const root = origin + '/api/together/' + alice.id;
      await pa.goto(origin + '/today');
      await pa
        .locator('.ritual-home-links')
        .getByRole('button', { name: /Câu hỏi dành cho hai người/ })
        .click();
      await pb.goto(origin + '/together');
      await expect(
        pa.getByRole('heading', { name: 'Câu hỏi & Lọ điều thương', exact: true }),
      ).toBeVisible();
      const field = pa.getByLabel('Câu trả lời riêng của bạn', { exact: true });
      await field.fill('Muốn cùng bạn đi dạo.');
      await field.press('Home');
      await pa.keyboard.insertText('Mình ');
      await expect(field).toBeFocused();
      await pa.reload();
      await expect(field).toHaveValue('Mình Muốn cùng bạn đi dạo.');
      await pa.getByRole('button', { name: 'Gửi câu trả lời riêng', exact: true }).click();
      await expect(pa.getByText('Lời của bạn đang được giữ riêng.', { exact: true })).toBeVisible();
      let state = await (await b.request.get(root)).json();
      assert.ok(!JSON.stringify(state).includes('Mình Muốn cùng bạn đi dạo.'));
      await pb.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(pb.locator('.question-participants')).toContainText('Đã gửi câu trả lời');
      await expect(pb.getByText('Mình Muốn cùng bạn đi dạo.', { exact: true })).toHaveCount(0);
      await pb
        .getByLabel('Câu trả lời riêng của bạn', { exact: true })
        .fill('Mình muốn nấu một bữa cơm cùng bạn.');
      await pb.getByRole('button', { name: 'Gửi câu trả lời riêng', exact: true }).click();
      await expect(pb.locator('.question-replies')).toContainText('Mình Muốn cùng bạn đi dạo.');
      await pa.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(pa.locator('.question-replies')).toContainText(
        'Mình muốn nấu một bữa cơm cùng bạn.',
      );
      await pa.screenshot({
        path: 'test-results/ritual-question-' + width + '.png',
        fullPage: true,
      });
      await pa.getByRole('button', { name: 'Lưu thành dấu mốc', exact: true }).click();
      await expect(
        pa.getByRole('button', { name: 'Đã lưu thành dấu mốc', exact: true }),
      ).toBeDisabled();
      assert.equal((await (await a.request.get(origin + '/api/journal')).json()).length, 1);
      await pa
        .locator('.ritual-tabs')
        .getByRole('button', { name: 'Lọ điều thương', exact: true })
        .click();
      await expect(pa.getByLabel('Lời nhắn bỏ vào lọ', { exact: true })).toBeVisible();
      state = await (await a.request.get(root)).json();
      const today = state.today;
      const future = new Date(Date.parse(today + 'T00:00:00Z') + 7 * 86400000)
        .toISOString()
        .slice(0, 10);
      const secret = 'Cảm ơn vì hôm nay bạn đã ở đây ' + width;
      await pa.getByLabel('Lời nhắn bỏ vào lọ', { exact: true }).fill(secret);
      await pa.getByLabel('Hẹn ngày mở lời thương', { exact: true }).selectOption('scheduled');
      await pa.getByLabel('Ngày mở lời thương', { exact: true }).fill(future);
      await pa.reload();
      await expect(pa.getByLabel('Ngày mở lời thương', { exact: true })).toHaveValue(future);
      await expect(pa.getByLabel('Lời nhắn bỏ vào lọ', { exact: true })).toHaveValue(secret);
      const photoPath = path.resolve('test-results/ritual-photo-' + width + '.png');
      await writeFile(
        photoPath,
        await sharp({
          create: { width: 240, height: 180, channels: 3, background: '#b4c7a5' },
        })
          .png()
          .toBuffer(),
      );
      await pa.getByLabel('Chọn ảnh gửi kèm lời thương', { exact: true }).setInputFiles(photoPath);
      let photoUploads = 0;
      const uploadPath = '**/api/together/' + alice.id + '/assets';
      await pa.route(uploadPath, async (route) => {
        photoUploads++;
        // Chromium omits disk-backed file bytes from intercepted postDataBuffer().
        // Replay the same fixture bytes with the browser's receipt token, then lose the response.
        const response = await a.request.post(route.request().url(), {
          headers: { 'x-upload-id': route.request().headers()['x-upload-id'], origin },
          multipart: {
            file: {
              name: path.basename(photoPath),
              mimeType: 'image/png',
              buffer: await readFile(photoPath),
            },
          },
        });
        assert.equal(response.status(), 201, await response.text());
        await pa.unroute(uploadPath);
        await route.abort('failed');
      });
      const lostResponse = async (route: import('@playwright/test').Route) => {
        const result = await route.fetch();
        assert.equal(result.status(), 201);
        await route.abort('failed');
      };
      await pa.route('**/api/together/' + alice.id + '/notes', lostResponse);
      await pa.getByRole('button', { name: 'Bỏ lời thương vào lọ', exact: true }).click();
      await expect(pa.getByRole('alert')).toBeVisible();
      await expect(pa.getByLabel('Lời nhắn bỏ vào lọ', { exact: true })).toHaveValue(secret);
      assert.equal((await (await a.request.get(root)).json()).jarTotal, 1);
      await pa.unroute('**/api/together/' + alice.id + '/notes', lostResponse);
      // Recover a confirmed photo and note after both responses were lost and the page reloaded.
      await pa.reload();
      await expect(pa.getByLabel('Lời nhắn bỏ vào lọ', { exact: true })).toHaveValue(secret);
      await expect(
        pa.getByRole('button', { name: 'Bỏ lời thương vào lọ', exact: true }),
      ).toBeDisabled();
      await pa.getByLabel('Chọn ảnh gửi kèm lời thương', { exact: true }).setInputFiles(photoPath);
      await pa.getByRole('button', { name: 'Bỏ lời thương vào lọ', exact: true }).click();
      await expect(pa.getByLabel('Lời nhắn bỏ vào lọ', { exact: true })).toHaveValue('');
      assert.equal(photoUploads, 1);
      assert.equal((await (await a.request.get(root)).json()).jarTotal, 1);
      await pa.reload();
      await expect(pa.getByLabel('Lời nhắn bỏ vào lọ', { exact: true })).toHaveValue('');
      const ownNote = (await (await a.request.get(root)).json()).jar[0];
      assert.equal(ownNote.hasPhoto, true);
      assert.equal((await b.request.get(origin + ownNote.photoUrl)).status(), 403);
      await pb
        .locator('.ritual-tabs')
        .getByRole('button', { name: 'Lọ điều thương', exact: true })
        .click();
      await expect(pb.locator('.jar-card.sealed')).toHaveCount(1);
      assert.ok(!JSON.stringify(await (await b.request.get(root)).json()).includes(secret));
      await expect(pb.getByText(secret, { exact: true })).toHaveCount(0);
      await pb.getByRole('button', { name: 'Rút một điều thương đã mở', exact: true }).click();
      await expect(pb.getByRole('alert')).toContainText('Chưa có lời nhắn đủ điều kiện mở');
      await pb.getByRole('button', { name: 'Đồng ý mở sớm', exact: true }).click();
      await expect(pb.locator('.jar-card.sealed')).toContainText('1/2');
      await expect(pb.getByText(secret, { exact: true })).toHaveCount(0);
      await pa.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(pa.locator('.jar-card.sealed')).toContainText('1/2');
      await pa.getByRole('button', { name: 'Đồng ý mở sớm', exact: true }).click();
      await pb.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(pb.locator('.jar-card.opened')).toContainText(secret);
      await expect(pb.locator('.jar-card.opened img')).toBeVisible();
      assert.equal((await b.request.get(origin + ownNote.photoUrl)).status(), 200);
      await pa.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(pa.locator('.jar-card.opened')).toContainText(secret);
      await pa.screenshot({ path: 'test-results/ritual-jar-' + width + '.png', fullPage: true });
      await pb.getByRole('button', { name: 'Rút một điều thương đã mở', exact: true }).click();
      const draw = pb.getByRole('dialog', { name: 'Một điều thương dành cho bạn', exact: true });
      await expect(draw).toContainText(secret);
      await draw.getByRole('button', { name: 'Giữ lại trong lòng', exact: true }).click();
      await pa.getByLabel('Lời nhắn bỏ vào lọ', { exact: true }).fill(secret);
      await pa.getByRole('button', { name: 'Bỏ lời thương vào lọ', exact: true }).click();
      await expect(pa.getByLabel('Lời nhắn bỏ vào lọ', { exact: true })).toHaveValue('');
      const added = await (await a.request.get(root)).json();
      assert.equal(added.jarTotal, 2);
      assert.notEqual(added.jar[0].id, added.jar[1].id);
      await expect(pa.locator('.jar-card.sealed')).toContainText('0/2');
      await pa
        .locator('.jar-card.sealed')
        .getByRole('button', { name: 'Đồng ý mở sớm', exact: true })
        .click();
      await pa
        .locator('.jar-card.sealed')
        .getByRole('button', { name: 'Rút lại đồng ý', exact: true })
        .click();
      await expect(pa.locator('.jar-card.sealed')).toContainText('0/2');
      await pb.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(pb.locator('.jar-card.sealed')).toContainText('0/2');
      await pb
        .locator('.jar-card.sealed')
        .getByRole('button', { name: 'Đồng ý mở sớm', exact: true })
        .click();
      await expect(pb.locator('.jar-card.sealed')).toContainText('1/2');
      await pa.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(pa.locator('.jar-card.sealed')).toContainText('1/2');
      await pa
        .locator('.jar-card.sealed')
        .getByRole('button', { name: 'Đồng ý mở sớm', exact: true })
        .click();
      await expect(pa.locator('.jar-card.opened')).toHaveCount(2);
      let nativeDialogs = 0;
      pa.on('dialog', () => nativeDialogs++);
      await pa.getByRole('button', { name: 'Xóa lời thương của bạn', exact: true }).first().click();
      const confirm = pa.getByRole('dialog', { name: 'Lấy lời nhắn này khỏi lọ?', exact: true });
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: 'Xóa lời nhắn', exact: true }).click();
      await expect(pa.locator('.jar-card')).toHaveCount(1);
      assert.equal(nativeDialogs, 0);
      await a.request.delete(origin + '/api/timeline-sharing/' + grant.id, {
        data: { expectedRevision: 1 },
      });
      await pb.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(pb.getByText(secret, { exact: true })).toHaveCount(0);
      assert.equal((await b.request.get(root)).status(), 404);
      assert.equal((await b.request.get(origin + ownNote.photoUrl)).status(), 404);
      const album = await (
        await a.request.post(origin + '/api/albums', { data: { title: 'Trang trí vừa vặn' } })
      ).json();
      await pa.goto(origin + '/albums/' + album.id);
      await pa.getByRole('button', { name: 'Trang trí', exact: true }).click();
      await expect
        .poll(() => pa.locator('.decoration-gallery img[data-normalized="true"]').count())
        .toBe(decorationCatalog.filter((d) => !d.collection.startsWith('Ký hiệu')).length);
      await expect
        .poll(() =>
          pa
            .locator('.decoration-gallery img')
            .evaluateAll((nodes) =>
              nodes.every(
                (n) =>
                  (n as HTMLImageElement).complete && (n as HTMLImageElement).naturalWidth === 128,
              ),
            ),
        )
        .toBe(true);
      const catalogue = await pa.locator('.decoration-gallery > button').evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect(),
            preview = node.querySelector('.decoration-preview')!.getBoundingClientRect();
          return {
            height: box.height,
            preview: preview.height,
            padding: getComputedStyle(node).padding,
          };
        }),
      );
      assert.equal(new Set(catalogue.map((c) => c.height)).size, 1);
      assert.ok(catalogue.every((c) => c.preview === 80 && c.padding === '10px'));
      const fitted = await pa.locator('.counter-preset-art').evaluateAll((nodes) =>
        nodes.every((node) => {
          const outer = node.getBoundingClientRect(),
            art = node.firstElementChild!.getBoundingClientRect();
          return art.width <= outer.width + 1 && art.height <= outer.height + 1;
        }),
      );
      assert.equal(fitted, true);
      const symbolsFit = await pa
        .locator('.symbol-groups .sticker-grid > button')
        .evaluateAll((nodes) =>
          nodes.every((node) => {
            const box = node.getBoundingClientRect(),
              art = node.querySelector('.decoration-preview')!.getBoundingClientRect();
            return (
              art.left >= box.left + 5 &&
              art.right <= box.right - 5 &&
              art.top >= box.top + 5 &&
              art.bottom <= box.bottom - 5
            );
          }),
        );
      assert.ok(symbolsFit, 'Small symbols must fit inside their tile padding');
      const inkBounds = await pa.locator('.decoration-gallery img').evaluateAll((nodes) =>
        nodes.map((node) => {
          const image = node as HTMLImageElement,
            canvas = document.createElement('canvas');
          canvas.width = 128;
          canvas.height = 128;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(image, 0, 0, 128, 128);
          const pixels = ctx.getImageData(0, 0, 128, 128).data;
          let left = 128,
            right = -1,
            top = 128,
            bottom = -1;
          for (let y = 0; y < 128; y++)
            for (let x = 0; x < 128; x++)
              if (pixels[(y * 128 + x) * 4 + 3] > 2) {
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
              }
          return {
            size: Math.max(right - left + 1, bottom - top + 1),
            centerX: (left + right) / 2,
            centerY: (top + bottom) / 2,
          };
        }),
      );
      assert.ok(
        inkBounds.every(
          (b) =>
            b.size >= 110 &&
            b.size <= 120 &&
            Math.abs(b.centerX - 63.5) <= 2 &&
            Math.abs(b.centerY - 63.5) <= 2,
        ),
        'Actual artwork should have consistent padding and be centered',
      );
      await pa.locator('.decoration-gallery > button').first().scrollIntoViewIfNeeded();
      await pa.screenshot({
        path: 'test-results/ritual-decoration-' + width + '.png',
        fullPage: true,
      });
      assert.ok(await pa.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      // A frontend deployed before its API must not call unavailable endpoints.
      await pa.route('**/api/session', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        delete body.coupleRitualsVersion;
        await route.fulfill({ response, json: body });
      });
      let newCalls = 0;
      pa.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/together/')) newCalls++;
      });
      await pa.goto(origin + '/together');
      await expect(
        pa.getByRole('heading', { name: 'Góc nhỏ đang được cập nhật', exact: true }),
      ).toBeVisible();
      assert.equal(newCalls, 0);
    } catch (error) {
      await pa.screenshot({
        path: 'test-results/ritual-failure-a-' + width + '.png',
        fullPage: true,
      });
      await pb.screenshot({
        path: 'test-results/ritual-failure-b-' + width + '.png',
        fullPage: true,
      });
      throw error;
    } finally {
      await a.close();
      await b.close();
    }
  }
  console.log(
    'PASS couple rituals: sealed wire data, daily mutual reveal, account drafts/IME, memory conversion, multiple jar deposits, date-or-unanimous opening, eligible random draws, consent withdrawal, app confirmation, revoked permissions and consistent decoration previews at 1600/390/320px.',
  );
} finally {
  await browser.close();
}
