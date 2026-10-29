import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type Album, type VideoConfig, createPage } from '../packages/domain/index.js';
import { audioFixture } from '../tests/audio-fixture.js';

await mkdir('test-results', { recursive: true });
await writeFile('test-results/ui-original-tones.wav', audioFixture());
const origin = process.env.SMOKE_UI_ORIGIN || 'http://127.0.0.1:5173',
  base = origin + '/api';
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    path.resolve(
      'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe',
    ),
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } }),
  page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await context.request.get(base + '/session');
  let album: Album = await (
    await context.request.post(base + '/albums', {
      data: { title: 'Nhạc và thời lượng ' + Date.now() },
    })
  ).json();
  album.pages = [
    { ...album.pages[0], title: 'Trang đầu' },
    { ...createPage('letter'), title: 'Trang thứ hai' },
  ];
  const { id, revision, assets, createdAt, updatedAt, schemaVersion, ...content } = album;
  assert.equal(
    (
      await context.request.patch(base + '/albums/' + id, {
        data: { expectedRevision: revision, content },
      })
    ).status(),
    200,
  );
  await page.goto(origin);
  await page.getByRole('button', { name: 'Mở ' + album.title, exact: true }).click();
  await page.getByRole('button', { name: 'Tạo video', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Nhạc nền', exact: true })).toBeEnabled();
  await page.getByLabel('Thời lượng từng trang', { exact: true }).check();
  await page.getByLabel('Thời lượng cảnh Trang đầu', { exact: true }).fill('3');
  await page.getByLabel('Thời lượng cảnh Trang thứ hai', { exact: true }).fill('4');
  await expect(
    page.getByText('Preview 9:16 · Bản xuất 1080p · 30 fps · 12.0 giây', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('File nhạc riêng').setInputFiles('test-results/ui-original-tones.wav');
  await expect(page.getByRole('combobox', { name: 'Bản nhạc', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('img', { name: 'Biên độ bản nhạc' })).toBeVisible();
  await page.getByLabel('Điểm bắt đầu trên sóng nhạc', { exact: true }).fill('1');
  await expect(page.getByLabel('Bắt đầu nhạc (giây)', { exact: true })).toHaveValue('1');
  await page.getByLabel('Điểm kết thúc trên sóng nhạc', { exact: true }).fill('5');
  await expect(page.getByLabel('Kết thúc nhạc (giây)', { exact: true })).toHaveValue('5');
  await page.getByLabel('Bắt đầu nhạc (giây)').fill('2');
  await page.getByLabel('Kết thúc nhạc (giây)').fill('4');
  await page.getByLabel('Lặp đoạn nhạc cho đủ video').check();
  await page.getByLabel(/Âm lượng nhạc/).fill('0.6');
  await expect
    .poll(
      () =>
        page
          .locator('audio')
          .evaluateAll((elements) => elements.some((el) => el.readyState >= 2 && !el.error)),
      { timeout: 15000 },
    )
    .toBe(true);
  const tracks = await (await context.request.get(base + '/albums/' + id + '/audio')).json();
  assert.equal(tracks.length, 1);
  const range = await context.request.get(origin + tracks[0].url, {
    headers: { Range: 'bytes=100-199' },
  });
  assert.equal(range.status(), 206);
  assert.equal((await range.body()).length, 100);
  const invalid = await context.request.get(origin + tracks[0].url, {
    headers: { Range: 'bytes=999999999-' },
  });
  assert.equal(invalid.status(), 416);
  await page.getByRole('button', { name: 'Lưu tùy chọn video', exact: true }).click();
  let saved: { config: VideoConfig } = await (
    await context.request.get(base + '/albums/' + id + '/video-settings')
  ).json();
  assert.equal(saved.config.audioStart, 2);
  assert.equal(saved.config.audioEnd, 4);
  assert.equal(saved.config.audioLoop, true);
  assert.equal(saved.config.audioVolume, 0.6);
  // Reordering changes scene order while preserving durations by page ID.
  await page.getByRole('button', { name: 'Đưa cảnh lên', exact: true }).nth(1).click();
  await page.getByRole('button', { name: 'Lưu tùy chọn video', exact: true }).click();
  saved = await (await context.request.get(base + '/albums/' + id + '/video-settings')).json();
  assert.equal(saved.config.pageIds[0], album.pages[1].id);
  assert.equal(saved.config.sceneDurations?.[album.pages[1].id], 4);
  await expect(page.getByRole('button', { name: 'Lưu tùy chọn video', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'test-results/video-custom-desktop.png', fullPage: true });
  await page.locator('.audio-waveform').screenshot({ path: 'test-results/waveform-desktop.png' });
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo video', exact: true }).click();
  await expect(page.getByLabel('Bắt đầu nhạc (giây)')).toHaveValue('2');
  await expect(page.getByLabel('Thời lượng cảnh Trang thứ hai', { exact: true })).toHaveValue('4');
  await expect(page.getByRole('button', { name: 'Xuất video MP4', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Xuất video MP4', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hủy tác vụ', exact: true })).toBeVisible();
  const jobs = await (await context.request.get(base + '/albums/' + id + '/exports')).json();
  assert.equal(jobs[0].config.audioId, tracks[0].id);
  assert.equal(jobs[0].config.sceneDurations[album.pages[1].id], 4);
  await page.getByRole('button', { name: 'Hủy tác vụ', exact: true }).click();
  await expect(page.getByText('Đã hủy xuất video', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.audio-waveform').scrollIntoViewIfNeeded();
  await page.locator('.audio-waveform').screenshot({ path: 'test-results/waveform-mobile.png' });
  await page.screenshot({ path: 'test-results/video-custom-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.getByRole('button', { name: 'Xóa bản nhạc đã chọn', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Nhạc nền', exact: true })).toHaveValue('none');
  assert.equal(
    (await (await context.request.get(base + '/albums/' + id + '/audio')).json()).length,
    0,
  );
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo video', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Nhạc nền', exact: true })).toHaveValue('none');
  assert.deepEqual(errors, []);
  console.log(
    'PASS video UI: audio upload/preview/range/trim/loop/volume, custom scene durations/reorder, save/reopen, export/cancel, audio deletion, desktop/mobile.',
  );
} catch (error) {
  await page.screenshot({ path: 'test-results/video-ui-failure.png', fullPage: true });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
