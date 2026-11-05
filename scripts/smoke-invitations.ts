import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { audioFixture } from '../tests/audio-fixture.js';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1') throw Error('Isolated QA runner only');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
try {
  for (const width of [1600, 390, 320]) {
    const owner = await browser.newContext({
        viewport: { width, height: width < 500 ? 844 : 1050 },
      }),
      visitor = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1050 } });
    const p = await owner.newPage(),
      v = await visitor.newPage(),
      errors: string[] = [];
    await visitor.addInitScript(`{
      const play = HTMLMediaElement.prototype.play;
      let attempted = false;
      HTMLMediaElement.prototype.play = function() {
        if (!this.controls && !attempted) { attempted = true; return Promise.reject(new DOMException('Fixture autoplay blocked', 'NotAllowedError')); }
        return play.call(this);
      };
    }`);
    p.on('pageerror', (e) => errors.push(e.message));
    v.on('pageerror', (e) => errors.push(e.message));
    try {
      await p.goto(origin + '/albums');
      await p.getByRole('button', { name: 'Tạo album', exact: true }).click();
      const modal = p.getByRole('dialog', { name: 'Bắt đầu một cuốn sổ', exact: true });
      await modal.getByRole('button', { name: 'Thiệp mời', exact: true }).click();
      await expect(modal.locator('.template-picker > button')).toHaveCount(4);
      await modal.getByRole('button', { name: 'Hẹn ngày yêu thương', exact: true }).click();
      await modal.getByLabel('Tên cuốn sổ', { exact: true }).fill('Một lời mời nhỏ');
      await modal.getByRole('button', { name: 'Tạo cuốn sổ của mình', exact: true }).click();
      await expect(p).toHaveURL(/\/albums\/[\w-]+$/);
      const id = new URL(p.url()).pathname.split('/').at(-1)!;
      const read = async () => (await owner.request.get(origin + '/api/albums/' + id)).json();
      assert.equal((await read()).documentKind, 'invitation');
      await p.getByRole('button', { name: 'Thiết lập', exact: true }).click();
      await p
        .locator('.invitation-outline')
        .getByRole('button')
        .filter({ hasText: 'Minh & An' })
        .click();
      const text = p.getByLabel('Nội dung chữ trong sổ', { exact: true });
      await text.fill('An và Bình mời bạn');
      await text.press('Home');
      await text.press('ArrowRight');
      await text.pressSequentially(' thương');
      await expect(text).toBeFocused();
      await p.getByRole('button', { name: 'Viết xong rồi', exact: true }).click();
      await p.getByLabel('Gáy sổ khi chia sẻ', { exact: true }).selectOption('spiral');
      await p.getByLabel('Chuyển trang khi chia sẻ', { exact: true }).selectOption('slide');
      await p.getByLabel('Hiệu ứng bản chia sẻ', { exact: true }).selectOption('hearts');
      await p.getByLabel('Nhạc bản chia sẻ', { exact: true }).selectOption('warm-piano');
      await p.getByRole('button', { name: 'Xem album', exact: true }).click();
      const ownerViewer = p.getByRole('dialog', { name: 'Xem album', exact: true });
      await expect(ownerViewer.getByLabel('Phong cách cuốn sổ')).toHaveValue('spiral');
      await expect(
        ownerViewer.getByRole('button', { name: 'Tắt nhạc', exact: true }),
      ).toBeVisible();
      await expect
        .poll(() => ownerViewer.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
        .toBeGreaterThan(0);
      await ownerViewer.getByRole('button', { name: 'Tắt nhạc', exact: true }).click();
      await p.getByRole('button', { name: 'Đóng album', exact: true }).click();
      await p
        .getByLabel('Tải nhạc bản chia sẻ', { exact: true })
        .setInputFiles({ name: 'fixture-tone.wav', mimeType: 'audio/wav', buffer: audioFixture() });
      await expect(p.getByLabel('Nhạc bản chia sẻ').locator('option')).toContainText([
        'Không nhạc',
        'Chuông gió dịu dàng',
      ]);
      await expect
        .poll(async () =>
          (await owner.request.get(origin + `/api/albums/${id}/audio`))
            .json()
            .then((a) => a.length),
        )
        .toBe(1);
      const audio = (await (await owner.request.get(origin + `/api/albums/${id}/audio`)).json())[0];
      await p.getByLabel('Nhạc bản chia sẻ', { exact: true }).selectOption(audio.id);
      await p.getByLabel('Tên nhạc bản chia sẻ', { exact: true }).fill('Lời mời của hai đứa');
      await p.getByLabel('Bắt đầu nhạc bản chia sẻ', { exact: true }).fill('2');
      await p.getByLabel('Kết thúc nhạc bản chia sẻ', { exact: true }).fill('4');
      await p.getByRole('button', { name: 'Chia sẻ', exact: true }).click();
      const link = await p.getByLabel('Link chia sẻ', { exact: true }).inputValue();
      await v.goto(link);
      const viewer = v.getByRole('dialog', { name: 'Xem album', exact: true });
      await expect(viewer).toBeVisible();
      await expect(viewer.locator('input,select,textarea')).toHaveCount(0);
      await expect(viewer.locator('.book-shell')).toHaveClass(/book-spiral/);
      await expect(viewer.locator('.ambience-hearts')).toBeVisible();
      await expect(viewer.locator('audio')).toHaveAttribute('preload', 'auto');
      await expect(viewer.locator('audio')).toHaveAttribute('aria-label', 'Lời mời của hai đứa');
      assert.equal(await viewer.locator('audio').evaluate((a: HTMLAudioElement) => a.paused), true);
      await viewer.getByRole('button', { name: 'Bật nhạc', exact: true }).click();
      await expect
        .poll(() => viewer.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
        .toBeGreaterThan(0);
      await expect
        .poll(() => viewer.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
        .toBeGreaterThanOrEqual(2);
      await new Promise((resolve) => setTimeout(resolve, 2600));
      const clipTime = await viewer
        .locator('audio')
        .evaluate((a: HTMLAudioElement) => a.currentTime);
      assert.ok(
        clipTime >= 2 && clipTime <= 4.2,
        'selected clip loops without replaying the intro: ' + clipTime,
      );
      await viewer.getByRole('button', { name: 'Tắt nhạc', exact: true }).click();
      await expect
        .poll(() =>
          viewer
            .locator('.book-paper [data-visual-effect]')
            .first()
            .evaluate((e) => Number((e.parentElement as HTMLElement).style.opacity)),
        )
        .toBe(1);
      assert.ok(
        await viewer.evaluate(
          (e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1,
        ),
      );
      await v.screenshot({ path: `test-results/invitation-share-${width}.png` });
      await p.getByLabel('Cách đọc bản chia sẻ', { exact: true }).selectOption('scroll');
      await expect.poll(async () => (await read()).presentation.readingMode).toBe('scroll');
      await v.reload();
      await expect(viewer.locator('.scroll-story')).toBeVisible();
      await expect
        .poll(() =>
          viewer
            .locator('.scroll-story [data-visual-effect]')
            .first()
            .evaluate((node) => Number((node.parentElement as HTMLElement).style.opacity)),
        )
        .toBe(1);
      const beforeAtmosphere = await viewer.locator('.viewer-ambience').boundingBox();
      await viewer.locator('.viewer-page').evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      const afterAtmosphere = await viewer.locator('.viewer-ambience').boundingBox();
      assert.ok(
        beforeAtmosphere && afterAtmosphere && Math.abs(beforeAtmosphere.y - afterAtmosphere.y) < 1,
      );
      assert.equal(
        await viewer
          .locator('.viewer-ambience')
          .evaluate((node) => getComputedStyle(node).pointerEvents),
        'none',
      );
      await v.screenshot({ path: `test-results/invitation-scroll-atmosphere-${width}.png` });
      await v.emulateMedia({ reducedMotion: 'reduce' });
      await expect(viewer.locator('.viewer-ambience')).toHaveCount(0);
      await v.setViewportSize({ width: 640, height: 360 });
      assert.ok(
        await viewer.evaluate(
          (e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1,
        ),
      );
      await owner.request.delete(origin + `/api/albums/${id}/share`);
      const audioPath = await viewer.locator('audio').getAttribute('src');
      assert.equal((await visitor.request.get(origin + audioPath)).status(), 404);
      await v.reload();
      await expect(
        v.getByRole('heading', { name: 'Chưa mở được cuốn sổ này', exact: true }),
      ).toBeVisible();
      await p.goto(origin + '/albums/' + id);
      await p.getByRole('button', { name: 'Trang trí', exact: true }).click();
      const search = p.getByLabel('Tìm trang trí', { exact: true });
      const boxes = await p.evaluate(() => {
        const input = document.querySelector('.decoration-search')!.getBoundingClientRect();
        const tags = document.querySelector('.decoration-collections')!.getBoundingClientRect();
        return { gap: tags.top - input.bottom, inputHeight: input.height };
      });
      assert.ok(boxes.gap >= 10 && boxes.inputHeight >= 42, JSON.stringify(boxes));
      await search.fill('không có mẫu');
      await expect(p.locator('.decoration-gallery > button')).toHaveCount(0);
      await search.fill('');
      await expect.poll(() => p.locator('.text-symbols img[data-normalized=true]').count()).toBe(6);
      const sizes = await p
        .locator('.symbol-groups .sticker-grid > button,.text-symbols > button')
        .evaluateAll((nodes) =>
          nodes.map((n) => {
            const b = n.getBoundingClientRect(),
              image = n.querySelector('img')!.getBoundingClientRect();
            return {
              height: Math.round(b.height),
              width: Math.round(b.width),
              imageHeight: Math.round(image.height),
              imageWidth: Math.round(image.width),
              centered: Math.abs(image.left + image.width / 2 - b.left - b.width / 2) < 1,
            };
          }),
        );
      assert.equal(sizes.length, 18);
      assert.ok(
        sizes.every(
          (s) => s.height === 56 && s.centered && s.imageHeight === 38 && s.imageWidth <= 38,
        ),
        JSON.stringify(sizes),
      );
      assert.deepEqual(errors, []);
      if (width === 1600) {
        // Normal page elements also remain exportable; no new cloud worker is provisioned.
        const album = await read();
        const response = await owner.request.post(origin + `/api/albums/${id}/exports`, {
          data: {
            idempotencyKey: crypto.randomUUID(),
            expectedRevision: album.revision,
            config: {
              seconds: 15,
              pageIds: [album.pages[0].id],
              opening: 'Một lời mời nhỏ',
              closing: 'Hẹn gặp bạn',
              musicId: 'none',
            },
          },
        });
        assert.equal(response.status(), 201, await response.text());
        let job = await response.json();
        const deadline = Date.now() + 180000;
        while (!['completed', 'failed', 'canceled'].includes(job.status) && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1000));
          job = await (await owner.request.get(origin + '/api/exports/' + job.id)).json();
        }
        assert.equal(job.status, 'completed', job.error);
        const bytes = await (
          await owner.request.get(origin + '/api/exports/' + job.id + '/download')
        ).body();
        assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
        await writeFile('test-results/invitation-recap.mp4', bytes);
      }
    } catch (e) {
      await p.screenshot({
        path: `test-results/invitation-owner-failed-${width}.png`,
        fullPage: true,
      });
      await v.screenshot({
        path: `test-results/invitation-visitor-failed-${width}.png`,
        fullPage: true,
      });
      throw e;
    } finally {
      await owner.close();
      await visitor.close();
    }
  }
  console.log(
    'PASS invitations: four templates, inline text editing, stored presentation, built-in/uploaded audible music, read-only share, revocation, reduced motion, responsive layouts, catalogue spacing and actual MP4.',
  );
} finally {
  await browser.close();
}
