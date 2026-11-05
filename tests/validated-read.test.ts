import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidatedReads } from '../apps/web/src/validated-read.js';

test('reuses payload after validating current actor, scope and revisions; callers cannot mutate cache', async () => {
  const cache = new ValidatedReads();
  let stamp = { scope: 'alice-shared', version: '1' },
    payloads = 0,
    validations = 0;
  const read = async <T>(path: string): Promise<T> => {
    if (path === '/journal-state') {
      validations++;
      return stamp as T;
    }
    payloads++;
    return { items: [{ id: String(payloads) }] } as T;
  };
  const first = await cache.read<{ items: { id: string }[] }>('/library/photos?q=', read);
  first.items.length = 0;
  assert.equal((await cache.read<typeof first>('/library/photos?q=', read)).items.length, 1);
  assert.equal(payloads, 1);
  assert.equal(validations, 2);
  stamp = { ...stamp, version: '2' };
  await cache.read('/library/photos?q=', read);
  stamp = { ...stamp, scope: 'bob-private' };
  await cache.read('/library/photos?q=', read);
  await cache.read('/library/photos?q=another', read);
  assert.equal(payloads, 4);
  cache.clear();
  await cache.read('/library/photos?q=', read);
  assert.equal(payloads, 5);
});

test('validation failure never falls back to cached private data', async () => {
  const cache = new ValidatedReads();
  let denied = false;
  const read = async <T>(path: string): Promise<T> => {
    if (denied) throw Error('Access revoked');
    return (path === '/journal-state' ? { scope: 'alice', version: '1' } : { secret: true }) as T;
  };
  await cache.read('/library/feed', read);
  denied = true;
  await assert.rejects(cache.read('/library/feed', read), /Access revoked/);
});

test('bounded memory evicts old queries and concurrent validations share one request', async () => {
  const cache = new ValidatedReads();
  let validations = 0,
    payloads = 0;
  const read = async <T>(path: string): Promise<T> => {
    if (path === '/journal-state') {
      validations++;
      return { scope: 'alice', version: '1' } as T;
    }
    payloads++;
    return { items: [path] } as T;
  };
  await Promise.all([cache.read('/feed', read), cache.read('/photos', read)]);
  assert.equal(validations, 1);
  for (let i = 0; i < 33; i++) await cache.read('/query/' + i, read);
  const before = payloads;
  await cache.read('/feed', read);
  assert.equal(payloads, before + 1);
});

test('in-flight invalidation and aborted consumers cannot publish stale results', async () => {
  const cache = new ValidatedReads();
  let release!: (value: any) => void;
  const read = <T>(): Promise<T> =>
    new Promise((resolve) => {
      release = resolve;
    });
  const result = cache.read('/library/feed', read);
  cache.clear();
  release({ scope: 'alice', version: '1' });
  await assert.rejects(result, { name: 'ReadInvalidatedError' });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(cache.read('/library/feed', read, controller.signal), {
    name: 'AbortError',
  });
});

test('simultaneous identical reads do not double-count retained memory', async () => {
  const cache = new ValidatedReads();
  const payload = { text: 'x'.repeat(900000) };
  const read = async <T>(path: string): Promise<T> =>
    (path === '/journal-state' ? { scope: 'alice', version: '1' } : payload) as T;
  for (let i = 0; i < 12; i++) {
    const values = await Promise.all([
      cache.read<typeof payload>('/photos?q=' + i, read),
      cache.read<typeof payload>('/photos?q=' + i, read),
    ]);
    assert.equal(values[0].text.length, payload.text.length);
  }
});
