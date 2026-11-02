// No database/mail credentials on this runner; only the dedicated scheduler bearer.
const token = process.env.REMINDER_CRON_TOKEN || '';
const origin = new URL(process.env.REMINDER_API_ORIGIN || 'https://little-days-api.onrender.com');
if (
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  origin.pathname !== '/' ||
  !(
    origin.protocol === 'https:' ||
    (origin.protocol === 'http:' && origin.hostname === '127.0.0.1')
  ) ||
  !/^[A-Za-z0-9_-]{32,256}$/.test(token)
)
  throw Error('Configure REMINDER_API_ORIGIN and REMINDER_CRON_TOKEN.');
const response = await fetch(new URL('/api/reminder-cron', origin), {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token },
  redirect: 'error',
  signal: AbortSignal.timeout(180000),
});
if (!response.ok)
  throw Error(
    'Reminder scheduler returned HTTP ' +
      response.status +
      '. No automatic retry of an ambiguous request.',
  );
const result = await response.json();
console.log(
  JSON.stringify({
    busy: result.busy === true,
    processed: Number(result.processed) || 0,
    attempted: Number(result.attempted) || 0,
  }),
);
