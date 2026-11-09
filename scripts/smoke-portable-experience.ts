import { chromium, expect, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  todayIn,
  albumContentSchema,
  createAlbumContent,
  createPage,
} from '../packages/domain/index.js';
import { privateSpaceId } from '../apps/api/src/journal-privacy.js';
const origin = process.env.SMOKE_UI_ORIGIN!,
  root = process.env.AUTH_UI_DATA_DIR!;
if (
  !origin ||
  new URL(origin).hostname !== '127.0.0.1' ||
  !path.resolve(root).startsWith(path.resolve('test-results') + path.sep)
)
  throw Error('Fixture only');
await mkdir('test-results/portable', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
async function register(context: BrowserContext) {
  const email = crypto.randomUUID() + '@fixture.test';
  await context.request.get(origin + '/api/session');
  assert.equal(
    (
      await context.request.post(origin + '/api/auth/register', {
        data: { email, password: 'Fixture-password-123!' },
      })
    ).status(),
    201,
  );
  let token = '';
  for (const file of await readdir(path.join(root, 'mail'))) {
    const mail = JSON.parse(await readFile(path.join(root, 'mail', file), 'utf8'));
    if (mail.to === email)
      token =
        new URLSearchParams(new URL(mail.text.match(/http[^\s]+/)[0]).hash.slice(1)).get('token') ||
        '';
  }
  assert.equal(
    (await context.request.post(origin + '/api/auth/verify-email', { data: { token } })).status(),
    201,
  );
  return { email, ...(await (await context.request.get(origin + '/api/session')).json()) };
}
const measurements: unknown[] = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
        hasTouch: width < 500,
      }),
      peer = await browser.newContext();
    try {
      const actor = await register(context),
        partner = await register(peer),
        page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => {
        const qa = window as unknown as { qaLongTasks: number[] };
        qa.qaLongTasks = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) qa.qaLongTasks.push(e.duration);
        }).observe({ type: 'longtask', buffered: true });
      });
      await page.goto(origin + '/today', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('region', { name: 'Kỉ niệm đầu tiên' })).toBeVisible();
      await page.getByRole('button', { name: 'Để sau', exact: true }).click();
      await page.reload();
      await expect(page.getByRole('region', { name: 'Kỉ niệm đầu tiên' })).toHaveCount(0);
      const grant = await (
        await context.request.post(origin + '/api/timeline-sharing', {
          data: { email: partner.email },
        })
      ).json();
      assert.equal(
        (
          await peer.request.patch(origin + '/api/timeline-sharing/' + grant.id, {
            data: { expectedRevision: 0, action: 'accept' },
          })
        ).status(),
        200,
      );
      const today = todayIn('Asia/Ho_Chi_Minh');
      const rhythmUrl = origin + '/api/together/' + actor.id + '/rhythm';
      assert.equal((await (await context.request.get(rhythmUrl)).json()).memberDays, 0);
      const content = {
        date: today,
        title: 'Chuyện riêng tiếng Việt',
        note: 'Chỉ riêng mình',
        kind: 'memory',
        annual: false,
        timelineId: privateSpaceId(actor.id),
      };
      const personal = await (
        await context.request.post(origin + '/api/journal', { data: content })
      ).json();
      const shared = await (
        await peer.request.post(origin + '/api/journal', {
          data: { ...content, title: 'Chuyện chung fixture', timelineId: actor.id },
        })
      ).json();
      const partial = await (await context.request.get(rhythmUrl)).json();
      assert.equal(partial.memberDays, 1);
      assert.equal(partial.completedDays, 0);
      await page.goto(origin + '/today');
      await expect(page.locator('.hourglass-stage')).toHaveAttribute('data-progress', '7');
      await expect(page.locator('.rhythm-evidence')).toContainText('1/14');
      await page.screenshot({
        path: `test-results/portable/hourglass-${width}.png`,
        fullPage: true,
      });
      const album = await (
        await context.request.post(origin + '/api/albums', { data: { title: 'Sổ kiểm chứng PDF' } })
      ).json();
      const photo = await sharp({
        create: { width: 600, height: 800, channels: 3, background: '#a32e4b' },
      })
        .png()
        .toBuffer();
      assert.equal(
        (
          await context.request.post(origin + '/api/albums/' + album.id + '/assets', {
            multipart: { file: { name: 'fixture.png', mimeType: 'image/png', buffer: photo } },
          })
        ).status(),
        201,
      );
      const uploaded = await (await context.request.get(origin + '/api/albums/' + album.id)).json();
      const full = albumContentSchema.parse(uploaded);
      full.memories = [
        {
          id: crypto.randomUUID(),
          title: 'Kỉ niệm trong sổ',
          date: today,
          body: 'Lời trong phần kỉ niệm của album',
          featured: false,
          assetId: uploaded.assets[0].id,
        },
      ];
      const photoElement = full.pages[0].elements.find((e) => e.type === 'image');
      if (photoElement) photoElement.assetId = uploaded.assets[0].id;
      const second = structuredClone(full.pages[0]);
      second.id = crypto.randomUUID();
      second.title = 'Trang thứ hai';
      second.elements = second.elements.map((e) => ({ ...e, id: crypto.randomUUID() }));
      full.pages.push(second);
      assert.equal(
        (
          await context.request.patch(origin + '/api/albums/' + album.id, {
            data: { expectedRevision: uploaded.revision, content: full },
          })
        ).status(),
        200,
      );
      const archive = await (await context.request.get(origin + '/api/account/archive')).json();
      assert.equal(archive.journal.length, 1);
      assert.equal(archive.journal[0].id, personal.id);
      assert.ok(!JSON.stringify(archive).includes(shared.id));
      assert.equal((await peer.request.get(origin + '/api/albums/' + album.id)).status(), 404);
      await page.goto(origin + '/albums/' + album.id);
      await page.getByRole('button', { name: 'Trang trí', exact: true }).click();
      await page.getByRole('button', { name: 'Thêm tiêu đề', exact: true }).click();
      const text = page.getByLabel('Nội dung', { exact: true });
      await text.fill('Thương một ngày bình thường — tiếng Việt');
      await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible();
      // Inject a real device cleanup failure after a successful server write.
      await page.evaluate(() => {
        const original = Storage.prototype.removeItem;
        (window as any).qaRemove = original;
        Storage.prototype.removeItem = function (key) {
          if (key.startsWith('scrapbook-draft:'))
            throw new DOMException('Fixture blocked', 'SecurityError');
          return original.call(this, key);
        };
      });
      await text.fill('Đã lưu máy chủ dù storage bị chặn');
      await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('Đã lưu máy chủ');
      await page.evaluate(() => {
        Storage.prototype.removeItem = (window as any).qaRemove;
      });
      await page.getByRole('button', { name: 'Chia sẻ & Xuất ảnh Story', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Chia sẻ trang kỉ niệm', exact: true });
      await dialog.getByRole('radio').filter({ hasText: 'Cuốn sổ PDF' }).click();
      const pdfEvent = page.waitForEvent('download');
      await dialog.getByRole('button', { name: 'Tải cuốn sổ PDF', exact: true }).click();
      const pdf = await pdfEvent;
      await pdf.saveAs(`test-results/portable/album-${width}.pdf`);
      assert.ok(
        (await readFile((await pdf.path())!)).subarray(0, 8).toString().startsWith('%PDF-1.4'),
      );
      await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
      await page.goto(origin + '/today');
      await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
      const zipEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Tải dữ liệu cá nhân (.zip)', exact: true }).click();
      const zip = await zipEvent;
      await zip.saveAs(`test-results/portable/archive-${width}.zip`);
      assert.equal((await readFile((await zip.path())!)).readUInt32LE(), 0x04034b50);
      const zipBytes = await readFile((await zip.path())!);
      let position = 0,
        markdown = '';
      while (zipBytes.readUInt32LE(position) === 0x04034b50) {
        const size = zipBytes.readUInt32LE(position + 18),
          nameSize = zipBytes.readUInt16LE(position + 26),
          extra = zipBytes.readUInt16LE(position + 28),
          start = position + 30 + nameSize + extra;
        if (zipBytes.subarray(position + 30, position + 30 + nameSize).toString() === 'memories.md')
          markdown = zipBytes.subarray(start, start + size).toString();
        position = start + size;
      }
      assert.ok(markdown.includes('Lời trong phần kỉ niệm của album'));
      await page.getByRole('button', { name: 'Đóng', exact: true }).click();
      await page.goto(origin + '/timeline');
      await page
        .getByLabel('Chọn dòng thời gian', { exact: true })
        .selectOption(privateSpaceId(actor.id));
      await expect(page.locator('[data-reading-id="' + personal.id + '"]')).toBeVisible();
      await page.getByRole('button', { name: 'Tùy chọn ' + personal.title, exact: true }).click();
      await page.getByRole('button', { name: 'Thêm vào lịch điện thoại', exact: true }).click();
      const icsEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Tải sự kiện (.ics)', exact: true }).click();
      const ics = await icsEvent;
      await ics.saveAs(`test-results/portable/event-${width}.ics`);
      const calendar = await readFile((await ics.path())!, 'utf8');
      assert.ok(calendar.includes('DTSTART;VALUE=DATE:' + today.replaceAll('-', '')));
      assert.ok(!calendar.includes('Chỉ riêng mình'));
      // Re-enter the same history entry after loading more than one page.
      let anchorId = '';
      for (let i = 0; i < 25; i++) {
        const day = new Date(today + 'T00:00:00Z');
        day.setUTCDate(day.getUTCDate() - i);
        const created = await context.request.post(origin + '/api/journal', {
          data: {
            ...content,
            title: 'Điểm đọc fixture ' + i,
            date: day.toISOString().slice(0, 10),
          },
        });
        assert.equal(created.status(), 201);
        anchorId = (await created.json()).id;
      }
      await page.getByLabel('Tìm dấu mốc', { exact: true }).fill('Điểm đọc fixture');
      await expect(page.locator('[data-reading-id]')).toHaveCount(20);
      await page.getByRole('button', { name: 'Xem thêm dấu mốc', exact: true }).click();
      await expect(page.locator('[data-reading-id]')).toHaveCount(25);
      await page.mouse.wheel(0, 1);
      const anchor = page.locator('[data-reading-id="' + anchorId + '"]');
      await anchor.scrollIntoViewIfNeeded();
      const beforeY = (await anchor.boundingBox())!.y;
      await page.getByRole('button', { name: /^Album của mình/ }).click();
      await page.goBack();
      await expect(page.getByLabel('Tìm dấu mốc', { exact: true })).toHaveValue('Điểm đọc fixture');
      await expect(page.locator('[data-reading-id]')).toHaveCount(25);
      await expect
        .poll(async () => Math.abs((await anchor.boundingBox())!.y - beforeY))
        .toBeLessThan(12);
      await page.screenshot({ path: `test-results/portable/reading-${width}.png` });
      await page.goto(origin + '/together?space=' + actor.id + '&tab=questions');
      await page.getByText('Chủ đề của hai đứa', { exact: true }).click();
      await page.getByLabel('Dự định', { exact: true }).uncheck();
      await page.getByRole('button', { name: 'Lưu chủ đề từ ngày mai', exact: true }).click();
      await expect(page.getByText(/Đợt chọn gần nhất/)).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      // Compare the former synchronous storage path and IndexedDB on the same large fixture.
      const big = createAlbumContent();
      big.pages = Array.from({ length: 20 }, () => {
        const p = createPage('polaroid');
        p.elements = Array.from({ length: 50 }, (_, i) => ({
          ...p.elements[0],
          id: crypto.randomUUID(),
          type: 'text' as const,
          text: 'Một ngày bình thường '.repeat(30),
          assetId: null,
          x: i,
          y: i,
        }));
        return p;
      });
      const draftMetrics = await page.evaluate(
        async ({ big, actor }) => {
          const modulePath = '/src/draft-store.ts',
            drafts = await import(modulePath),
            scope = `scrapbook-draft:${actor}:benchmark`;
          const start = performance.now(),
            serialized = JSON.stringify(big),
            serializationMs = performance.now() - start;
          const syncStart = performance.now();
          localStorage.setItem(scope, serialized);
          const legacyWriteMs = performance.now() - syncStart;
          localStorage.removeItem(scope);
          const draft = {
            id: scope + ':branch:fixture',
            scope,
            schemaVersion: 1,
            baseRevision: 0,
            at: Date.now(),
            content: big,
          };
          const asyncStart = performance.now();
          await drafts.writeDeviceDraft(draft);
          const durableWriteMs = performance.now() - asyncStart;
          await drafts.removeDeviceDraft(draft.id);
          return { bytes: serialized.length * 2, serializationMs, legacyWriteMs, durableWriteMs };
        },
        { big, actor: actor.id },
      );
      // Revoke access and ensure neither metadata nor old media can be read again.
      await context.request.delete(origin + '/api/timeline-sharing/' + grant.id, {
        data: { expectedRevision: 1 },
      });
      assert.equal((await peer.request.get(rhythmUrl)).status(), 404);
      assert.deepEqual(errors, []);
      measurements.push({
        width,
        draftMetrics,
        localOnly: true,
        resources: await page.evaluate(() =>
          performance.getEntriesByType('resource').map((e) => ({
            type: (e as PerformanceResourceTiming).initiatorType,
            duration: e.duration,
            bytes: (e as PerformanceResourceTiming).transferSize,
          })),
        ),
        longTasks: await page.evaluate(() => (window as any).qaLongTasks),
      });
    } finally {
      await context.close();
      await peer.close();
    }
  }
  await writeFile('test-results/portable/measurements.json', JSON.stringify(measurements, null, 2));
  console.log(
    'PASS portable experience: desktop/mobile real PDF/ZIP/ICS downloads, scoped data, partial rhythm, storage fault, first-memory and topics.',
  );
} finally {
  await browser.close();
}
