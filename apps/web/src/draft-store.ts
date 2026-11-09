import { albumContentSchema, type AlbumContent } from '../../../packages/domain/index.js';
export type DeviceDraft = {
  id: string;
  scope: string;
  schemaVersion: 1;
  baseRevision: number;
  at: number;
  sequence?: number;
  content: AlbumContent;
};
const generations = new Map<string, number>();
const actorOf = (scope: string) => scope.split(':')[1];
const newerOrEqual = (a: DeviceDraft, b: DeviceDraft) =>
  a.sequence !== undefined && b.sequence !== undefined ? a.sequence >= b.sequence : a.at >= b.at;
export const draftGeneration = (actor: string) => generations.get(actor) || 0;
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('little-days-drafts', 2);
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error('Kho bản nháp chưa sẵn sàng.')), 5000);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains('drafts')
        ? request.transaction!.objectStore('drafts')
        : request.result.createObjectStore('drafts', { keyPath: 'id' });
      if (!store.indexNames.contains('scope')) store.createIndex('scope', 'scope');
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error('Kho bản nháp đang bận.'));
  });
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('drafts', mode),
        request = action(tx.objectStore('drafts'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function deviceDrafts(scope: string): Promise<DeviceDraft[]> {
  const generation = draftGeneration(actorOf(scope));
  const rows = new Map<string, DeviceDraft>();
  try {
    for (const row of await transaction<DeviceDraft[]>('readonly', (s) =>
      s.index('scope').getAll(scope),
    )) {
      if (
        row.scope === scope &&
        row.schemaVersion === 1 &&
        albumContentSchema.safeParse(row.content).success
      )
        rows.set(row.id, row);
    }
  } catch {
    /* Local storage remains a fallback when IndexedDB is unavailable. */
  }
  try {
    for (const id of Object.keys(localStorage)) {
      if (id !== scope && !id.startsWith(scope + ':branch:')) continue;
      try {
        const original = localStorage.getItem(id);
        const raw = JSON.parse(original || 'null');
        const parsed = albumContentSchema.safeParse(raw?.content ?? raw);
        if (parsed.success) {
          const row: DeviceDraft = {
            id,
            scope,
            schemaVersion: 1,
            baseRevision: raw?.baseRevision ?? -1,
            at: raw?.at ?? 0,
            sequence: typeof raw?.sequence === 'number' ? raw.sequence : undefined,
            content: parsed.data,
          };
          const durable = rows.get(id);
          if (durable && !newerOrEqual(row, durable)) continue;
          rows.set(id, row);
          if (id === scope || durable) {
            try {
              await transaction('readwrite', (s) => {
                const request = s.get(row.id);
                request.onsuccess = () => {
                  if (
                    generation === draftGeneration(actorOf(scope)) &&
                    (!request.result || newerOrEqual(row, request.result))
                  )
                    s.put(row);
                };
                return request;
              });
              if (
                generation === draftGeneration(actorOf(scope)) &&
                localStorage.getItem(id) === original
              )
                localStorage.removeItem(id);
            } catch {
              /* Never remove a legacy draft before durable migration succeeds. */
            }
          }
        }
      } catch {
        /* A damaged branch must not hide other recoverable drafts. */
      }
    }
  } catch {
    /* Browser policy can disable storage. */
  }
  return [...rows.values()].sort((a, b) => b.at - a.at);
}
export async function writeDeviceDraft(
  draft: DeviceDraft,
  generation = draftGeneration(actorOf(draft.scope)),
) {
  const active = () => generation === draftGeneration(actorOf(draft.scope));
  if (!active()) return;
  const serialized = JSON.stringify(draft);
  if (serialized.length < 65536) {
    try {
      localStorage.setItem(draft.id, serialized);
    } catch {
      /* IndexedDB may still succeed. */
    }
  }
  try {
    await transaction('readwrite', (s) => {
      if (!active()) throw Error('Phiên bản nháp đã đóng.');
      return s.put(draft);
    });
  } catch {
    if (!active()) return;
    localStorage.setItem(draft.id, JSON.stringify(draft));
    return;
  }
  // Small emergency copies also survive abrupt mobile process termination.
  if (serialized.length < 65536) {
    try {
      localStorage.setItem(draft.id, serialized);
    } catch {
      /* IndexedDB succeeded. */
    }
  }
}
export async function removeDeviceDraft(id: string) {
  await transaction('readwrite', (s) => s.delete(id));
  localStorage.removeItem(id);
}
export async function removeMatchingDraft(id: string, content: AlbumContent) {
  const original = JSON.stringify(content);
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite'),
        store = tx.objectStore('drafts'),
        read = store.get(id);
      read.onsuccess = () => {
        if (read.result && JSON.stringify(read.result.content) === original) store.delete(id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  const local = JSON.parse(localStorage.getItem(id) || 'null');
  if (local && JSON.stringify(local.content ?? local) === original) localStorage.removeItem(id);
}
export async function clearDeviceDrafts(actor: string) {
  generations.set(actor, draftGeneration(actor) + 1);
  const prefix = `scrapbook-draft:${actor}:`;
  const rows = await transaction<DeviceDraft[]>('readonly', (s) =>
    s.index('scope').getAll(IDBKeyRange.bound(prefix, prefix + '\uffff')),
  );
  for (const row of rows) if (row.scope.startsWith(prefix)) await removeDeviceDraft(row.id);
}
