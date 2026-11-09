import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const origin = process.env.SMOKE_UI_ORIGIN!;
if (!origin || new URL(origin).hostname !== '127.0.0.1') throw Error('Fixture only');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
try {
  const context = await browser.newContext();
  try {
    const actor = await (await context.request.get(origin + '/api/session')).json();
    const album = await (
      await context.request.post(origin + '/api/albums', { data: { title: 'Bản nháp hai tab' } })
    ).json();
    await context.route('**/api/albums/' + album.id, async (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Xung đột fixture' }),
          })
        : route.continue(),
    );
    const pages = await Promise.all([context.newPage(), context.newPage()]);
    for (let i = 0; i < pages.length; i++) {
      await pages[i].goto(origin + '/albums/' + album.id, { waitUntil: 'domcontentloaded' });
      await pages[i].getByRole('button', { name: 'Trang trí', exact: true }).click();
      await pages[i].getByRole('button', { name: 'Thêm tiêu đề', exact: true }).click();
      await pages[i].getByLabel('Nội dung', { exact: true }).fill('Nội dung riêng của tab ' + i);
      await expect(
        pages[i].getByRole('button', { name: 'Có xung đột', exact: true }),
      ).toBeVisible();
    }
    const read = () =>
      pages[0].evaluate(
        async ({ actor, album }) => {
          const modulePath = '/src/draft-store.ts',
            drafts = await import(modulePath);
          return drafts.deviceDrafts(`scrapbook-draft:${actor}:${album}`);
        },
        { actor: actor.id, album: album.id },
      );
    await expect.poll(async () => (await read()).length).toBe(2);
    const rows = await read();
    for (let i = 0; i < 2; i++)
      assert.ok(
        rows.some((r: any) => JSON.stringify(r.content).includes('Nội dung riêng của tab ' + i)),
      );
    assert.notEqual(rows[0].id, rows[1].id);
    await pages[0].reload({ waitUntil: 'domcontentloaded' });
    await expect(pages[0].getByLabel('Chọn bản nháp từ các phiên')).toBeVisible();
    await pages[0].getByLabel('Chọn bản nháp từ các phiên').selectOption(rows[0].id);
    await pages[0].getByRole('button', { name: 'Khôi phục', exact: true }).click();
    await expect(pages[0].getByRole('button', { name: 'Có xung đột', exact: true })).toBeVisible();
    assert.ok(
      (await read()).some((r: any) => r.id === rows[1].id),
      'restoring one branch preserves the other tab',
    );
    await pages[0].evaluate(
      async ({ row }) => {
        const modulePath = '/src/draft-store.ts',
          drafts = await import(modulePath);
        const emergency = {
          ...row,
          sequence: 20,
          at: row.at - 1000,
          content: { ...row.content, title: 'Bản khẩn cấp mới hơn IndexedDB' },
        };
        await drafts.writeDeviceDraft({ ...row, sequence: 19 });
        localStorage.setItem(row.id, JSON.stringify(emergency));
        if (
          !(await drafts.deviceDrafts(row.scope)).some(
            (r: any) => r.content.title === emergency.content.title,
          )
        )
          throw Error('A stale durable row hid the latest emergency copy');
        const next = {
          ...row,
          at: Date.now(),
          content: { ...row.content, title: 'Bản mới trong lúc đang dọn' },
        };
        await drafts.writeDeviceDraft(next);
        await drafts.removeMatchingDraft(row.id, row.content);
        if (
          !(await drafts.deviceDrafts(row.scope)).some(
            (r: any) => r.content.title === next.content.title,
          )
        )
          throw Error('Cleanup deleted a newer draft');
        const open = IDBFactory.prototype.open;
        const fallback = {
          ...next,
          id: row.scope + ':branch:fallback',
          content: { ...next.content, title: 'Dự phòng khi IndexedDB lỗi' },
        };
        try {
          IDBFactory.prototype.open = function () {
            throw new DOMException('Fixture quota', 'QuotaExceededError');
          };
          await drafts.writeDeviceDraft(fallback);
          if (!(await drafts.deviceDrafts(row.scope)).some((r: any) => r.id === fallback.id))
            throw Error('Fallback draft missing');
        } finally {
          IDBFactory.prototype.open = open;
        }
        await drafts.removeDeviceDraft(fallback.id);
      },
      { row: rows[1] },
    );
    // A legacy localStorage draft is migrated only after IndexedDB confirms the write.
    const legacy = await (
      await context.request.post(origin + '/api/albums', { data: { title: 'Di chuyển nháp cũ' } })
    ).json();
    await pages[0].evaluate(
      async ({ legacy, actor }) => {
        const key = `scrapbook-draft:${actor}:${legacy.id}`;
        const content = {
          title: 'Nháp từ phiên cũ',
          names: legacy.names,
          startDate: legacy.startDate,
          timezone: legacy.timezone,
          theme: legacy.theme,
          pages: legacy.pages,
          memories: legacy.memories,
        };
        localStorage.setItem(key, JSON.stringify(content));
        const modulePath = '/src/draft-store.ts',
          drafts = await import(modulePath),
          found = await drafts.deviceDrafts(key);
        if (localStorage.getItem(key) !== null || found[0]?.content.title !== 'Nháp từ phiên cũ')
          throw Error('Legacy migration failed');
        if (!(await drafts.deviceDrafts(key)).length) throw Error('Migrated draft disappeared');
      },
      { legacy, actor: actor.id },
    );
    console.log(
      'PASS device drafts: two tabs preserve separate conflict branches, reload/selection restores without deleting the peer, legacy migration is durable.',
    );
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
