import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Repository } from '../apps/api/src/database.js';
import path from 'node:path';

test('repository keeps owners isolated, supports CAS and survives reopening', async () => {
  process.env.DATA_DIR = path.resolve('test-results/unit-db');
  const db = new Repository();
  await db.init();
  const id = crypto.randomUUID();
  try {
    await db.put('test', id, 'alice', { value: 1 });
    assert.equal((await db.list('test', 'bob')).length, 0);
    assert.equal(await db.compareAndSwap('test', id, 'bob', 0, { value: 2 }), false);
    assert.equal(await db.compareAndSwap('test', id, 'alice', 0, { value: 2 }), true);
    assert.equal(await db.compareAndSwap('test', id, 'alice', 0, { value: 3 }), false);
    assert.deepEqual(await db.get('test', id), { value: 2 });
    assert.equal(await db.insert('test', id, 'alice', { value: 4 }), false);
  } finally {
    await db.close();
  }
  const reopened = new Repository();
  await reopened.init();
  try {
    assert.deepEqual(await reopened.get('test', id), { value: 2 });
    await reopened.remove('test', id);
  } finally {
    await reopened.close();
  }
});
