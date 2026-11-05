import { chromium, expect, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { authMail } from '../apps/api/src/mail-templates.js';

const origin = process.env.SMOKE_UI_ORIGIN!,
  dataDir = process.env.AUTH_UI_DATA_DIR!;
if (
  !origin ||
  new URL(origin).hostname !== '127.0.0.1' ||
  !dataDir ||
  !path.resolve(dataDir).startsWith(path.resolve('test-results') + path.sep)
)
  throw Error('Isolated mail fixture only');
type Outgoing = { to: string; subject: string; text: string; html: string };
async function outbox(): Promise<Outgoing[]> {
  return Promise.all(
    (await readdir(path.join(dataDir, 'mail')))
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => JSON.parse(await readFile(path.join(dataDir, 'mail', file), 'utf8'))),
  );
}
async function register(context: BrowserContext) {
  const email = 'mail-design-' + crypto.randomUUID() + '@example.test';
  await context.request.get(origin + '/api/session');
  assert.equal(
    (
      await context.request.post(origin + '/api/auth/register', {
        data: { email, password: 'Mail-fixture-123!' },
      })
    ).status(),
    201,
  );
  const message = (await outbox()).find(
    (mail) => mail.to === email && mail.subject.includes('Xác minh'),
  )!;
  const token = new URLSearchParams(
    new URL(message.text.match(/http[^\s]+/)![0]).hash.slice(1),
  ).get('token');
  assert.equal(
    (await context.request.post(origin + '/api/auth/verify-email', { data: { token } })).status(),
    201,
  );
  return email;
}
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
});
const owner = await browser.newContext(),
  recipient = await browser.newContext();
try {
  const ownerEmail = await register(owner),
    recipientEmail = await register(recipient);
  const invitation = await owner.request.post(origin + '/api/timeline-sharing', {
    data: { email: recipientEmail },
  });
  assert.equal(invitation.status(), 201);
  assert.equal((await invitation.json()).emailDelivery, 'accepted');
  await owner.request.post(origin + '/api/timeline-sharing', { data: { email: recipientEmail } });
  const invitationMail = (await outbox()).filter(
    (mail) => mail.to === recipientEmail && mail.subject.includes('lời mời'),
  );
  assert.equal(invitationMail.length, 1, 'retrying an invitation does not send a duplicate email');
  assert.ok(!invitationMail[0].html.includes(ownerEmail));
  const page = await recipient.newPage();
  await page.goto(origin + '/timeline?sharing=1');
  await expect(
    page.getByRole('dialog', { name: 'Chia sẻ dòng thời gian', exact: true }),
  ).toBeVisible();
  const sharing = await (await recipient.request.get(origin + '/api/timeline-sharing')).json();
  assert.equal(
    sharing.grants[0].state,
    'pending',
    'opening the mail link never accepts an invitation',
  );
  assert.equal(
    (
      await owner.request.post(origin + '/api/auth/change-password', {
        data: { currentPassword: 'Mail-fixture-123!', newPassword: 'Changed-mail-fixture-123!' },
      })
    ).status(),
    201,
  );
  const securityMail = (await outbox()).filter(
    (mail) => mail.to === ownerEmail && mail.subject.includes('vừa thay đổi'),
  );
  assert.equal(securityMail.length, 1);
  assert.ok(!securityMail[0].text.includes('Changed-mail-fixture-123!'));
  const previews = [
    [
      'verify',
      authMail('verify-email', 'https://little-days.example/#auth=verify-email&token=fixture-only'),
    ],
    [
      'reset',
      authMail(
        'reset-password',
        'https://little-days.example/#auth=reset-password&token=fixture-only',
      ),
    ],
    ['invitation', invitationMail[0]],
    ['security', securityMail[0]],
  ] as const;
  const preview = await browser.newPage();
  let externalRequests = 0;
  preview.on('request', () => externalRequests++);
  for (const width of [680, 390, 320]) {
    await preview.setViewportSize({ width, height: 1000 });
    for (const [name, mail] of previews) {
      await preview.setContent(mail.html);
      await expect(preview.getByRole('heading', { level: 1 })).toBeVisible();
      assert.ok(
        await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        name + ' overflows ' + width,
      );
      const action = await preview.locator('a').first().boundingBox();
      assert.ok(action && action.height >= 44);
      await preview.screenshot({ path: `test-results/mail-${name}-${width}.png`, fullPage: true });
      if (width === 680) await writeFile(`test-results/mail-${name}.html`, mail.html);
    }
  }
  assert.equal(externalRequests, 0, 'mail templates have no tracking or remote asset requests');
  console.log(
    'PASS mail design: responsive HTML/plaintext, verified invitation email deduplication, private deep link, explicit acceptance and password security alert. No real email was sent.',
  );
} finally {
  await owner.close();
  await recipient.close();
  await browser.close();
}
