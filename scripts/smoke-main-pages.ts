import { chromium, expect, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const origin = process.env.SMOKE_UI_ORIGIN!,
  root = process.env.AUTH_UI_DATA_DIR!;
if (
  !origin ||
  new URL(origin).hostname !== '127.0.0.1' ||
  !path.resolve(root).startsWith(path.resolve('test-results') + path.sep)
)
  throw Error('Fixture only');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
async function register(context: BrowserContext, name: string) {
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
  const files = await readdir(path.join(root, 'mail'));
  let token = '';
  for (const file of files) {
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
  await context.request.patch(origin + '/api/profile', {
    data: { displayName: name, expectedRevision: -1 },
  });
  return { email, ...(await (await context.request.get(origin + '/api/session')).json()) };
}
try {
  for (const width of [1440, 390, 320]) {
    const a = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1000 } }),
      b = await browser.newContext();
    const page = await a.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const tile = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#efebdf' },
    })
      .png()
      .toBuffer();
    await page.route(/^https:\/\/(?:[a-z]\.)?tile\.openstreetmap\.org\//, (r) =>
      r.fulfill({ body: tile, contentType: 'image/png' }),
    );
    try {
      const an = await register(a, 'An'),
        binh = await register(b, 'Bình');
      const grant = await (
        await a.request.post(origin + '/api/timeline-sharing', { data: { email: binh.email } })
      ).json();
      await b.request.patch(origin + '/api/timeline-sharing/' + grant.id, {
        data: { expectedRevision: 0, action: 'accept' },
      });
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
        new Date(),
      );
      for (let i = 0; i < 16; i++)
        assert.equal(
          (
            await b.request.post(origin + '/api/journal', {
              data: {
                title: 'Dạo phố fixture ' + i,
                date: today,
                note: '',
                kind: 'memory',
                annual: false,
                timelineId: an.id,
                location: { label: 'Hà Nội', latitude: 21.03, longitude: 105.85 },
              },
            })
          ).status(),
          201,
        );
      const round = (await (await a.request.get(origin + '/api/together/' + an.id)).json()).daily;
      assert.equal(
        (
          await a.request.post(origin + '/api/together/' + an.id + '/answers', {
            data: {
              roundId: round.id,
              expectedRevision: round.revision,
              requestId: crypto.randomUUID(),
              text: 'Một chút thương fixture',
            },
          })
        ).status(),
        201,
      );
      await page.goto(origin + '/today');
      await expect(page.locator('.sidebar nav>button')).toHaveCount(4);
      await expect(page.locator('.calendar-card')).toHaveCount(0);
      await expect(page.locator('.timeline-map-panel')).toHaveCount(0);
      await expect(page.locator('.together-home')).toBeVisible();
      await expect(page.locator('.hourglass-stage')).toHaveAttribute('data-renderer', 'ready', {
        timeout: 45000,
      });
      const clock = page.locator('.hourglass-canvas canvas');
      await expect(clock).toBeVisible();
      const png = await clock.screenshot();
      const stats = await sharp(png).stats();
      assert.ok(
        stats.channels.some((c) => c.stdev > 12),
        '3D canvas contains an actual shaded object',
      );
      await expect(page.locator('.rhythm-summary>strong')).toContainText('1');
      await expect(page.locator('.home-mode .journal-entry')).toHaveCount(4);
      if (width === 1440) {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.waitForTimeout(250);
        const a = await clock.screenshot();
        await page.waitForTimeout(250);
        assert.deepEqual(await clock.screenshot(), a, 'reduced motion stops the 3D animation');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
      if (process.env.GENERATE_HOURGLASS_STILL === 'true' && width === 1440) {
        const png = await page.evaluate(async () => {
          const source = '/src/hourglass-scene.ts';
          const { createHourglass } = await import(source);
          const host = document.createElement('div');
          Object.assign(host.style, {
            width: '480px',
            height: '480px',
            position: 'fixed',
            top: '0',
            left: '0',
            zIndex: '9999',
          });
          document.body.append(host);
          const dispose = createHourglass(host, 0.28);
          const data = host.querySelector('canvas')!.toDataURL('image/png');
          dispose();
          host.remove();
          return data;
        });
        await writeFile(
          'apps/web/public/hourglass-still.png',
          Buffer.from(png.split(',')[1], 'base64'),
        );
      }
      await page.screenshot({
        path: 'test-results/main-pages-today-' + width + '.png',
        fullPage: true,
      });
      await expect(
        page.getByRole('region', { name: 'Tuần của chúng mình', exact: true }),
      ).toHaveCount(0);
      await page.getByText('Nhìn lại tuần này', { exact: true }).click();
      await expect(
        page.getByRole('region', { name: 'Tuần của chúng mình', exact: true }),
      ).toBeVisible();
      await page.goto(origin + '/calendar');
      await expect(page.locator('.calendar-card')).toBeVisible();
      await expect(page.locator('.together-home')).toHaveCount(0);
      await expect(page.locator('.timeline-map-panel')).toHaveCount(0);
      await page.getByRole('button', { name: /^Album của mình/ }).click();
      await page.getByRole('button', { name: 'Ảnh đã lưu', exact: true }).click();
      await expect(page).toHaveURL(/\/photos$/);
      await expect(page.locator('.sidebar nav>button')).toHaveCount(4);
      await expect(page.locator('.sidebar .nav-item.active')).toContainText('Album');
      if (width < 760) {
        const active = page.locator('.sidebar .nav-item.active');
        await expect(active).toHaveCSS('border-left-width', '0px');
        assert.match(await active.evaluate((el) => getComputedStyle(el).boxShadow), /0px -3px/);
      }
      await page.goto(origin + '/timeline');
      await expect(page.locator('.timeline-map-panel')).toHaveCount(1);
      await page.getByRole('button', { name: 'Mở rộng bản đồ', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Bản đồ kỉ niệm', exact: true });
      await dialog.locator('.vietnam-svg-map > path[aria-label="Hà Nội"]').click();
      await expect(dialog.locator('.inspector-entries-list .inspector-entry-row')).toHaveCount(16);
      const selectors = [
        '.vietnam-svg-map',
        '.memory-map-header',
        '.footprint-search-box',
        '.inspector-header',
      ];
      const positions = await Promise.all(selectors.map((s) => dialog.locator(s).boundingBox()));
      await dialog.locator('.inspector-entries-list').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await dialog.locator('.footprint-province-grid').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      assert.ok(
        await dialog.locator('.footprint-province-grid').evaluate((el) => el.scrollTop > 0),
      );
      assert.ok(await dialog.locator('.inspector-entries-list').evaluate((el) => el.scrollTop > 0));
      assert.deepEqual(
        await Promise.all(selectors.map((s) => dialog.locator(s).boundingBox())),
        positions,
        'only memory and province lists move',
      );
      assert.equal(await dialog.locator('.footprint-sidebar').evaluate((el) => el.scrollTop), 0);
      assert.ok(await dialog.evaluate((el) => el.scrollHeight <= el.clientHeight + 1));
      await page.screenshot({ path: 'test-results/main-pages-map-' + width + '.png' });
      await dialog.getByRole('button', { name: 'Đóng bản đồ kỉ niệm', exact: true }).click();
      await page.getByRole('button', { name: /^Thông báo/ }).click();
      await page
        .getByRole('region', { name: 'Danh sách thông báo', exact: true })
        .getByRole('button')
        .filter({ hasText: 'Bình đã thêm một dấu mốc' })
        .first()
        .click();
      const linked = page.getByRole('dialog', { name: 'Sửa dấu mốc', exact: true });
      await expect(linked).toBeVisible();
      await expect(linked.getByLabel('Tên dấu mốc', { exact: true })).toHaveValue(
        /Dạo phố fixture/,
      );
      await linked.getByRole('button', { name: 'Đóng dấu mốc', exact: true }).click();
      await a.request.post(origin + '/api/notifications/all/read');
      const secret = 'SEALED-DO-NOT-NOTIFY-' + width;
      const future = new Date(Date.parse(today + 'T12:00:00Z') + 7 * 86400000)
        .toISOString()
        .slice(0, 10);
      assert.equal(
        (
          await b.request.post(origin + '/api/together/' + an.id + '/notes', {
            data: {
              requestId: crypto.randomUUID(),
              text: secret,
              mode: 'scheduled',
              openDate: future,
            },
          })
        ).status(),
        201,
      );
      const inbox = await (await a.request.get(origin + '/api/notifications')).json();
      assert.ok(inbox.items.some((n: { kind: string }) => n.kind === 'love-note'));
      assert.ok(!JSON.stringify(inbox).includes(secret));
      await page.reload();
      await page.getByRole('button', { name: /^Thông báo/ }).click();
      const notices = page.getByRole('region', { name: 'Danh sách thông báo', exact: true });
      await notices
        .getByRole('button')
        .filter({ hasText: 'Bình đã gửi một điều thương vào lọ' })
        .click();
      await expect(page).toHaveURL(/\/together\?.*tab=jar/);
      await expect(page.locator('.jar-card.sealed')).toHaveCount(1);
      await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
      if (width === 320) {
        await page.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
            if (type.startsWith('webgl')) return null;
            return Reflect.apply(original, this, [type, ...args]);
          } as typeof original;
        });
        await page.goto(origin + '/today');
        await expect(page.locator('.hourglass-stage')).toHaveAttribute('data-renderer', 'fallback');
        await expect(page.locator('.hourglass-still')).toBeVisible();
        await expect
          .poll(() =>
            page.locator('.hourglass-still').evaluate((img: HTMLImageElement) => img.naturalWidth),
          )
          .toBeGreaterThan(0);
      }
      if (width === 1440) {
        let unsupportedReads = 0;
        page.on('request', (r) => {
          if (/\/api\/together\/[^/]+\/rhythm$/.test(r.url())) unsupportedReads++;
        });
        await page.route('**/api/session', async (route) => {
          const response = await route.fetch();
          const session = await response.json();
          delete session.coupleRhythmVersion;
          await route.fulfill({ response, json: session });
        });
        await page.goto(origin + '/today');
        await expect(page.locator('.together-home.rhythm-hidden')).toBeVisible();
        await expect(page.locator('.hourglass-stage')).toHaveCount(0);
        await expect(page.locator('.ritual-home-links button')).toHaveCount(2);
        assert.equal(unsupportedReads, 0, 'old API keeps actions without unsupported requests');
      }
      assert.deepEqual(errors, []);
    } catch (e) {
      await page.screenshot({
        path: 'test-results/main-pages-failure-' + width + '.png',
        fullPage: true,
      });
      throw e;
    } finally {
      await a.close();
      await b.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  'PASS main pages: four-item navigation, single-purpose pages, real WebGL hourglass, deliberate weekly recap, fixed map controls with two scroll lists and private collaboration notices.',
);
