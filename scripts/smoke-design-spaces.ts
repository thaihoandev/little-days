import { chromium, expect, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
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

const image = await sharp({
  create: { width: 480, height: 160, channels: 3, background: '#d9b596' },
})
  .png()
  .toBuffer();
try {
  for (const mobile of [false, true]) {
    const a = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1500, height: 1000 },
    });
    const b = await browser.newContext();
    const page = await a.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://tile.openstreetmap.org/**', (r) =>
      r.fulfill({ status: 200, contentType: 'image/png', body: image }),
    );
    try {
      const alice = await register(a, 'An'),
        bob = await register(b, 'Bình');
      for (const context of [a, b]) {
        const result = await context.request.post(origin + '/api/profile/avatar', {
          multipart: {
            expectedRevision: '0',
            file: { name: 'wide.png', mimeType: 'image/png', buffer: image },
          },
        });
        assert.equal(result.status(), 201, await result.text());
      }
      const base = {
        title: 'Kỉ niệm trên bản đồ',
        date: '2026-11-03',
        note: 'Chỉ cùng giữ khi chọn không gian chung',
        kind: 'memory',
        annual: false,
      };
      const privateEntry = await (
        await a.request.post(origin + '/api/journal', {
          data: { ...base, title: 'Ngày riêng của An' },
        })
      ).json();
      let reached!: () => void, release!: () => void;
      const started = new Promise<void>((resolve) => (reached = resolve)),
        resume = new Promise<void>((resolve) => (release = resolve));
      const delaySharing = async (route: import('@playwright/test').Route) => {
        reached();
        await resume;
        await route.continue();
      };
      await page.route('**/api/timeline-sharing', delaySharing);
      try {
        await page.goto(origin + '/today');
        await started;
        await page.getByRole('button', { name: 'Thêm dấu mốc', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Thêm dấu mốc', exact: true })).toHaveCount(
          0,
        );
        await expect(
          page.getByText('Đang xác định không gian lưu…', { exact: true }),
        ).toBeVisible();
        release();
        const delayed = page.getByRole('dialog', { name: 'Thêm dấu mốc', exact: true });
        await expect(delayed).toBeVisible();
        await delayed.getByLabel('Tên dấu mốc', { exact: true }).fill('Nhật ký tải chậm');
        await delayed.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
        await expect(delayed).not.toBeVisible();
        const slowEntry = (await (await a.request.get(origin + '/api/journal')).json()).find(
          (e: { title: string }) => e.title === 'Nhật ký tải chậm',
        );
        assert.equal(slowEntry.visibility, 'private');
      } finally {
        release();
        await page.unroute('**/api/timeline-sharing', delaySharing);
      }
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
      assert.equal((await b.request.get(origin + '/api/journal/' + privateEntry.id)).status(), 404);
      let entry = await (
        await a.request.post(origin + '/api/journal', {
          data: {
            ...base,
            timelineId: alice.id,
            location: { latitude: 16.05, longitude: 108.2, label: 'Ngày đi Đà Nẵng' },
          },
        })
      ).json();
      entry = await (
        await a.request.post(origin + '/api/journal/' + entry.id + '/assets', {
          multipart: { file: { name: 'wide.png', mimeType: 'image/png', buffer: image } },
        })
      ).json();
      await page.goto(origin + '/timeline');
      await expect(page.getByLabel('Chọn dòng thời gian', { exact: true })).toHaveValue(alice.id);
      await expect(page.locator('.entry-author .user-avatar img').first()).toBeVisible();
      async function circles(selector: string) {
        const rows = await page.locator(selector).evaluateAll((nodes) =>
          nodes.map((node) => {
            const r = node.getBoundingClientRect(),
              s = getComputedStyle(node),
              image = node.querySelector('img');
            return {
              width: r.width,
              height: r.height,
              radius: s.borderRadius,
              fit: image && getComputedStyle(image).objectFit,
              imageWidth: image?.getBoundingClientRect().width,
            };
          }),
        );
        assert.ok(rows.length);
        for (const r of rows) {
          assert.ok(Math.abs(r.width - r.height) < 1, JSON.stringify(r));
          assert.equal(r.radius, '50%');
          assert.equal(r.fit, 'cover');
          assert.ok(Math.abs(r.width - r.imageWidth!) < 2);
        }
      }
      await circles('.entry-author .user-avatar');
      const marker = page.locator('.memory-pin-face.has-photo');
      await expect(marker).toBeVisible();
      const dimensions = await marker.evaluate((node) => {
        const r = node.getBoundingClientRect(),
          img = node.querySelector('img')!,
          b = img.getBoundingClientRect();
        return {
          w: r.width,
          h: r.height,
          iw: b.width,
          ih: b.height,
          fit: getComputedStyle(img).objectFit,
        };
      });
      assert.ok(dimensions.iw <= dimensions.w && dimensions.ih <= dimensions.h);
      assert.equal(dimensions.fit, 'cover');
      await marker.click();
      await expect(page.locator('.map-memory-row img')).toBeVisible();
      const thumb = await page.locator('.map-memory-row img').evaluate((img) => ({
        // DOMRect subtraction can contain subpixel floating-point noise on translated Leaflet layers.
        w: Number(img.getBoundingClientRect().width.toFixed(3)),
        h: Number(img.getBoundingClientRect().height.toFixed(3)),
        cssWidth: getComputedStyle(img).width,
        cssHeight: getComputedStyle(img).height,
        fit: getComputedStyle(img).objectFit,
      }));
      assert.deepEqual(thumb, { w: 42, h: 42, cssWidth: '42px', cssHeight: '42px', fit: 'cover' });
      await page.screenshot({ path: 'test-results/design-spaces-map-' + mobile + '.png' });
      await page.getByRole('button', { name: 'Chia sẻ dòng thời gian', exact: true }).click();
      await expect(
        page.getByRole('dialog', { name: 'Chia sẻ dòng thời gian', exact: true }),
      ).toBeVisible();
      await circles('.shared-space-members .user-avatar');
      await page.screenshot({ path: 'test-results/design-spaces-sharing-' + mobile + '.png' });
      await page.getByRole('button', { name: 'Đóng chia sẻ dòng thời gian', exact: true }).click();
      const spaces = await (await a.request.get(origin + '/api/timeline-sharing')).json();
      const ownPrivate = spaces.spaces.find((s: { shared: boolean }) => !s.shared).id;
      await page.getByRole('button', { name: 'Sửa dấu mốc ' + base.title, exact: true }).click();
      const edit = page.getByRole('dialog', { name: 'Sửa dấu mốc', exact: true });
      await edit.getByLabel('Lưu vào dòng thời gian', { exact: true }).selectOption(ownPrivate);
      await edit.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(edit).not.toBeVisible();
      assert.equal((await b.request.get(origin + '/api/journal/' + entry.id)).status(), 404);
      assert.equal((await b.request.get(origin + entry.assets[0].url)).status(), 404);
      await page.getByLabel('Chọn dòng thời gian', { exact: true }).selectOption(ownPrivate);
      await expect(
        page.getByRole('button', { name: 'Sửa dấu mốc Ngày riêng của An', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Sửa dấu mốc ' + base.title, exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: 'test-results/design-spaces-private-' + mobile + '.png' });
      let album = await (
        await a.request.post(origin + '/api/albums', { data: { title: 'Sổ nhiều sắc màu' } })
      ).json();
      album = await (
        await a.request.patch(origin + '/api/albums/' + album.id, {
          data: {
            expectedRevision: album.revision,
            content: { ...album, pages: [{ ...album.pages[0], elements: [] }] },
          },
        })
      ).json();
      await page.goto(origin + '/albums/' + album.id);
      await page.getByRole('button', { name: 'Trang trí', exact: true }).click();
      await page.getByLabel('Tìm trang trí', { exact: true }).fill('Cốc cà phê');
      await page.getByRole('button', { name: 'Thêm trang trí Cốc cà phê', exact: true }).click();
      await page.getByRole('button', { name: 'Thêm ký hiệu Ngôi sao', exact: true }).click();
      await page.getByRole('button', { name: 'Thêm bộ đếm Ngày đêm sao', exact: true }).click();
      await page.getByLabel('Ngày riêng của bộ đếm', { exact: true }).fill('2020-02-14');
      await page.getByLabel('Lời nhắn bộ đếm', { exact: true }).fill('Ngày mình yêu nhau');
      await page.getByRole('button', { name: 'Bộ đếm màu Tím mây', exact: true }).click();
      await page.getByLabel('Hiệu ứng lặp', { exact: true }).selectOption('float');
      await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
        timeout: 20000,
      });
      album = await (await a.request.get(origin + '/api/albums/' + album.id)).json();
      const counter = album.pages[0].elements.find(
        (e: { type: string }) => e.type === 'anniversary',
      );
      assert.equal(counter.counterFill, '#e9dfed');
      assert.equal(counter.counterDate, '2020-02-14');
      assert.equal(counter.counterCaption, 'Ngày mình yêu nhau');
      assert.equal(counter.visualEffect, 'float');
      assert.equal(album.pages[0].elements.length, 3);
      await page.getByRole('button', { name: 'Sao chép kiểu', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Dán kiểu', exact: true })).toBeEnabled();
      // Spread the elements for visual QA; authoring above still uses the actual editor controls.
      album = await (
        await a.request.patch(origin + '/api/albums/' + album.id, {
          data: {
            expectedRevision: album.revision,
            content: {
              ...album,
              pages: [
                {
                  ...album.pages[0],
                  elements: album.pages[0].elements.map((e: { type: string }, i: number) => ({
                    ...e,
                    x: i === 2 ? 180 : i === 0 ? 70 : 540,
                    y: i === 2 ? 480 : 160,
                  })),
                },
              ],
            },
          },
        })
      ).json();
      await page.reload();
      await page.getByRole('button', { name: 'Xem album', exact: true }).click();
      const viewer = page.getByRole('dialog', { name: 'Xem album', exact: true });
      const animated = viewer.locator('[data-visual-effect="float"]');
      await expect(animated).toBeVisible();
      const transform = await animated.evaluate((e) => (e as HTMLElement).style.transform);
      await expect
        .poll(() => animated.evaluate((e) => (e as HTMLElement).style.transform))
        .not.toBe(transform);
      await page.screenshot({ path: 'test-results/design-spaces-book-' + mobile + '.png' });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(animated).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
      await page.getByRole('button', { name: 'Đóng album', exact: true }).click();
      assert.deepEqual(errors, []);
      if (!mobile) {
        const response = await a.request.post(origin + '/api/albums/' + album.id + '/exports', {
          data: {
            idempotencyKey: crypto.randomUUID(),
            expectedRevision: album.revision,
            config: {
              seconds: 15,
              pageIds: [album.pages[0].id],
              opening: 'Ngày mình yêu nhau',
              closing: 'Còn nhiều ngày thương',
              musicId: 'none',
            },
          },
        });
        assert.equal(response.status(), 201, await response.text());
        let job = await response.json();
        const deadline = Date.now() + 180000;
        while (!['completed', 'failed', 'canceled'].includes(job.status) && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1000));
          job = await (await a.request.get(origin + '/api/exports/' + job.id)).json();
        }
        assert.equal(job.status, 'completed', job.error);
        const bytes = await (
          await a.request.get(origin + '/api/exports/' + job.id + '/download')
        ).body();
        assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
        await writeFile('test-results/design-spaces-recap.mp4', bytes);
      }
    } catch (error) {
      await page.screenshot({
        path: 'test-results/design-spaces-failure-' + mobile + '.png',
        fullPage: true,
      });
      throw error;
    } finally {
      await a.close();
      await b.close();
    }
  }
  console.log(
    'PASS design-spaces: private/common move and access denial; circular avatars and map crop; new decorations/symbols, custom counter and animated/reduced-motion viewer; actual MP4; desktop/mobile.',
  );
} finally {
  await browser.close();
}
