import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { todayIn, type Album } from '../packages/domain/index.js';
import { privateSpaceId } from '../apps/api/src/journal-privacy.js';
import { Repository } from '../apps/api/src/database.js';
import { authHash, type Account } from '../apps/api/src/auth.js';
const origin = process.env.SMOKE_UI_ORIGIN!,
  root = process.env.AUTH_UI_DATA_DIR!,
  password = 'Fixture-password-123!';
const pageOrigin = origin.replace('127.0.0.1', 'localhost');
if (
  !origin ||
  new URL(origin).hostname !== '127.0.0.1' ||
  !path.resolve(root).startsWith(path.resolve('test-results') + path.sep)
)
  throw Error('Isolated fixtures only');
await mkdir('test-results/signature', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
async function register(context: BrowserContext, verified = true) {
  const email = crypto.randomUUID() + '@fixture.test';
  await context.request.get(origin + '/api/session');
  assert.equal(
    (
      await context.request.post(origin + '/api/auth/register', { data: { email, password } })
    ).status(),
    201,
  );
  if (verified) await verifyFixture(context, email);
  return { email, ...(await (await context.request.get(origin + '/api/session')).json()) };
}
async function verifyFixture(context: BrowserContext, email: string) {
  if (process.env.NODE_ENV === 'production') {
    // Compiled QA keeps production's disabled mail guard. Seed only the verified fixture account.
    const db = new Repository({ dataDir: root, databaseUrl: '' });
    await db.init();
    try {
      const account = await db.get<Account>('account', authHash(email));
      assert.ok(account);
      assert.ok(
        await db.compareAndSwap('account', authHash(email), account.id, account.revision ?? 0, {
          ...account,
          revision: (account.revision ?? 0) + 1,
          emailVerifiedAt: new Date().toISOString(),
        }),
      );
    } finally {
      await db.close();
    }
    return;
  }
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
}
const account = async (page: Page) => {
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  return page.getByRole('dialog', { name: 'Tài khoản của bạn', exact: true });
};
async function noOverflow(page: Page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
try {
  for (const width of [1440, 390, 320]) {
    const owner = await browser.newContext({
        viewport: { width, height: 900 },
        hasTouch: width < 500,
        ...(width === 320
          ? {
              userAgent:
                'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
              isMobile: true,
            }
          : {}),
      }),
      peer = await browser.newContext(),
      stranger = await browser.newContext();
    try {
      const actor = await register(owner),
        partner = await register(peer, false);
      await owner.addCookies(
        (await owner.cookies()).map((cookie) => ({ ...cookie, domain: 'localhost' })),
      );
      // The fixture API allows its 127.0.0.1 origin; RP verification itself runs on valid localhost.
      await owner.route('**/api/**', async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        const response = await route.fetch({
          url: origin + url.pathname + url.search,
          headers: { ...(await request.allHeaders()), origin },
          maxRedirects: 0,
        });
        await route.fulfill({ response });
      });
      await register(stranger);
      const page = await owner.newPage(),
        other = await peer.newPage(),
        errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (width === 1440) await page.clock.install();
      let sessionRequests = 0;
      page.on('request', (request) => {
        if (request.url().endsWith('/api/session')) sessionRequests++;
      });
      const created = await owner.request.post(origin + '/api/albums', {
        data: { title: 'Những ngày Việt', templateId: 'photobooth' },
      });
      assert.equal(created.status(), 201);
      let album: Album = await created.json();
      const image = await sharp({
        create: { width: 100, height: 140, channels: 3, background: '#c6a485' },
      })
        .png()
        .toBuffer();
      album = await (
        await owner.request.post(origin + '/api/albums/' + album.id + '/assets', {
          multipart: { file: { name: 'fixture.png', mimeType: 'image/png', buffer: image } },
        })
      ).json();
      const personal = await owner.request.post(origin + '/api/journal', {
        data: {
          title: 'Điều riêng',
          date: todayIn('Asia/Ho_Chi_Minh'),
          kind: 'memory',
          note: 'Không chia sẻ',
          annual: false,
          timelineId: privateSpaceId(actor.id),
        },
      });
      assert.equal(personal.status(), 201);
      const privateEntry = await personal.json();
      await page.goto(pageOrigin + '/timeline');
      await page.getByRole('button', { name: 'Chia sẻ dòng thời gian', exact: true }).click();
      assert.equal(
        sessionRequests,
        1,
        'Opening the app reuses the lock session instead of making a second request.',
      );
      const sharing = page.getByRole('dialog', { name: 'Chia sẻ dòng thời gian', exact: true });
      await sharing.getByRole('button', { name: 'Mã QR kết đôi', exact: true }).click();
      const issued = page.waitForResponse(
        (r) => r.url().endsWith('/api/timeline-pair') && r.request().method() === 'POST',
      );
      await sharing.getByRole('button', { name: 'Tạo mã QR kết đôi', exact: true }).click();
      const pairResponse = await issued;
      assert.equal(pairResponse.status(), 201, await pairResponse.text());
      const pair = await pairResponse.json();
      await expect(sharing.getByRole('img', { name: 'Mã QR mở lời mời kết đôi' })).toBeVisible();
      await page.screenshot({ path: `test-results/signature/qr-${width}.png` });
      await other.goto(origin + '/#pair=' + pair.token);
      await expect(
        other.getByRole('button', { name: 'Đăng nhập / xác minh email', exact: true }),
      ).toBeVisible();
      await verifyFixture(peer, partner.email);
      await other.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(
        other.getByRole('button', { name: 'Chấp nhận và cùng viết', exact: true }),
      ).toBeEnabled();
      await other.reload();
      await other.getByRole('button', { name: 'Chấp nhận và cùng viết', exact: true }).click();
      await expect(other).toHaveURL(/\/timeline$/);
      assert.equal(
        (await peer.request.get(origin + '/api/journal/' + privateEntry.id)).status(),
        404,
      );
      assert.equal(
        (
          await stranger.request.post(origin + '/api/timeline-pair/accept', {
            data: { token: pair.token },
          })
        ).status(),
        404,
      );
      await sharing
        .getByRole('button', { name: 'Đóng chia sẻ dòng thời gian', exact: true })
        .click();
      for (let i = 0; i < 3; i++) {
        const response = await owner.request.post(origin + '/api/journal', {
          data: {
            title: 'Kỉ niệm ' + i,
            date: todayIn('Asia/Ho_Chi_Minh'),
            note: 'Một chút nhớ',
            kind: 'memory',
            annual: false,
            timelineId: actor.id,
            location: i === 0 ? { label: 'Hà Nội', latitude: 21.03, longitude: 105.85 } : null,
          },
        });
        assert.equal(response.status(), 201);
        const entry = await response.json();
        if (i === 0)
          assert.equal(
            (
              await owner.request.post(origin + '/api/journal/' + entry.id + '/assets', {
                multipart: { file: { name: 'fixture.png', mimeType: 'image/png', buffer: image } },
              })
            ).status(),
            201,
          );
      }
      await page.goto(pageOrigin + '/today');
      const nudge = page.getByRole('button', { name: /Tạo trang sổ tuần/ });
      await expect(nudge).toBeVisible();
      await nudge.click();
      await expect(page.getByRole('dialog', { name: 'Thiết kế recap tuần' })).toBeVisible();
      await page.getByRole('button', { name: 'Đóng recap', exact: true }).click();
      await page.goto(pageOrigin + '/timeline');
      await page.getByRole('button', { name: 'Mở rộng bản đồ', exact: true }).click();
      await page.getByRole('tab', { name: 'Dấu chân Việt Nam', exact: true }).click();
      const map = page.getByRole('dialog', { name: 'Bản đồ kỉ niệm', exact: true });
      const story = page.waitForEvent('download');
      await map.getByRole('button', { name: 'Xuất ảnh Story (1080×1920)', exact: true }).click();
      const download = await story;
      const destination = `test-results/signature/map-story-${width}.png`;
      await download.saveAs(destination);
      const dimensions = await sharp(destination).metadata();
      assert.equal(dimensions.width, 1080);
      assert.equal(dimensions.height, 1920);
      assert.ok(await map.evaluate((n) => n.scrollHeight <= n.clientHeight + 1));
      await page.screenshot({ path: `test-results/signature/map-${width}.png` });
      await map.getByRole('button', { name: 'Đóng bản đồ kỉ niệm', exact: true }).click();
      await page.goto(pageOrigin + '/albums');
      await page.getByRole('button', { name: 'Tạo album', exact: true }).click();
      const create = page.getByRole('dialog', { name: 'Bắt đầu một cuốn sổ', exact: true });
      await expect(create.locator('.template-picker > button').nth(0)).toHaveAttribute(
        'aria-label',
        'Photobooth 4 ô',
      );
      await expect(create.locator('.featured-template-badge')).toHaveCount(3);
      await page.screenshot({ path: `test-results/signature/templates-${width}.png` });
      await create.getByRole('button', { name: 'Đóng', exact: true }).click();
      await page.goto(pageOrigin + '/albums/' + album.id);
      await page.getByRole('button', { name: 'Ảnh', exact: true }).click();
      await page.getByRole('button', { name: 'Dải phim 35mm', exact: true }).first().click();
      await expect(
        page.getByRole('button', { name: 'Tách nền sticker', exact: true }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Tách nền sticker', exact: true }).click();
      const photo = page.getByRole('dialog', { name: 'Chỉnh ảnh trong khung', exact: true });
      await expect(photo.getByRole('button', { name: 'Hủy tách nền', exact: true })).toBeVisible();
      await photo.getByRole('button', { name: 'Hủy tách nền', exact: true }).click();
      await photo.getByRole('button', { name: 'Hủy', exact: true }).click();
      await noOverflow(page);
      await page.goto(pageOrigin + '/today');
      let settings = await account(page);
      const zip = page.waitForEvent('download');
      await settings
        .getByRole('button', { name: 'Tải dữ liệu cá nhân (.zip)', exact: true })
        .click();
      const zipFile = await zip,
        filePath = `test-results/signature/archive-${width}.zip`;
      await zipFile.saveAs(filePath);
      await settings.getByLabel('Chọn ZIP khôi phục', { exact: true }).setInputFiles(filePath);
      await expect(
        settings.getByRole('button', { name: 'Khôi phục vào tài khoản này', exact: true }),
      ).toBeEnabled();
      await settings
        .getByRole('button', { name: 'Khôi phục vào tài khoản này', exact: true })
        .click();
      await expect(settings.getByText(/Đã khôi phục 2 bản ghi riêng tư/)).toBeVisible();
      const restored = (await (await owner.request.get(origin + '/api/albums')).json()) as Album[];
      assert.equal(restored.length, 2);
      const count = (await (await owner.request.get(origin + '/api/journal')).json()).length;
      await settings.getByLabel('Chọn ZIP khôi phục', { exact: true }).setInputFiles(filePath);
      await settings
        .getByRole('button', { name: 'Khôi phục vào tài khoản này', exact: true })
        .click();
      await expect(settings.getByText(/Đã khôi phục 2 bản ghi riêng tư/)).toBeVisible();
      assert.equal((await (await owner.request.get(origin + '/api/albums')).json()).length, 2);
      assert.equal((await (await owner.request.get(origin + '/api/journal')).json()).length, count);
      assert.equal(
        (
          await owner.request.post(origin + '/api/account/archive/import', {
            headers: { 'X-Archive-Actor': partner.id },
            data: { actor: partner.id },
          })
        ).status(),
        409,
      );
      assert.equal(
        (
          await owner.request.post(origin + '/api/auth/confirm-password', {
            data: { actor: partner.id, password },
          })
        ).status(),
        409,
      );
      await settings.getByRole('button', { name: 'Đóng', exact: true }).click();
      await page.getByRole('button', { name: /^Album của mình/ }).click();
      await expect(
        page.getByRole('button', { name: 'Mở Những ngày Việt', exact: true }),
      ).toHaveCount(2);
      settings = await account(page);
      const safety = settings.getByRole('button', { name: 'Bảo mật', exact: true });
      if (width === 320) {
        await settings.getByRole('button', { name: 'Cài đặt ứng dụng', exact: true }).click();
        const guide = page.getByRole('dialog', {
          name: 'Cài Little Days trên màn hình chính',
          exact: true,
        });
        await expect(guide.locator('.ios-install-illustration li')).toHaveCount(2);
        await guide.evaluate(async (node) => {
          await Promise.all(node.getAnimations().map((animation) => animation.finished));
        });
        assert.ok(
          await guide.getByRole('button', { name: 'Đóng', exact: true }).evaluate((button) => {
            const box = button.getBoundingClientRect();
            return button.contains(
              document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
            );
          }),
          'The installation guide stays above the account dialog and receives taps.',
        );
        await page.screenshot({ path: 'test-results/signature/ios-install.png' });
        await page.keyboard.press('Escape');
        await expect(guide).not.toBeVisible();
        await expect(settings).toBeVisible();
      }
      if (await safety.isVisible()) await safety.click();
      await settings.getByLabel('PIN mới', { exact: true }).fill('4826');
      await settings.getByLabel('Nhập lại PIN', { exact: true }).fill('4826');
      await settings.getByRole('button', { name: 'Bật khóa PIN', exact: true }).click();
      let lock = page.getByRole('dialog', { name: 'Mở khóa Little Days', exact: true });
      await expect(lock).toBeVisible();
      await page.screenshot({ path: `test-results/signature/lock-${width}.png` });
      await lock.getByLabel('Mã PIN mở khóa', { exact: true }).fill('0000');
      await lock.getByRole('button', { name: 'Mở khóa', exact: true }).click();
      await expect(lock.getByRole('alert')).toHaveText('Mã PIN chưa đúng.');
      await lock.getByLabel('Mã PIN mở khóa', { exact: true }).fill('4826');
      await lock.getByRole('button', { name: 'Mở khóa', exact: true }).click();
      await expect(lock).not.toBeVisible();
      await page.evaluate((id) => {
        const key = 'little-days:device-lock:' + id,
          oldValue = localStorage.getItem(key)!,
          value = JSON.parse(oldValue);
        const newValue = JSON.stringify({ ...value, failures: value.failures + 1 });
        localStorage.setItem(key, newValue);
        window.dispatchEvent(
          new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage }),
        );
      }, actor.id);
      await expect(lock).not.toBeVisible();
      if (width === 1440) {
        const cdp = await owner.newCDPSession(page);
        await cdp.send('WebAuthn.enable');
        await cdp.send('WebAuthn.addVirtualAuthenticator', {
          options: {
            protocol: 'ctap2',
            transport: 'internal',
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
            automaticPresenceSimulation: true,
          },
        });
        await settings.getByRole('button', { name: 'Thêm mở khóa thiết bị', exact: true }).click();
        await expect(lock).toBeVisible();
        await lock.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
        await expect(lock).not.toBeVisible();
        await cdp.detach();
        await page.clock.fastForward(131000);
        await expect(lock).toBeVisible();
        await lock.getByLabel('Mã PIN mở khóa', { exact: true }).fill('4826');
        await lock.getByRole('button', { name: 'Mở khóa', exact: true }).click();
        await expect(lock).not.toBeVisible();
      }
      await page.reload();
      await expect(lock).toBeVisible();
      await expect(page.locator('.device-protected-app')).toHaveAttribute('inert', '');
      await lock.getByRole('button', { name: 'Quên mã PIN?', exact: true }).click();
      await lock.getByLabel('Mật khẩu tài khoản', { exact: true }).fill(password);
      await lock.getByRole('button', { name: 'Đặt lại khóa trên thiết bị', exact: true }).click();
      await expect(lock).not.toBeVisible();
      await page.reload();
      await expect(lock).toHaveCount(0);
      await noOverflow(page);
      assert.deepEqual(errors, []);
    } finally {
      await owner.unrouteAll({ behavior: 'wait' });
      await owner.close();
      await peer.close();
      await stranger.close();
    }
  }
  console.log(
    'PASS signature features: explicit QR consent, private restore/retry, PIN/reset/WebAuthn, trendy templates, quick cutout, 35mm, weekly nudge and 1080x1920 map Story at desktop/390/320.',
  );
} finally {
  await browser.close();
}
