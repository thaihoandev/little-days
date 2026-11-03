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
  create: { width: 160, height: 120, channels: 3, background: '#ccd7b4' },
})
  .png()
  .toBuffer();
const reports: object[] = [];
await mkdir('test-results', { recursive: true });
try {
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1600, height: 1000 },
      a = await browser.newContext({ viewport }),
      b = await browser.newContext({ viewport });
    const pa = await a.newPage(),
      pb = await b.newPage(),
      errors: string[] = [];
    for (const p of [pa, pb]) {
      p.on('pageerror', (e) => errors.push(e.message));
      await p.route('https://tile.openstreetmap.org/**', (route) =>
        route.fulfill({ status: 200, contentType: 'image/png', body: image }),
      );
    }
    try {
      const alice = await register(a, 'An'),
        bob = await register(b, 'Bình');
      const privateTitle = 'Nhật ký riêng ' + mobile;
      assert.equal(
        (
          await b.request.post(origin + '/api/journal', {
            data: {
              title: privateTitle,
              date: new Date().toISOString().slice(0, 10),
              kind: 'memory',
              annual: false,
              note: 'Giữ trong không gian riêng',
            },
          })
        ).status(),
        201,
      );
      await pa.goto(origin + '/timeline');
      await expect(
        pa.getByRole('heading', { name: 'Dòng thời gian của mình.', exact: true }),
      ).toBeVisible();
      const privateSpace = (
        await (await a.request.get(origin + '/api/timeline-sharing')).json()
      ).spaces.find((s: any) => !s.shared).id;
      // Finish the initial private selection before creating a partnership; don't rely on a load race.
      await expect(pa.getByLabel('Chọn dòng thời gian', { exact: true })).toHaveValue(privateSpace);
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
      // Personal album must not leak into the shared space's feed, even for its creator.
      await a.request.post(origin + '/api/albums', { data: { title: 'Sổ riêng của An' } });
      await pb.goto(origin + '/timeline');
      await expect(
        pb.getByRole('heading', { name: 'Không gian chung', exact: true }),
      ).toBeVisible();
      await expect(pb.getByLabel('Chọn dòng thời gian', { exact: true })).toHaveValue(alice.id);
      await pb.getByRole('button', { name: 'Thêm dấu mốc', exact: true }).click();
      const dialog = pb.getByRole('dialog', { name: 'Thêm dấu mốc', exact: true });
      await expect(dialog.getByLabel('Lưu vào dòng thời gian', { exact: true })).toHaveValue(
        alice.id,
      );
      const title = 'Buổi hẹn chuẩn bị cùng nhau ' + mobile;
      await dialog.getByLabel('Tên dấu mốc', { exact: true }).fill(title);
      await dialog.getByLabel('Loại dấu mốc', { exact: true }).selectOption('plan');
      await dialog.getByRole('button', { name: 'Thêm công việc', exact: true }).click();
      const task = dialog.getByLabel('Công việc 1', { exact: true });
      await task.fill('Chuẩn bị máy ảnh');
      await task.press('Home');
      await pb.keyboard.insertText('Cùng ');
      await expect(task).toHaveValue('Cùng Chuẩn bị máy ảnh');
      await expect(task).toBeFocused();
      await dialog
        .getByLabel('Người phụ trách công việc 1', { exact: true })
        .selectOption(alice.id);
      assert.ok(
        await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        'Plan dialog does not overflow horizontally',
      );
      await pb.screenshot({ path: 'test-results/shared-plan-form-' + mobile + '.png' });
      await dialog.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      const card = pb
        .locator('article.journal-entry')
        .filter({ has: pb.getByRole('heading', { name: title, exact: true }) });
      await expect(card).toContainText('Đăng bởi Bình');
      await expect(card).toContainText('Chuẩn bị máy ảnh');
      await pa.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(
        pa.getByRole('heading', { name: 'Không gian chung', exact: true }),
      ).toBeVisible();
      const acard = pa
        .locator('article.journal-entry')
        .filter({ has: pa.getByRole('heading', { name: title, exact: true }) });
      await expect(acard).toContainText('Đăng bởi Bình');
      // An explicit personal choice must survive a subsequent version refresh.
      await pa.getByLabel('Chọn dòng thời gian', { exact: true }).selectOption(privateSpace);
      await a.request.post(origin + '/api/journal', {
        data: {
          title: 'Ghi riêng sau cộng tác',
          date: new Date().toISOString().slice(0, 10),
          note: '',
          kind: 'note',
          annual: false,
          timelineId: privateSpace,
        },
      });
      await pa.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(
        pa.getByRole('heading', { name: 'Ghi riêng sau cộng tác', exact: true }),
      ).toBeVisible();
      await expect(pa.getByLabel('Chọn dòng thời gian', { exact: true })).toHaveValue(privateSpace);
      await pa.getByLabel('Chọn dòng thời gian', { exact: true }).selectOption(alice.id);
      await pa.getByRole('button', { name: /^Album của mình/ }).click();
      await expect(
        pa.getByRole('button', { name: 'Mở Sổ riêng của An', exact: true }),
      ).toBeVisible();
      await pa.getByRole('button', { name: 'Dòng thời gian', exact: true }).click();
      await expect(pa.getByRole('heading', { name: 'Sổ riêng của An', exact: true })).toHaveCount(
        0,
      );
      let fullReads = 0,
        probes = 0;
      pb.on('request', (r) => {
        const url = new URL(r.url());
        if (
          url.pathname === '/api/journal' ||
          url.pathname === '/api/albums' ||
          url.pathname === '/api/timeline-sharing' ||
          url.pathname === '/api/library/feed' ||
          url.pathname === '/api/library/map'
        )
          fullReads++;
        if (url.pathname === '/api/journal-state') probes++;
      });
      // Allow the first post-save version check to settle, then unchanged focus must be lightweight.
      await pb.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect.poll(() => probes).toBeGreaterThan(0);
      await pb.waitForTimeout(700);
      const before = fullReads,
        stamp = await (await b.request.get(origin + '/api/journal-state')).json();
      const nextProbe = pb.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/journal-state',
      );
      await pb.evaluate(() => window.dispatchEvent(new Event('focus')));
      await nextProbe;
      await pb.waitForTimeout(300);
      assert.equal(fullReads, before, 'Unchanged focus must not refetch full feeds');
      await expect(card).toBeVisible();
      await acard.getByRole('button', { name: 'Chuẩn bị', exact: true }).click();
      const edit = pa.getByRole('dialog', { name: 'Sửa dấu mốc', exact: true });
      await edit.getByLabel('Hoàn thành công việc 1', { exact: true }).check();
      await edit.getByLabel('Trạng thái kế hoạch', { exact: true }).selectOption('completed');
      await edit.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(edit).not.toBeVisible();
      assert.notEqual(
        (await (await b.request.get(origin + '/api/journal-state')).json()).version,
        stamp.version,
      );
      await pb.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(card).toContainText('Đã hoàn thành');
      await card.getByRole('button', { name: 'Thêm ảnh & lưu thành kỉ niệm', exact: true }).click();
      const convert = pb.getByRole('dialog', { name: 'Sửa dấu mốc', exact: true });
      await expect(convert.getByLabel('Loại dấu mốc', { exact: true })).toHaveValue('memory');
      await convert
        .getByLabel('Ảnh dấu mốc', { exact: true })
        .setInputFiles({ name: 'buoi-hen.png', mimeType: 'image/png', buffer: image });
      await convert.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
      await expect(convert).not.toBeVisible();
      await expect(card.locator('.journal-photos img')).toHaveCount(1);
      await pb.reload();
      const records = await (await b.request.get(origin + '/api/journal')).json(),
        saved = records.find((e: any) => e.title === title);
      assert.equal(saved.kind, 'memory');
      assert.equal(saved.createdBy, bob.id);
      assert.equal(saved.plan.checklist[0].done, true);
      assert.equal(saved.assets.length, 1);
      await expect(pb.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await pb.screenshot({ path: 'test-results/shared-plans-' + mobile + '.png', fullPage: true });
      assert.ok(await pb.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await pb.getByRole('button', { name: 'Lịch của mình', exact: true }).click();
      await pb.getByRole('button', { name: 'Sửa dấu mốc ' + privateTitle, exact: true }).click();
      const privateEdit = pb.getByRole('dialog', { name: 'Sửa dấu mốc', exact: true });
      await expect(privateEdit.getByLabel('Lưu vào dòng thời gian', { exact: true })).toHaveValue(
        (await (await b.request.get(origin + '/api/timeline-sharing')).json()).spaces.find(
          (s: any) => !s.shared,
        ).id,
      );
      await privateEdit.getByRole('button', { name: 'Đóng dấu mốc', exact: true }).click();
      await pb.getByRole('button', { name: 'Dòng thời gian', exact: true }).click();
      assert.equal(
        (
          await a.request.delete(origin + '/api/timeline-sharing/' + grant.id, {
            data: { expectedRevision: 1 },
          })
        ).status(),
        200,
      );
      await pb.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(pb.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
      assert.equal((await b.request.get(origin + saved.assets[0].url)).status(), 404);
      // Deploy compatibility: an API without the new capability must keep the old refresh path.
      await pb.route('**/api/session', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        delete body.sharedPlansVersion;
        await route.fulfill({ response, json: body });
      });
      await pb.reload();
      await expect(
        pb.getByRole('button', { name: 'Chia sẻ dòng thời gian', exact: true }),
      ).toBeEnabled();
      const legacyRefresh = pb.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/timeline-sharing',
      );
      await pb.evaluate(() => window.dispatchEvent(new Event('focus')));
      await legacyRefresh;
      assert.deepEqual(errors, []);
      reports.push({
        mobile,
        sharedIdentity: true,
        authorRetained: true,
        planConverted: true,
        unchangedFocusFullReads: 0,
        revocationFenced: true,
      });
    } finally {
      await a.close();
      await b.close();
    }
  }
  await writeFile('test-results/shared-plans-ui.json', JSON.stringify(reports, null, 2));
  console.log(
    'PASS shared spaces, real authors, assigned checklist/completion, photo conversion, quiet focus refresh and revoked access on desktop/mobile',
  );
} finally {
  await browser.close();
}
