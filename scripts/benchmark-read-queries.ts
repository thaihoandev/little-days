import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { JournalService } from '../apps/api/src/journal.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { authHash } from '../apps/api/src/auth.js';
const root = path.resolve('test-results/query-diagnosis', randomUUID());
const db = new Repository({ dataDir: root, databaseUrl: '' });
await db.init();
try {
  const jobs = new JobRepository(db);
  await jobs.init();
  const store = new LocalMediaStore(root);
  await store.ready();
  const deletion = new AccountDeletion(db, jobs, store, root);
  await deletion.init();
  const resources = new ResourcePolicy(db, store);
  await resources.init();
  const journal = new JournalService(db, store, resources, deletion);
  const users = [randomUUID(), randomUUID()],
    emails = users.map((id) => id + '@fixture.test');
  for (const [i, id] of users.entries())
    await db.insert('account', authHash(emails[i]), id, {
      id,
      email: emails[i],
      emailVerifiedAt: new Date().toISOString(),
      revision: 0,
    });
  const original = db.query.bind(db);
  let count = 0;
  db.query = async (sql, values = []) => {
    count++;
    return original(sql, values);
  };
  for (const paired of [false, true]) {
    if (paired) {
      const grant = await journal.sharing.invite(users[0], { email: emails[1] });
      await journal.sharing.change(users[1], grant.id, { expectedRevision: 0, action: 'accept' });
    }
    for (const actor of users) {
      count = 0;
      const start = performance.now();
      await journal.state(actor);
      console.log(
        JSON.stringify({
          scope: paired ? 'paired' : 'private',
          role: actor === users[0] ? 'owner' : 'member',
          sqlQueries: count,
          localSqliteMs: Math.round(performance.now() - start),
          includesHttpMiddleware: false,
        }),
      );
    }
  }
} finally {
  await db.close();
}
