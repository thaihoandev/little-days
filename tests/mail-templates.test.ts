import test from 'node:test';
import assert from 'node:assert/strict';
import { authMail, mailContent } from '../apps/api/src/mail-templates.js';
test('styled mail preserves accessible plaintext links, expiry and escaped content without trackers', () => {
  for (const purpose of ['verify-email', 'reset-password'] as const) {
    const url = 'https://little-days.example/#auth=' + purpose + '&token=fixture-only';
    const mail = authMail(purpose, url);
    assert.equal(mail.text.match(/https:\/\/\S+/)?.[0], url);
    assert.ok(mail.html.includes('lang="vi"'));
    assert.ok(mail.html.includes('role="presentation"'));
    assert.ok(mail.text.includes(purpose === 'verify-email' ? '24 giờ' : '15 phút'));
    assert.ok(!/<(?:script|img|iframe)\b/i.test(mail.html));
  }
  const escaped = mailContent({
    eyebrow: '<b>fixture</b>',
    title: '<script>alert(1)</script>',
    paragraphs: ['A & B'],
    action: '"Xem"',
    url: 'https://little-days.example/?a=1&b=2',
    note: 'private <note>',
  });
  assert.ok(escaped.html.includes('&lt;script&gt;'));
  assert.ok(!escaped.html.includes('<script>'));
  assert.ok(escaped.html.includes('a=1&amp;b=2'));
  for (const url of [
    'javascript:alert(1)',
    'https://name:password@example.test/',
    'http://external.example/',
  ])
    assert.throws(() =>
      mailContent({ eyebrow: '', title: '', paragraphs: [], action: '', url, note: '' }),
    );
});
