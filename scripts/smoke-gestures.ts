import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { type Album, element } from '../packages/domain/index.js';

const origin = process.env.SMOKE_UI_ORIGIN;
if (!origin || new URL(origin).hostname !== '127.0.0.1' || !process.env.BROWSER_EXECUTABLE)
  throw new Error('Run via npm run test:gestures with an isolated local fixture.');
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
try {
  for (const mobile of [true, false]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        hasTouch: true,
        isMobile: mobile,
      }),
      page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await context.request.get(origin + '/api/session');
      let album: Album = await (
        await context.request.post(origin + '/api/albums', {
          data: { title: 'Touch QA ' + crypto.randomUUID() },
        })
      ).json();
      album.pages[0].elements = [
        element('text', {
          x: 140,
          y: 200,
          width: 300,
          height: 100,
          text: 'Chạm và giữ bố cục',
          rotation: 0,
        }),
        element('text', {
          x: 140,
          y: 400,
          width: 300,
          height: 100,
          text: 'Phần tử khóa',
          locked: true,
          rotation: 0,
        }),
      ];
      const { id, revision, assets, createdAt, updatedAt, schemaVersion, ...content } = album;
      assert.equal(
        (
          await context.request.patch(origin + '/api/albums/' + id, {
            data: { expectedRevision: revision, content },
          })
        ).status(),
        200,
      );
      const read = async (): Promise<Album> =>
        await (await context.request.get(origin + '/api/albums/' + id)).json();
      const before = await read();
      await page.goto(origin);
      await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
      const sheet = page.locator('.canvas-sheet');
      await expect(sheet.locator('canvas')).toBeVisible();
      await sheet.scrollIntoViewIfNeeded();
      const reset = page.getByRole('button', { name: 'Đặt lại mức thu phóng' });
      await expect(page.getByRole('button', { name: 'Hoàn tác', exact: true })).toBeDisabled();
      const session = await context.newCDPSession(page);
      const touch = async (
        type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
        points: { x: number; y: number; id: number }[],
      ) =>
        session.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: points.map((p) => ({ ...p, radiusX: 3, radiusY: 3, force: 1 })),
        });
      const center = async () => {
        const box = await sheet.boundingBox();
        assert.ok(box);
        const viewport = page.viewportSize()!;
        return {
          x: Math.max(65, Math.min(viewport.width - 65, box.x + box.width / 2)),
          y: Math.max(100, Math.min(viewport.height - 100, box.y + box.height / 3)),
        };
      };
      const pinch = async (to: number) => {
        await sheet.scrollIntoViewIfNeeded();
        const c = await center();
        await touch('touchStart', [
          { x: c.x - 35, y: c.y, id: 1 },
          { x: c.x + 35, y: c.y, id: 2 },
        ]);
        await touch('touchMove', [
          { x: c.x - to, y: c.y, id: 1 },
          { x: c.x + to, y: c.y, id: 2 },
        ]);
        await touch('touchEnd', []);
      };
      await pinch(60);
      await expect(reset).toHaveText('150%');
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        'Zoom must scroll inside the canvas, not widen the page.',
      );
      await page.screenshot({
        path: 'test-results/gestures-zoom-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      await reset.click();
      await expect(reset).toHaveText('100%');
      await pinch(10);
      await expect(reset).toHaveText('60%');
      await reset.click();
      await expect(reset).toHaveText('100%');
      // Start a real one-finger element drag, then switch to two-finger zoom: no document write.
      await sheet.scrollIntoViewIfNeeded();
      let box = await sheet.boundingBox();
      assert.ok(box);
      const point = { x: box.x + (220 * box.width) / 720, y: box.y + (240 * box.height) / 900 };
      await touch('touchStart', [{ ...point, id: 1 }]);
      await touch('touchMove', [{ x: point.x + 18, y: point.y + 10, id: 1 }]);
      await touch('touchStart', [
        { x: point.x + 18, y: point.y + 10, id: 1 },
        { x: point.x + 78, y: point.y + 10, id: 2 },
      ]);
      await touch('touchMove', [
        { x: point.x + 5, y: point.y + 10, id: 1 },
        { x: point.x + 95, y: point.y + 10, id: 2 },
      ]);
      await touch('touchEnd', [{ x: point.x + 5, y: point.y + 10, id: 1 }]);
      await touch('touchMove', [{ x: point.x + 25, y: point.y + 15, id: 1 }]);
      await touch('touchEnd', []);
      await page.waitForTimeout(1500);
      assert.deepEqual((await read()).pages, before.pages);
      assert.equal((await read()).revision, before.revision);
      await expect(page.getByRole('button', { name: 'Hoàn tác', exact: true })).toBeDisabled();
      await reset.click();
      await sheet.scrollIntoViewIfNeeded();
      // Cancelling a pinch releases gesture state; the next ordinary touch drag must still save.
      const c = await center();
      await touch('touchStart', [
        { x: c.x - 30, y: c.y, id: 3 },
        { x: c.x + 30, y: c.y, id: 4 },
      ]);
      await touch('touchCancel', []);
      box = await sheet.boundingBox();
      assert.ok(box);
      const from = { x: box.x + (220 * box.width) / 720, y: box.y + (240 * box.height) / 900 };
      await touch('touchStart', [{ ...from, id: 5 }]);
      await touch('touchMove', [{ x: from.x + 20, y: from.y + 12, id: 5 }]);
      await touch('touchMove', [{ x: from.x + 28, y: from.y + 18, id: 5 }]);
      await touch('touchEnd', []);
      await expect
        .poll(async () => (await read()).revision, { timeout: 15000 })
        .toBeGreaterThan(before.revision);
      const after = await read();
      assert.notEqual(after.pages[0].elements[0].x, before.pages[0].elements[0].x);
      assert.deepEqual(after.pages[0].elements[1], before.pages[0].elements[1]);
      await page.reload();
      await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
      await expect(reset).toHaveText('100%');
      await expect(sheet.locator('canvas')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({
        path: 'test-results/gestures-' + (mobile ? 'mobile' : 'desktop') + '.png',
        fullPage: true,
      });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS gestures: mobile/desktop pinch bounds and reset, no persisted zoom or accidental edits, drag-to-pinch cancellation, touchcancel recovery, one-finger drag persistence and locked elements.',
  );
} finally {
  await browser.close();
}
