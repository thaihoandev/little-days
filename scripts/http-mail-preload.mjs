// Explicit test-process preload only. Production code has no configurable provider endpoint.
const fixture = new URL(process.env.MAIL_FIXTURE_ORIGIN || '');
if (
  fixture.protocol !== 'http:' ||
  fixture.hostname !== '127.0.0.1' ||
  fixture.username ||
  fixture.password
)
  throw new Error('A loopback fixture is required.');
const original = globalThis.fetch;
const routes = new Map([
  ['https://api.brevo.com/v3/smtp/email', '/v3/smtp/email'],
  ['https://api.resend.com/emails', '/emails'],
]);
globalThis.fetch = (input, init) => {
  const route = routes.get(String(input));
  if (!route) throw new Error('Unexpected fetch in isolated mail API fixture.');
  return original(new URL(route, fixture), init);
};
