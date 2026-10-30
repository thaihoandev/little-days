import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import type { Album, JobView } from '../packages/domain/index.js';
import { writeFile } from 'node:fs/promises';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1') throw new Error('Use isolated QA runner');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1600, height: 1100 },
      }),
      page = await context.newPage(),
      errors: string[] = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await context.request.get(origin + '/api/session');
      const initial: Album = await (
        await context.request.post(origin + '/api/albums', {
          data: { title: 'Ảnh trong mẫu ' + mobile, templateId: 'sunset' },
        })
      ).json();
      const read = async (): Promise<Album> =>
        (await context.request.get(origin + '/api/albums/' + initial.id)).json();
      const save = async () => {
        await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible({
          timeout: 20000,
        });
        return read();
      };
      await page.goto(origin);
      await page.getByRole('button', { name: 'Dòng thời gian', exact: true }).click();
      await page.getByRole('button', { name: 'Sửa tiêu đề và mô tả', exact: true }).click();
      await page
        .getByLabel('Tiêu đề dòng thời gian', { exact: true })
        .fill('Chuyện nhiều màu của mình');
      await page
        .getByLabel('Mô tả dòng thời gian', { exact: true })
        .fill('Những ngày thương được giữ lại.');
      await page.getByRole('button', { name: 'Lưu tiêu đề timeline', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Chuyện nhiều màu của mình', exact: true }),
      ).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: 'Dòng thời gian', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Chuyện nhiều màu của mình', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: /^Album của mình/ }).click();
      await page.getByRole('button', { name: 'Mở ' + initial.title, exact: true }).click();
      await page.getByRole('button', { name: 'Đổi tên sổ', exact: true }).click();
      await page
        .getByLabel('Tên sổ trên header', { exact: true })
        .fill('Sổ có thể sửa ảnh ' + mobile);
      await page.getByLabel('Tên sổ trên header', { exact: true }).press('Enter');
      assert.equal((await save()).title, 'Sổ có thể sửa ảnh ' + mobile);
      await page.getByRole('button', { name: 'Lớp', exact: true }).click();
      await page
        .getByRole('checkbox', { name: 'Chọn lớp ngày mình muốn giữ', exact: true })
        .first()
        .click();
      await page.getByRole('button', { name: 'Chỉnh / thay ảnh trong khung', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Chỉnh ảnh trong khung', exact: true });
      await expect(dialog).toBeVisible();
      const before = await read(),
        selectedId = before.pages[0].elements.filter((e) => e.type === 'image').at(-1)!.id;
      const photo = await sharp({
        create: { width: 1200, height: 500, channels: 3, background: '#e77b88' },
      })
        .composite([
          {
            input: await sharp({
              create: { width: 500, height: 500, channels: 3, background: '#5f87ce' },
            })
              .png()
              .toBuffer(),
            left: 700,
            top: 0,
          },
        ])
        .png()
        .toBuffer();
      await dialog
        .getByLabel('Tải ảnh thay khung', { exact: true })
        .setInputFiles({ name: 'two-colors.png', mimeType: 'image/png', buffer: photo });
      await expect(dialog.getByRole('button', { name: 'Áp dụng ảnh', exact: true })).toBeEnabled({
        timeout: 20000,
      });
      const zoom = dialog.getByLabel('Phóng ảnh trong khung', { exact: true });
      await zoom.fill('2');
      await zoom.dispatchEvent('input');
      const surface = dialog.getByRole('img', { name: 'Kéo để dịch ảnh trong khung', exact: true });
      await surface.scrollIntoViewIfNeeded();
      const box = (await surface.boundingBox())!;
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4, { steps: 8 });
      await page.mouse.up();
      await page.screenshot({
        path: 'test-results/photo-editor-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      const footer = (await dialog
        .getByRole('button', { name: 'Áp dụng ảnh', exact: true })
        .boundingBox())!;
      assert.ok(footer.y >= 0 && footer.y + footer.height <= (mobile ? 844 : 1100));
      await dialog.getByRole('button', { name: 'Áp dụng ảnh', exact: true }).click();
      let current = await save();
      const changed = current.pages[0].elements.find((e) => e.id === selectedId)!;
      assert.ok(changed.assetId && !changed.assetId.startsWith('demo-'));
      assert.ok(changed.crop.width < 1);
      const original = before.pages[0].elements.find((e) => e.id === selectedId)!;
      for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const)
        assert.equal(changed[key], original[key]);
      await expect(page.getByLabel('Giữ tỉ lệ khi kéo khung', { exact: true })).not.toBeChecked();
      await page.getByLabel('Giữ tỉ lệ khi kéo khung', { exact: true }).check();
      await page.getByLabel('Giữ tỉ lệ khi kéo khung', { exact: true }).uncheck();
      if (!mobile) {
        const resize = async (proportional = false) => {
          await page.locator('.canvas-sheet canvas').scrollIntoViewIfNeeded();
          const box = (await page.locator('.canvas-sheet').boundingBox())!;
          const handle = await page.evaluate((proportional) => {
            const k = (window as any).Konva;
            return k.stages[0]
              .findOne(proportional ? '.bottom-right' : '.middle-right')
              .getAbsolutePosition();
          }, proportional);
          await page.mouse.move(box.x + handle.x, box.y + handle.y);
          await page.mouse.down();
          await page.mouse.move(box.x + handle.x + 40, box.y + handle.y, { steps: 12 });
          await page.mouse.up();
          return (await save()).pages[0].elements.find((e) => e.id === selectedId)!;
        };
        const resized = await resize();
        assert.ok(Math.abs(resized.width - changed.width) > 10);
        assert.ok(
          Math.abs(resized.height - changed.height) < 15,
          'Free resize should keep the other axis stable',
        );
        await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
        await save();
        await page.getByLabel('Giữ tỉ lệ khi kéo khung', { exact: true }).check();
        const proportional = await resize(true);
        assert.ok(
          Math.abs(proportional.width / proportional.height - changed.width / changed.height) <
            0.02,
        );
        await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
        await save();
      }
      await page.getByRole('button', { name: 'Chỉnh / thay ảnh trong khung', exact: true }).click();
      await dialog.getByRole('button', { name: 'Dùng ảnh Minh họa 2', exact: true }).click();
      await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
      assert.equal(
        (await read()).pages[0].elements.find((e) => e.id === selectedId)!.assetId,
        changed.assetId,
      );
      await page.reload();
      await page
        .getByRole('button', { name: 'Mở Sổ có thể sửa ảnh ' + mobile, exact: true })
        .click();
      await page.getByRole('button', { name: 'Phối màu Bầu trời đêm', exact: true }).click();
      current = await save();
      assert.equal(current.pages[0].background, '#192c50');
      await page.getByRole('button', { name: 'Xem album', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Xem album', exact: true })).toBeVisible();
      await page.screenshot({
        path: 'test-results/color-book-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      if (!mobile) {
        const response = await context.request.post(
          origin + '/api/albums/' + current.id + '/exports',
          {
            data: {
              expectedRevision: current.revision,
              idempotencyKey: crypto.randomUUID(),
              config: {
                seconds: 15,
                pageIds: [current.pages[0].id],
                sceneDurations: { [current.pages[0].id]: 2 },
                opening: 'Những ngày nhiều màu',
                closing: 'Ảnh vừa khung, chuyện vừa thương',
                musicId: 'none',
              },
            },
          },
        );
        assert.equal(response.status(), 201);
        let job: JobView = await response.json();
        const deadline = Date.now() + 180000;
        while (!['completed', 'failed', 'canceled'].includes(job.status) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          job = await (await context.request.get(origin + '/api/exports/' + job.id)).json();
        }
        assert.equal(job.status, 'completed', job.error);
        const bytes = await (
          await context.request.get(origin + '/api/exports/' + job.id + '/download')
        ).body();
        assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
        await writeFile('test-results/editor-upgrade-recap.mp4', bytes);
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      await page.screenshot({ path: 'test-results/editor-upgrade-failure.png', fullPage: true });
      await writeFile('test-results/editor-upgrade-failure.html', await page.content());
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS editor upgrade: header rename, timeline heading persistence, in-frame upload/zoom/drag/apply/cancel, unchanged frame geometry, color palettes and desktop/mobile dialogs.',
  );
} finally {
  await browser.close();
}
