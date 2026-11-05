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

try {
  for (const width of [1920, 390, 320]) {
    const owner = await browser.newContext({
        viewport: { width, height: width < 500 ? 740 : 1050 },
      }),
      other = await browser.newContext();
    const p = await owner.newPage(),
      errors: string[] = [];
    p.on('pageerror', (e) => errors.push(e.message));
    try {
      const alice = await register(owner, 'An'),
        bob = await register(other, 'Bình');
      const grant = await (
        await owner.request.post(origin + '/api/timeline-sharing', { data: { email: bob.email } })
      ).json();
      assert.equal(
        (
          await other.request.patch(origin + '/api/timeline-sharing/' + grant.id, {
            data: { expectedRevision: 0, action: 'accept' },
          })
        ).status(),
        200,
      );
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
          new Date(),
        ),
        later = String(+today.slice(0, 4) + 1) + today.slice(4),
        bytes = await sharp({
          create: { width: 400, height: 300, channels: 3, background: '#91a67a' },
        })
          .png()
          .toBuffer();
      for (const annual of [false, true]) {
        let entry = await (
          await owner.request.post(origin + '/api/journal', {
            data: {
              title: annual ? 'Ngày lặp đã chọn' : 'Chỉ diễn ra một lần',
              date: today,
              note: 'Một kỉ niệm gọn gàng, có ảnh.',
              kind: 'memory',
              annual,
              timelineId: alice.id,
            },
          })
        ).json();
        assert.equal(
          (
            await owner.request.post(origin + '/api/journal/' + entry.id + '/assets', {
              multipart: { file: { name: 'fixture.png', mimeType: 'image/png', buffer: bytes } },
            })
          ).status(),
          201,
        );
      }
      let album = await (
        await owner.request.post(origin + '/api/albums', {
          data: { title: 'Sổ một lần', templateId: 'minimal' },
        })
      ).json();
      album = await (
        await owner.request.patch(origin + '/api/albums/' + album.id, {
          data: {
            expectedRevision: album.revision,
            content: { ...album, startDate: today, memories: [] },
          },
        })
      ).json();
      await p.goto(origin + '/calendar?date=' + later);
      await expect(p.getByRole('heading', { name: 'Ngày lặp đã chọn', exact: true })).toBeVisible();
      await expect(
        p.getByRole('heading', { name: 'Chỉ diễn ra một lần', exact: true }),
      ).toHaveCount(0);
      await expect(p.locator('.journal-entry.album-story')).toHaveCount(0);
      await p.goto(origin + '/albums/' + album.id);
      await p.getByRole('button', { name: 'Thiết lập', exact: true }).click();
      const annual = p.getByLabel('Lặp ngày bắt đầu album hằng năm', { exact: true });
      await expect(annual).not.toBeChecked();
      const annualSaved = p.waitForResponse(
        (response) =>
          response.url().endsWith('/api/albums/' + album.id) &&
          response.request().method() === 'PATCH' &&
          response.ok(),
      );
      await annual.check();
      assert.equal((await (await annualSaved).json()).startDateAnnual, true);
      await expect(p.getByRole('button', { name: 'Đã lưu', exact: true })).toBeVisible();
      await p.goto(origin + '/calendar?date=' + later);
      await expect(p.locator('.journal-entry.album-story')).toHaveCount(1);
      await p.goto(origin + '/today');
      await expect(p.locator('.home-mode .journal-entry').first()).toBeVisible();
      let photoReads = 0;
      const countPhotoReads = (request: import('@playwright/test').Request) => {
        if (new URL(request.url()).pathname === '/api/library/photos') photoReads++;
      };
      p.on('request', countPhotoReads);
      await p.getByRole('button', { name: /^Ảnh đã lưu/ }).click();
      await expect(p.locator('.memory-library img').first()).toBeVisible();
      const initialReads = photoReads;
      assert.equal(initialReads, 1);
      await p.getByRole('button', { name: /^Lịch của mình/ }).click();
      await expect(p.locator('.calendar-mode .journal-feed')).toBeVisible();
      if (width < 500) {
        const feedBox = await p.locator('.journal-feed').boundingBox(),
          asideBox = await p.locator('.upcoming-card').boundingBox(),
          calendarBox = await p.locator('.calendar-card').boundingBox();
        assert.ok(
          calendarBox && feedBox && calendarBox.y < feedBox.y,
          'month calendar appears before selected day',
        );
        assert.ok(
          feedBox && asideBox && feedBox.y < asideBox.y,
          'selected day appears before upcoming sidebar on mobile',
        );
      }
      await p.screenshot({ path: 'test-results/calendar-cards-' + width + '.png', fullPage: true });
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await p.getByRole('button', { name: /^Ảnh đã lưu/ }).click();
      await expect(p.locator('.memory-library img').first()).toBeVisible();
      assert.equal(photoReads, initialReads, 'unchanged photo page reuses validated payload');
      await p.getByRole('button', { name: 'Tài khoản', exact: true }).click();
      await expect(p.getByRole('dialog')).toBeVisible();
      await p.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).click();
      assert.equal(
        photoReads,
        initialReads,
        'opening and closing a popup does not reload the library',
      );
      p.off('request', countPhotoReads);
      await p.getByRole('button', { name: /^Hôm nay/ }).click();
      await expect(p.locator('.home-mode .journal-entry').first()).toBeVisible();
      const bounds = await p.locator('.dashboard').boundingBox();
      assert.ok(bounds && Math.abs(bounds.x + bounds.width - width) < 2, JSON.stringify(bounds));
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await p.screenshot({ path: 'test-results/daily-home-' + width + '.png', fullPage: true });
      await p.getByRole('button', { name: /^Album của mình/ }).click();
      await p.getByRole('button', { name: 'Tạo album', exact: true }).click();
      const modal = p.getByRole('dialog', { name: 'Bắt đầu một cuốn sổ', exact: true });
      await expect(modal).toBeVisible();
      const button = await modal
        .getByRole('button', { name: 'Tạo cuốn sổ của mình', exact: true })
        .boundingBox();
      assert.ok(button && button.y + button.height <= 740 + (width > 500 ? 310 : 0));
      assert.ok(await modal.evaluate((e) => e.scrollHeight <= e.clientHeight + 2));
      await p.screenshot({ path: 'test-results/daily-modal-' + width + '.png' });
      await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
      const root = origin + '/api/together/' + alice.id;
      for (let i = 0; i < 3; i++)
        assert.equal(
          (
            await owner.request.post(root + '/notes', {
              data: { requestId: crypto.randomUUID(), text: 'Lời thương ' + i, mode: 'month-end' },
            })
          ).status(),
          201,
        );
      await p.goto(origin + '/together?tab=jar&space=' + alice.id);
      const jar = p.getByRole('figure', { name: 'Lọ có 3 lời thương', exact: true });
      await expect(jar).toBeVisible();
      await expect(jar.locator('.folded-love-paper')).toHaveCount(3);
      await expect(jar.locator('.love-jar-label b')).toHaveText('3');
      await expect(p.locator('.jar-vote-count').first()).toHaveAttribute(
        'aria-label',
        '0/2 người đồng ý mở sớm',
      );
      await p.getByRole('button', { name: 'Đồng ý mở sớm', exact: true }).first().click();
      await expect(p.locator('.jar-vote-count').first()).toHaveAttribute(
        'aria-label',
        '1/2 người đồng ý mở sớm',
      );
      const text = p.getByLabel('Lời nhắn bỏ vào lọ', { exact: true });
      await text.fill('Cảm ơn bạn hôm nay');
      await text.press('Home');
      await p.keyboard.insertText('Mình ');
      await expect(text).toBeFocused();
      await p.getByRole('button', { name: 'Bỏ lời thương vào lọ', exact: true }).click();
      await expect(
        p.getByRole('figure', { name: 'Lọ có 4 lời thương', exact: true }),
      ).toBeVisible();
      await expect(p.locator('.folded-love-paper')).toHaveCount(4);
      await expect
        .poll(() =>
          p
            .locator('.folded-love-paper')
            .last()
            .evaluate((e) => getComputedStyle(e).opacity),
        )
        .toBe('1');
      await p.screenshot({ path: 'test-results/daily-love-jar-' + width + '.png', fullPage: true });
      await p.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(
        await p.locator('.love-jar').evaluate((e) => getComputedStyle(e).animationName),
        'none',
      );
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
    } catch (e) {
      console.log(
        'Overflow fixture',
        await p.evaluate(() => ({
          viewport: innerWidth,
          width: document.documentElement.scrollWidth,
          items: Array.from(document.querySelectorAll('body *'))
            .map((e) => ({
              tag: e.tagName,
              class: e.getAttribute('class'),
              right: e.getBoundingClientRect().right,
              width: e.getBoundingClientRect().width,
            }))
            .filter((r) => r.right > innerWidth + 1)
            .slice(0, 15),
        })),
      );
      await p.screenshot({ path: 'test-results/daily-failure-' + width + '.png', fullPage: true });
      throw e;
    } finally {
      await owner.close();
      await other.close();
    }
  }
} finally {
  await browser.close();
}
