import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AlbumHistory } from '../apps/api/src/history.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { TimelineSharing } from '../apps/api/src/timeline-sharing.js';
import { AccountSecurity, authHash, passwordHash, type Account } from '../apps/api/src/auth.js';
import { ActivityMail } from '../apps/api/src/activity-mail.js';
import { MailDeliveryError, type Mail, type Mailer } from '../apps/api/src/mail.js';
import { createBackup, restoreBackup } from '../apps/api/src/backup.js';

async function fixture() {
  const root = path.resolve('test-results/activity-mail', randomUUID()),
    db = new Repository({ dataDir: root, databaseUrl: process.env.TEST_DATABASE_URL || '' });
  await db.init();
  const jobs = new JobRepository(db);
  await jobs.init();
  await new AlbumHistory(db).init();
  const store = new LocalMediaStore(root);
  await store.ready();
  const deletion = new AccountDeletion(db, jobs, store, root);
  await deletion.init();
  await new ResourcePolicy(db, store).init();
  const sent: Mail[] = [],
    mailer: Mailer = {
      kind: 'fixture',
      async send(mail) {
        sent.push(mail);
      },
      close() {},
    };
  const security = new AccountSecurity(db, mailer, 'https://little-days.example', deletion);
  await security.init();
  const salt = randomUUID(),
    password = (await passwordHash('Mail-fixture-123!', salt)).toString('hex');
  const accounts: Account[] = Array.from({ length: 3 }, () => {
    const id = randomUUID();
    return {
      id,
      email: id + '@example.test',
      emailVerifiedAt: new Date().toISOString(),
      salt,
      password,
      credentialVersion: 0,
    };
  });
  for (const account of accounts)
    await db.insert('account', authHash(account.email), account.id, account);
  return {
    root,
    db,
    jobs,
    store,
    deletion,
    security,
    accounts,
    sent,
    mailer,
    sharing: new TimelineSharing(db, deletion),
    make: (mail = mailer) => new ActivityMail(db, deletion, mail, security.origin),
    async close() {
      for (const { id } of accounts) {
        for (const table of [
          'owner_operations',
          'media_objects',
          'managed_media',
          'account_deletions',
        ])
          if (await db.hasTable(table))
            await db.query('DELETE FROM ' + table + ' WHERE owner=? RETURNING owner', [id]);
        await db.query('DELETE FROM records WHERE owner=? RETURNING id', [id]);
      }
      await db.close();
    },
  };
}

test('invitation mail is private, deduplicated across concurrent requests/restart and backup restore', async () => {
  const f = await fixture(),
    [sender, recipient] = f.accounts;
  try {
    const grant = await f.sharing.invite(sender.id, { email: recipient.email });
    await Promise.all([f.make().invitation(grant), f.make().invitation(grant)]);
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].to, recipient.email);
    assert.ok(f.sent[0].html?.includes('Xem lời mời'));
    assert.ok(f.sent[0].text.includes('/timeline?sharing=1'));
    assert.ok(!f.sent[0].text.includes(sender.email));
    assert.equal(await f.make().invitation(grant), 'accepted');
    assert.equal(f.sent.length, 1);
    const receipts = await f.db.list('activity-mail', recipient.id);
    assert.equal(receipts.length, 1);
    assert.ok(!JSON.stringify(receipts).includes(recipient.email));
    if (f.db.driver === 'sqlite') {
      const snapshot = path.join(f.root, 'backup');
      await createBackup(f.db, f.store, snapshot);
      const root = path.join(f.root, 'restored'),
        db = new Repository({ dataDir: root, databaseUrl: '' }),
        store = new LocalMediaStore(root);
      await db.init();
      try {
        await restoreBackup(db, store, snapshot, true);
        const jobs = new JobRepository(db);
        await jobs.init();
        const deletion = new AccountDeletion(db, jobs, store, root);
        await deletion.init();
        assert.equal(
          await new ActivityMail(db, deletion, f.mailer, f.security.origin).invitation(grant),
          'accepted',
        );
        assert.equal(f.sent.length, 1, 'restored receipts do not resend old messages');
      } finally {
        await db.close();
      }
    }
  } finally {
    await f.close();
  }
});

test('ambiguous provider failures never retry and invitation remains usable', async () => {
  const f = await fixture(),
    [sender, recipient] = f.accounts;
  try {
    const grant = await f.sharing.invite(sender.id, { email: recipient.email });
    let attempts = 0;
    const mailer: Mailer = {
      kind: 'fixture',
      async send() {
        attempts++;
        throw new MailDeliveryError('brevo', 'unavailable_or_invalid_response');
      },
      close() {},
    };
    assert.equal(await f.make(mailer).invitation(grant), 'unknown');
    assert.equal(await f.make(mailer).invitation(grant), 'unknown');
    assert.equal(attempts, 1);
    assert.equal((await f.sharing.state(recipient.id)).grants[0].state, 'pending');
  } finally {
    await f.close();
  }
});

test('revoked invitations, unverified accounts and account deletion cannot send; deletion removes cross-owner receipts', async () => {
  const f = await fixture(),
    [sender, recipient, other] = f.accounts;
  try {
    const grant = await f.sharing.invite(sender.id, { email: recipient.email });
    await f.sharing.change(sender.id, grant.id, { expectedRevision: 0 }, true);
    assert.equal(await f.make().invitation(grant), 'skipped');
    const next = await f.sharing.invite(sender.id, { email: other.email });
    await f.db.put('account', authHash(other.email), other.id, {
      ...other,
      emailVerifiedAt: undefined,
    });
    assert.equal(await f.make().invitation(next), 'skipped');
    await f.db.put('account', authHash(other.email), other.id, other);
    assert.equal(await f.make().invitation(next), 'accepted');
    assert.equal((await f.db.list('activity-mail', other.id)).length, 1);
    await f.deletion.request(sender.id, 'Mail-fixture-123!', f.security);
    assert.equal(await f.make().invitation(next), 'unknown');
    assert.equal(f.sent.length, 1);
    await f.deletion.tick();
    assert.equal((await f.db.list('activity-mail', other.id)).length, 0);
  } finally {
    await f.close();
  }
});

test('password alerts follow credential versions; per-recipient daily cap and retention bound receipts', async () => {
  const f = await fixture(),
    account = f.accounts[0];
  try {
    await f.db.insert('activity-mail', 'expired-fixture', account.id, {
      id: 'expired-fixture',
      purpose: 'password-changed',
      timelineOwner: account.id,
      recipientId: account.id,
      createdAt: Date.now() - 31 * 86400000,
      delivery: 'accepted',
      revision: 0,
    });
    for (let version = 1; version <= 6; version++) {
      const current = { ...account, credentialVersion: version };
      await f.db.put('account', authHash(account.email), account.id, current);
      assert.equal(
        await f.make().passwordChanged(current),
        version <= 5 ? 'accepted' : 'throttled',
      );
    }
    assert.equal(f.sent.length, 5);
    assert.equal((await f.db.list('activity-mail', account.id)).length, 5);
    assert.equal(await f.make().passwordChanged(account), 'skipped');
    assert.ok(
      f.sent.every(
        (mail) => !mail.text.includes('Mail-fixture-123!') && !mail.text.includes('token='),
      ),
    );
    assert.equal(
      await f
        .make({
          kind: 'disabled',
          async send() {
            throw Error('Must not send');
          },
          close() {},
        })
        .passwordChanged(account),
      'disabled',
    );
  } finally {
    await f.close();
  }
});
