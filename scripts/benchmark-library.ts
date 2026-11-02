import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { Repository } from '../apps/api/src/database.js';
import { JobRepository } from '../apps/api/src/jobs.js';
import { AccountDeletion } from '../apps/api/src/account-deletion.js';
import { ResourcePolicy } from '../apps/api/src/resource-policy.js';
import { LocalMediaStore } from '../apps/api/src/storage.js';
import { JournalService } from '../apps/api/src/journal.js';
import { LibraryService } from '../apps/api/src/library.js';
import { createAlbumContent, element, type Album, type Asset } from '../packages/domain/index.js';
import type { JournalEntry } from '../packages/domain/journal.js';

const root = path.resolve('test-results/library-benchmark', crypto.randomUUID()),
  owner = crypto.randomUUID();
const db = new Repository({ dataDir: root, databaseUrl: '' });
await db.init();
const jobs = new JobRepository(db);
await jobs.init();
const store = new LocalMediaStore(root),
  deletion = new AccountDeletion(db, jobs, store, root);
await deletion.init();
const resources = new ResourcePolicy(db, store, root);
await resources.init();
const journal = new JournalService(db, store, resources, deletion),
  library = new LibraryService(db, journal);
const asset = (prefix: string): Asset => {
  const id = crypto.randomUUID();
  return {
    id,
    name: 'fixture.webp',
    width: 1600,
    height: 1200,
    bytes: 100000,
    url: '/api/' + prefix + '/assets/' + id,
  };
};
const now = new Date().toISOString();
try {
  await db.transaction(async () => {
    for (let i = 0; i < 12; i++) {
      const id = crypto.randomUUID(),
        content = createAlbumContent();
      const album: Album = {
        ...content,
        id,
        revision: 0,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        assets: Array.from({ length: 100 }, () => asset('albums/' + id)),
      };
      album.pages = Array.from({ length: 20 }, () => ({
        ...content.pages[0],
        id: crypto.randomUUID(),
        elements: Array.from({ length: 60 }, () =>
          element('text', { text: 'Một câu chuyện được lưu giữ. '.repeat(10) }),
        ),
      }));
      await db.insert('album', id, owner, album);
    }
    for (let i = 0; i < 450; i++) {
      const id = crypto.randomUUID(),
        entry: JournalEntry = {
          id,
          title: 'Kỉ niệm ' + i,
          date: '2026-11-02',
          note: 'Những điều mình muốn giữ. '.repeat(180),
          kind: 'memory',
          annual: false,
          revision: 0,
          createdAt: now,
          updatedAt: now,
          assets: Array.from({ length: 4 }, () => asset('journal/' + id)),
        };
      await db.insert('journal', id, owner, entry);
    }
  });
  async function measure(name: string, old: () => Promise<unknown>, next: () => Promise<unknown>) {
    const sample = async (fn: () => Promise<unknown>) => {
      const times: number[] = [];
      let bytes = 0;
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const value = await fn();
        bytes = Buffer.byteLength(JSON.stringify(value));
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      return { bytes, p50Ms: Math.round(times[2]), p95Ms: Math.round(times[4]) };
    };
    const before = await sample(old),
      after = await sample(next);
    return {
      name,
      before,
      after,
      payloadReductionPercent: Math.round((1 - after.bytes / before.bytes) * 1000) / 10,
    };
  }
  const results = [];
  results.push(
    await measure(
      'album initial list',
      () => db.list<Album>('album', owner),
      () => library.summaries(owner),
    ),
  );
  results.push(
    await measure(
      'timeline first page',
      () => journal.list(owner),
      () => library.page(owner, { limit: 20 }),
    ),
  );
  results.push(
    await measure(
      'photo library first page',
      async () => ({
        albums: await db.list<Album>('album', owner),
        journal: await journal.list(owner),
      }),
      () => library.page(owner, { limit: 60 }, true),
    ),
  );
  const report = {
    scope:
      'isolated SQLite fixture, 12 albums × 20 pages × 60 elements, 450 milestones, 3000 image metadata rows; no production/network speed claim',
    results,
  };
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/library-performance-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await db.close();
}
