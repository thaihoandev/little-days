import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { templatePage } from '../packages/domain/templates.js';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1') throw Error('Fixture only');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
        viewport: { width, height: width < 400 ? 740 : 950 },
      }),
      page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await context.request.get(origin + '/api/session');
      for (const id of ['photobooth', 'wooden-clips', 'ticket-stubs']) {
        let album = await (
          await context.request.post(origin + '/api/albums', {
            data: { title: 'Fixture ' + id, templateId: id },
          })
        ).json();
        if (id === 'photobooth') {
          const response = await context.request.patch(origin + '/api/albums/' + album.id, {
            data: {
              expectedRevision: album.revision,
              content: { ...album, pages: [...album.pages, templatePage('wooden-clips')] },
            },
          });
          assert.ok(response.ok());
          album = await response.json();
        }
        await page.goto(origin + '/albums/' + album.id);
        await expect(
          page.getByRole('button', { name: 'Chia sẻ & Xuất ảnh Story', exact: true }),
        ).toBeVisible();
        await page.screenshot({ path: `test-results/priority-${id}-${width}.png` });
        if (id === 'photobooth') {
          await page.getByRole('button', { name: 'Chia sẻ & Xuất ảnh Story', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: 'Chia sẻ trang kỉ niệm', exact: true });
          for (const [format, w, h] of [
            ['Ảnh Story 9:16', 1080, 1920],
            ['Toàn bộ sổ · ảnh dài', 720, 1800],
          ] as const) {
            await dialog.getByRole('radio').filter({ hasText: format }).click();
            const download = page.waitForEvent('download');
            await dialog.getByRole('button', { name: 'Tải ảnh PNG', exact: true }).click();
            const file = await download;
            const bytes = await readFile((await file.path())!);
            const metadata = await sharp(bytes).metadata();
            assert.equal(metadata.width, w);
            assert.equal(metadata.height, h);
            const stats = await sharp(bytes).stats();
            assert.ok(
              stats.channels.some((c) => c.stdev > 5),
              'export contains artwork',
            );
            await file.saveAs(`test-results/priority-${w}-${h}-${width}.png`);
          }
          await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
        }
      }
      const milestone = await context.request.post(origin + '/api/journal', {
        data: {
          title: 'Hồ Gươm fixture',
          note: '',
          date: '2026-11-01',
          kind: 'memory',
          annual: false,
          location: { label: 'Hà Nội', latitude: 21.03, longitude: 105.85 },
        },
      });
      assert.equal(milestone.status(), 201, await milestone.text());
      await page.goto(origin + '/today');
      await page.getByRole('button', { name: /^Bản đồ \(/ }).click();
      await page.getByRole('tab', { name: 'Dấu chân Việt Nam', exact: true }).click();
      await expect(page.locator('.vietnam-svg-map > path')).toHaveCount(34);
      await expect(page.locator('.footprint-stats-card strong')).toHaveText('1');
      await expect(
        page.locator('.vietnam-svg-map > path[aria-label="Hà Nội"]'),
      ).not.toHaveAttribute('fill', '#e6decb');
      await page.locator('.vietnam-svg-map > path').first().focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.footprint-inspector-card')).toBeVisible();
      await expect(page.locator('.vietnam-svg-map > path[aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator('.vietnam-svg-map > path[role="button"]').first()).toHaveCSS(
        'outline-style',
        'none',
      );
      for (const [name, province] of [
        ['Q.đ. Hoàng Sa · Đà Nẵng', 'Đà Nẵng'],
        ['Q.đ. Trường Sa · Khánh Hòa', 'Khánh Hòa'],
      ]) {
        await page.getByRole('button', { name, exact: true }).click();
        await expect(page.locator('.footprint-inspector-card h4')).toHaveText(province);
      }
      assert.ok(
        await page
          .locator('.memory-map-dialog')
          .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
        'map dialog has no whole-body scrolling',
      );
      const before = await page.locator('.vietnam-svg-map').boundingBox();
      await page.locator('.footprint-sidebar').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      assert.deepEqual(
        await page.locator('.vietnam-svg-map').boundingBox(),
        before,
        'province scrolling does not move map',
      );
      await page.getByRole('button', { name: 'Q.đ. Hoàng Sa · Đà Nẵng', exact: true }).click();
      await page.screenshot({ path: `test-results/priority-map-${width}.png` });
      const mapDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Lưu ảnh bản đồ', exact: true }).click();
      const mapImage = await mapDownload;
      const mapMeta = await sharp(await readFile((await mapImage.path())!)).metadata();
      assert.equal(mapMeta.width, 800);
      assert.equal(mapMeta.height, 1100);
      await mapImage.saveAs(`test-results/priority-map-export-${width}.png`);
      await page.getByRole('button', { name: 'Đóng bản đồ kỉ niệm', exact: true }).click();
      await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
      await page.getByRole('button', { name: 'Cài đặt ứng dụng', exact: true }).click();
      await expect(
        page.getByRole('dialog', { name: 'Cài Little Days trên màn hình chính', exact: true }),
      ).toBeVisible();
      await expect
        .poll(async () =>
          page.evaluate(
            async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL || '',
          ),
        )
        .toContain('/sw.js');
      if (width === 1440) {
        let album = await (
          await context.request.post(origin + '/api/albums', {
            data: { title: 'Trendy render QA' },
          })
        ).json();
        album = await (
          await context.request.patch(origin + '/api/albums/' + album.id, {
            data: {
              expectedRevision: album.revision,
              content: {
                ...album,
                pages: ['photobooth', 'wooden-clips', 'ticket-stubs'].map((id) => templatePage(id)),
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
                pageIds: album.pages.map((p: { id: string }) => p.id),
                opening: 'Những ngày nhỏ',
                closing: 'Cùng giữ lại nhé',
                musicId: 'none',
              },
            },
          },
        );
        assert.equal(response.status(), 201);
        let job = await response.json();
        const deadline = Date.now() + 240000;
        while (!['completed', 'failed', 'canceled'].includes(job.status) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          job = await (await context.request.get(origin + '/api/exports/' + job.id)).json();
        }
        assert.equal(job.status, 'completed', job.error);
        const bytes = await (
          await context.request.get(origin + '/api/exports/' + job.id + '/download')
        ).body();
        assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
        await writeFile('test-results/trendy-templates.mp4', bytes);
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  'PASS priority flows: three templates and MP4, actual Story/long PNG, 34 regions and two island clusters, contour focus, fixed map dialog, install fallback desktop/mobile.',
);
