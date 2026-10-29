import { createMailer } from '../apps/api/src/mail.js';
const mail = createMailer('test-results/smtp-probe');
try {
  await mail.send({
    to: 'recipient@example.test',
    subject: 'SMTP fixture delivery',
    text: 'Private mail over TLS, sent to a local fixture only.',
  });
  console.log('SMTP TLS client passed.');
} finally {
  mail.close();
}
