import { chromium, expect, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { element } from '../packages/domain/index.js';
import { photoStyleIds } from '../packages/domain/photo-frames.js';
import { decoration } from '../packages/domain/decorations.js';
import { counterAppearance, counterMotif } from '../packages/domain/counter.js';
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
  for (const width of [1600, 390, 320]) {
    const owner = await browser.newContext({
        viewport: { width, height: width < 500 ? 844 : 1050 },
      }),
      partner = await browser.newContext(),
      visitor = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1050 } });
    const p = await owner.newPage(),
      v = await visitor.newPage(),
      errors: string[] = [];
    p.on('pageerror', (e) => errors.push(e.message));
    v.on('pageerror', (e) => errors.push(e.message));
    try {
      const alice = await register(owner, 'An'),
        bob = await register(partner, 'Bình');
      await visitor.request.get(origin + '/api/session');
      const grant = await (
        await owner.request.post(origin + '/api/timeline-sharing', { data: { email: bob.email } })
      ).json();
      assert.equal(
        (
          await partner.request.patch(origin + '/api/timeline-sharing/' + grant.id, {
            data: { expectedRevision: 0, action: 'accept' },
          })
        ).status(),
        200,
      );
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
        new Date(),
      );
      const bytes = await sharp({
        create: { width: 600, height: 400, channels: 3, background: '#819b64' },
      })
        .composite([
          {
            input: Buffer.from(
              '<svg width="600" height="400"><rect x="40" y="40" width="230" height="300" fill="#c58c74"/><circle cx="420" cy="180" r="100" fill="#e8cc8e"/></svg>',
            ),
          },
        ])
        .png()
        .toBuffer();
      let entry = await (
        await partner.request.post(origin + '/api/journal', {
          data: {
            title: 'Một buổi đi dạo',
            note: 'Một ngày của hai người',
            date,
            kind: 'memory',
            annual: false,
            timelineId: alice.id,
          },
        })
      ).json();
      const uploaded = await partner.request.post(origin + '/api/journal/' + entry.id + '/assets', {
        multipart: { file: { name: 'fixture.png', mimeType: 'image/png', buffer: bytes } },
      });
      assert.equal(uploaded.status(), 201, await uploaded.text());
      entry = await uploaded.json();
      await p.goto(origin + '/today');
      const weekly = p.getByRole('region', { name: 'Tuần của chúng mình', exact: true });
      await expect(weekly.locator('.week-tape > button')).toHaveCount(7);
      await expect(
        weekly.getByRole('button', { name: 'Tạo recap tuần', exact: true }),
      ).toBeEnabled();
      assert.equal(
        await p.locator('.albums-section').count(),
        0,
        'Home does not duplicate the album library.',
      );
      await p.screenshot({ path: 'test-results/weekly-home-' + width + '.png', fullPage: true });
      await weekly.getByRole('button', { name: 'Tạo recap tuần', exact: true }).click();
      const composer = p.getByRole('dialog', { name: 'Thiết kế recap tuần', exact: true });
      await expect(composer.getByRole('button', { name: /Bỏ chọn ảnh Bình/ })).toBeVisible();
      await composer.getByLabel('Tiêu đề recap', { exact: true }).fill('Một tuần thật vui');
      if (width === 1600) {
        await partner.request.post(origin + '/api/journal', {
          data: {
            title: 'Cập nhật chung',
            note: 'Ghi chú fixture',
            date,
            kind: 'note',
            annual: false,
            timelineId: alice.id,
          },
        });
        const refresh = p.waitForResponse(
          (r) => r.url().includes('/api/weekly-recap?') && r.status() === 200,
        );
        await p.evaluate(() => window.dispatchEvent(new Event('focus')));
        await refresh;
        await expect(composer).toBeVisible();
        await expect(composer.getByLabel('Tiêu đề recap', { exact: true })).toHaveValue(
          'Một tuần thật vui',
        );
      }
      await composer.getByLabel('Bố cục recap', { exact: true }).selectOption('film');
      await composer.getByRole('button', { name: 'Xanh đêm', exact: true }).click();
      await p.screenshot({ path: 'test-results/weekly-composer-' + width + '.png' });
      await composer.getByRole('button', { name: 'Lưu và mở trong editor', exact: true }).click();
      await expect(p).toHaveURL(/\/albums\/[\w-]+$/);
      const id = new URL(p.url()).pathname.split('/').at(-1)!,
        album = await (await owner.request.get(origin + '/api/albums/' + id)).json();
      assert.equal(album.weeklyRecap.layout, 'film');
      assert.equal(album.assets.length, 1);
      assert.equal(
        (
          await visitor.request.get(origin + '/api/albums/' + id + '/assets/' + album.assets[0].id)
        ).status(),
        404,
      );
      const download = p.waitForEvent('download');
      await p.getByRole('button', { name: 'Tải trang PNG', exact: true }).click();
      const file = await download;
      await file.saveAs('test-results/weekly-poster-' + width + '.png');
      const metadata = await sharp(await file.path()).metadata();
      assert.equal(metadata.width, 720);
      assert.equal(metadata.height, 900);
      await p.getByRole('button', { name: 'Ảnh', exact: true }).first().click();
      const gallery = p.getByRole('group', { name: 'Bộ khung ảnh', exact: true }).first();
      await expect(gallery.getByRole('button')).toHaveCount(8);
      for (const name of ['Ô ảnh tròn', 'Cửa vòm', 'Tem kỉ niệm'])
        await gallery.getByRole('button', { name, exact: true }).click();
      await p.getByLabel('Kiểu hiển thị ảnh', { exact: true }).selectOption('film');
      await expect(p.getByLabel('Màu viền khung', { exact: true })).toHaveValue('#292e29');
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      // Long invitations are editable sections, read-only and continuously scrollable when shared.
      const created = await owner.request.post(origin + '/api/albums', {
        data: {
          title: 'Thiệp cuộn dọc',
          documentKind: 'invitation',
          templateId: 'invite-date',
          readingMode: 'scroll',
        },
      });
      assert.equal(created.status(), 201, await created.text());
      const long = await created.json();
      assert.equal(long.pages.length, 3);
      await p.goto(origin + '/albums/' + long.id);
      await expect(p.locator('.long-card-editor')).toBeVisible();
      await expect(p.locator('.konvajs-content')).toHaveCount(1);
      await p.getByRole('button', { name: 'Sửa phần 2', exact: true }).click();
      await expect(p.locator('.long-card-editor [data-active=true]')).toContainText('Phần 2');
      await expect(p.locator('.konvajs-content')).toHaveCount(1);
      await p.screenshot({ path: 'test-results/long-editor-' + width + '.png' });
      const share = await (
        await owner.request.post(origin + '/api/albums/' + long.id + '/share', { data: {} })
      ).json();
      const sharePath = '/?share=' + share.token;
      await v.goto(new URL(sharePath, origin).toString());
      const viewer = v.getByRole('dialog', { name: 'Xem album', exact: true });
      await expect(viewer.locator('.scroll-story > section')).toHaveCount(3);
      assert.equal(await viewer.locator('select').count(), 0);
      assert.equal(await viewer.getByRole('button', { name: 'Trang sau', exact: true }).count(), 0);
      const height = await viewer
        .locator('.viewer-page')
        .evaluate((e) => ({ client: e.clientHeight, scroll: e.scrollHeight }));
      const sectionHeight = await viewer
        .locator('.scroll-story > section')
        .first()
        .evaluate((e) => e.getBoundingClientRect().height);
      const storyHeight = await viewer
        .locator('.scroll-story')
        .evaluate((e) => e.getBoundingClientRect().height);
      assert.ok(
        Math.abs(storyHeight - sectionHeight * 3) < 2,
        JSON.stringify({ storyHeight, sectionHeight }),
      );
      assert.ok(height.scroll > height.client, JSON.stringify(height));
      await viewer.locator('.viewer-page').evaluate((e) => (e.scrollTop = e.scrollHeight));
      await expect(viewer.locator('.scroll-story > section').last()).toBeInViewport();
      await expect
        .poll(() =>
          viewer
            .locator('.scroll-story > section')
            .last()
            .locator('[style*="opacity:"]')
            .first()
            .evaluate((e) => Number((e as HTMLElement).style.opacity)),
        )
        .toBe(1);
      await v.screenshot({ path: 'test-results/long-share-' + width + '.png' });
      await v.emulateMedia({ reducedMotion: 'reduce' });
      await expect(viewer.locator('.viewer-ambience')).toHaveCount(0);
      if (width === 1600) {
        await p.goto(origin + '/today');
        await p.getByRole('button', { name: 'Thêm dấu mốc', exact: true }).click();
        const form = p.getByRole('dialog', { name: 'Thêm dấu mốc', exact: true });
        await form.getByLabel('Tên dấu mốc', { exact: true }).fill('Ảnh vừa thêm');
        await form
          .getByLabel('Ảnh dấu mốc', { exact: true })
          .setInputFiles({ name: 'new-fixture.png', mimeType: 'image/png', buffer: bytes });
        await form.getByRole('button', { name: 'Lưu dấu mốc', exact: true }).click();
        await expect(form).not.toBeVisible();
        await expect(
          weekly.locator('.week-count'),
          'Saving a new photo refreshes the week without a reload or focus event.',
        ).toHaveText(['2']);
      }
      if (width === 1600) {
        const content = { ...album };
        for (const key of [
          'id',
          'schemaVersion',
          'revision',
          'createdAt',
          'updatedAt',
          'assets',
          'share',
        ])
          delete content[key];
        content.pages = [
          {
            ...album.pages[0],
            elements: photoStyleIds.map((style, i) =>
              element('image', {
                assetId: album.assets[0].id,
                photoStyle: style,
                x: 35 + (i % 3) * 230,
                y: 35 + Math.floor(i / 3) * 280,
                width: 205,
                height: 245,
                text: style,
                animation: 'none',
              }),
            ),
          },
          ...long.pages.slice(1),
        ];
        content.presentation = { ...long.presentation, ambience: 'none' };
        content.pages[0].elements.push(
          element('sticker', {
            decorationId: 'heart-pink',
            x: 620,
            y: 810,
            width: 60,
            height: 60,
            animation: 'none',
          }),
          element('anniversary', {
            counterStyle: 'postcard',
            x: 40,
            y: 810,
            width: 160,
            height: 60,
            fontSize: 16,
            animation: 'none',
          }),
        );
        const saved = await owner.request.patch(origin + '/api/albums/' + id, {
          data: { expectedRevision: album.revision, content },
        });
        assert.equal(saved.status(), 200, await saved.text());
        const designed = await saved.json();
        await p.evaluate(
          ({ actor, id }) => localStorage.removeItem(`scrapbook-draft:${actor}:${id}`),
          { actor: alice.id, id },
        );
        // Hold native canvas SVG decoding; downloading must wait for real artwork, not an empty node.
        const motifElement = content.pages[0].elements.find(
          (e: any) => e.counterStyle === 'postcard',
        );
        const heldSvg = [
          decoration('heart-pink')!.src,
          counterMotif('postcard', 160, 60, counterAppearance('postcard', motifElement)!.accent),
        ];
        await p.addInitScript(`(() => {
          const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src'),pending=[],targets=new Set(${JSON.stringify(heldSvg)}),seen=new Set();
          let hold=true;
          Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(value){const image=this;if(hold&&targets.has(value)){seen.add(value);pending.push(()=>descriptor.set.call(image,value));}else descriptor.set.call(image,value);}});
          window.__posterSvgPending=()=>seen.size;
          window.__releasePosterSvg=()=>{hold=false;pending.splice(0).forEach(release=>release());};
        })()`);
        await p.goto(origin + '/albums/' + id);
        await expect(p.locator('.konvajs-content')).toHaveCount(1);
        await p.screenshot({ path: 'test-results/poster-svg-loading.png' });
        await expect.poll(() => p.evaluate(() => (window as any).__posterSvgPending())).toBe(2);
        const poster = p.waitForEvent('download');
        await p.getByRole('button', { name: 'Tải trang PNG', exact: true }).click();
        await expect(p.getByRole('button', { name: 'Đang tạo ảnh…', exact: true })).toBeDisabled();
        await p.evaluate(() => (window as any).__releasePosterSvg());
        await (await poster).saveAs('test-results/weekly-all-frames.png');
        const png = await sharp('test-results/weekly-all-frames.png')
          .ensureAlpha()
          .raw()
          .toBuffer();
        assert.ok(
          png[(840 * 720 + 650) * 4] > 180,
          'Downloaded PNG includes the deferred heart artwork.',
        );
        const exported = await owner.request.post(origin + '/api/albums/' + id + '/exports', {
          data: {
            expectedRevision: designed.revision,
            idempotencyKey: crypto.randomUUID(),
            config: {
              seconds: 15,
              pageIds: designed.pages.map((p: any) => p.id),
              opening: 'Một tuần nhỏ',
              closing: 'Hẹn một tuần mới',
              musicId: 'none',
            },
          },
        });
        assert.equal(exported.status(), 201, await exported.text());
        let job = await exported.json();
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
        await writeFile('test-results/weekly-frames-long.mp4', bytes);
      }
      assert.deepEqual(errors, []);
    } finally {
      await owner.close();
      await partner.close();
      await visitor.close();
    }
  }
} finally {
  await browser.close();
}
