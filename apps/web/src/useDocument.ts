import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Album,
  type AlbumContent,
  albumContentSchema,
} from '../../../packages/domain/index.js';
import { api, ApiError } from './api.js';
import {
  deviceDrafts,
  draftGeneration,
  writeDeviceDraft,
  removeMatchingDraft,
  type DeviceDraft,
} from './draft-store.js';
export function contentOf(album: Album): AlbumContent {
  return {
    ...(album.documentKind ? { documentKind: album.documentKind } : {}),
    ...(album.presentation ? { presentation: album.presentation } : {}),
    ...(album.weeklyRecap ? { weeklyRecap: album.weeklyRecap } : {}),
    title: album.title,
    names: album.names,
    startDate: album.startDate,
    ...(album.startDateAnnual !== undefined ? { startDateAnnual: album.startDateAnnual } : {}),
    timezone: album.timezone,
    theme: album.theme,
    pages: album.pages,
    memories: album.memories,
  };
}
export function useDocument(initial: Album, userId: string) {
  const [album, setAlbum] = useState(initial);
  const current = useRef(initial);
  const revision = useRef(initial.revision);
  const saved = useRef(JSON.stringify(contentOf(initial)));
  const past = useRef<Album[]>([]);
  const future = useRef<Album[]>([]);
  const group = useRef<string | undefined>(undefined);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error' | 'conflict'>(
    'saved',
  );
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const busy = useRef<Promise<Album> | null>(null);
  const key = `scrapbook-draft:${userId}:${initial.id}`;
  const writer = useRef(key + ':branch:' + crypto.randomUUID());
  const draftQueue = useRef(Promise.resolve());
  const deviceGeneration = useRef(draftGeneration(userId)).current;
  const deviceSequence = useRef(0);
  const pendingDevice = useRef<DeviceDraft | null>(null);
  const deviceDrain = useRef(false);
  const [branches, setBranches] = useState<DeviceDraft[]>([]);
  const [deviceError, setDeviceError] = useState('');
  const adopted = useRef<DeviceDraft | null>(null);
  useEffect(() => {
    let alive = true;
    void deviceDrafts(key).then((rows) => {
      if (!alive) return;
      const pending = rows.filter(
        (r) => r.id !== writer.current && JSON.stringify(r.content) !== saved.current,
      );
      setBranches(pending);
      if (pending.length) setDraft(pending[0].content);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  const persistDevice = useCallback(() => {
    if (JSON.stringify(contentOf(current.current)) === saved.current) return;
    const row: DeviceDraft = {
      id: writer.current,
      scope: key,
      schemaVersion: 1,
      baseRevision: revision.current,
      at: Date.now(),
      sequence: ++deviceSequence.current,
      content: contentOf(current.current),
    };
    pendingDevice.current = row;
    if (deviceDrain.current) return;
    deviceDrain.current = true;
    draftQueue.current = draftQueue.current
      .catch(() => {})
      .then(async () => {
        try {
          while (pendingDevice.current) {
            const latest = pendingDevice.current;
            pendingDevice.current = null;
            await writeDeviceDraft(latest, deviceGeneration);
          }
        } finally {
          deviceDrain.current = false;
        }
      });
    void draftQueue.current.then(
      () => setDeviceError(''),
      () => setDeviceError('Không lưu được bản nháp trên thiết bị. Hãy lưu về máy chủ.'),
    );
  }, [key]);
  const [draft, setDraft] = useState<AlbumContent | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = albumContentSchema.safeParse(JSON.parse(raw));
      return parsed.success && JSON.stringify(parsed.data) !== saved.current ? parsed.data : null;
    } catch {
      return null;
    }
  });
  const publish = useCallback((next: Album) => {
    current.current = next;
    setAlbum(next);
  }, []);
  const edit = useCallback(
    (fn: (a: Album) => Album, groupId?: string) => {
      if (!groupId || group.current !== groupId) {
        past.current.push(structuredClone(current.current));
        if (past.current.length > 80) past.current.shift();
      }
      future.current = [];
      group.current = groupId;
      const next = fn(structuredClone(current.current));
      publish(next);
      setStatus((s) => (s === 'conflict' ? s : 'dirty'));
      setHistoryVersion((n) => n + 1);
    },
    [publish],
  );
  const undo = () => {
    const prev = past.current.pop();
    if (prev) {
      future.current.push(current.current);
      publish({ ...prev, revision: revision.current, assets: current.current.assets });
      group.current = undefined;
      setStatus('dirty');
      setHistoryVersion((n) => n + 1);
    }
  };
  const redo = () => {
    const next = future.current.pop();
    if (next) {
      past.current.push(current.current);
      publish({ ...next, revision: revision.current, assets: current.current.assets });
      group.current = undefined;
      setStatus('dirty');
      setHistoryVersion((n) => n + 1);
    }
  };
  const blocked = useRef(false);
  const flush = useCallback(async (): Promise<Album> => {
    if (blocked.current)
      throw new Error('Album có xung đột phiên bản. Hãy giữ bản nháp hoặc tải bản mới.');
    if (busy.current) {
      await busy.current;
      return flush();
    }
    const content = contentOf(current.current);
    const serialized = JSON.stringify(content);
    if (serialized === saved.current) {
      setStatus('saved');
      setRetryAt(null);
      setError('');
      return current.current;
    }
    setStatus('saving');
    setRetryAt(null);
    const request = api<Album>(`/albums/${initial.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedRevision: revision.current, content }),
    });
    busy.current = request;
    try {
      const response = await request;
      revision.current = response.revision;
      saved.current = serialized;
      publish({ ...current.current, revision: response.revision, updatedAt: response.updatedAt });
      setStatus(JSON.stringify(contentOf(current.current)) === serialized ? 'saved' : 'dirty');
      setError('');
      if (JSON.stringify(contentOf(current.current)) === serialized) {
        draftQueue.current = draftQueue.current
          .catch(() => {})
          .then(() => removeMatchingDraft(writer.current, content));
        const source = adopted.current;
        if (source) {
          draftQueue.current = draftQueue.current.then(() =>
            removeMatchingDraft(source.id, source.content),
          );
          adopted.current = null;
        }
        void draftQueue.current.catch(() =>
          setDeviceError('Đã lưu máy chủ; chưa dọn được bản nháp trên thiết bị.'),
        );
      }
    } catch (e) {
      blocked.current = e instanceof ApiError && e.status === 409;
      const maintenance =
        e instanceof ApiError && e.status === 503 && e.code === 'BACKUP_IN_PROGRESS';
      setRetryAt(maintenance ? Date.now() + (e.retryAfterMs || 15000) : null);
      setStatus(blocked.current ? 'conflict' : 'error');
      setError(
        maintenance
          ? 'Đang sao lưu dữ liệu. Thay đổi vẫn được giữ trong trang này và sẽ tự lưu lại.'
          : e instanceof Error
            ? e.message
            : 'Không lưu được.',
      );
      throw e;
    } finally {
      busy.current = null;
    }
    // Persist edits made during the preceding save before exporting or leaving.
    if (JSON.stringify(contentOf(current.current)) !== saved.current) return flush();
    return current.current;
  }, [initial.id, key, publish]);
  useEffect(() => {
    const serialized = JSON.stringify(contentOf(album));
    if (serialized === saved.current) {
      if (status === 'dirty') setStatus('saved');
      return;
    }
    persistDevice();
    if (status !== 'dirty') return;
    const timer = setTimeout(
      () => {
        void flush().catch(() => {});
      },
      Math.max(1100, (retryAt || 0) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [album, flush, key, status, retryAt, persistDevice]);
  useEffect(() => {
    if (status !== 'error' || retryAt === null) return;
    const timer = setTimeout(() => void flush().catch(() => {}), Math.max(0, retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [status, retryAt, flush]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(contentOf(current.current)) !== saved.current) {
        e.preventDefault();
      }
    };
    const hidden = () => {
      if (document.hidden) persistDevice();
    };
    if (status !== 'saved') window.addEventListener('beforeunload', before);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('beforeunload', before);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [status, persistDevice]);
  const accept = (next: Album, resetHistory = false) => {
    if (resetHistory) {
      past.current = [];
      future.current = [];
      group.current = undefined;
      setHistoryVersion((n) => n + 1);
      setDraft(null);
      const previousContent = contentOf(current.current);
      draftQueue.current = draftQueue.current
        .catch(() => {})
        .then(() => removeMatchingDraft(writer.current, previousContent));
      void draftQueue.current.catch(() =>
        setDeviceError('Đã khôi phục máy chủ; chưa dọn được bản nháp trên thiết bị.'),
      );
    }
    revision.current = next.revision;
    saved.current = JSON.stringify(contentOf(next));
    blocked.current = false;
    setRetryAt(null);
    publish(next);
    setStatus('saved');
    setError('');
  };
  const restoreDraft = (selected?: AlbumContent) => {
    const value = selected || draft;
    adopted.current = branches.find((b) => b.content === value) || null;
    if (value) edit((a) => ({ ...a, ...value }));
    setDraft(null);
  };
  const discardDraft = () => {
    const selected = branches.find((b) => b.content === draft);
    void (draft ? removeMatchingDraft(selected?.id || key, draft) : Promise.resolve()).catch(() =>
      setDeviceError('Chưa xóa được bản nháp trên thiết bị.'),
    );
    setDraft(null);
  };
  return {
    album,
    edit,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    status,
    error: error || deviceError,
    branches,
    draftSnapshot: () => ({
      schemaVersion: 1,
      albumId: initial.id,
      baseRevision: revision.current,
      content: contentOf(current.current),
    }),
    chooseDraft: (id: string) => setDraft(branches.find((b) => b.id === id)?.content || null),
    flush,
    accept,
    draft,
    restoreDraft,
    discardDraft,
    markConflict: (message: string) => {
      blocked.current = true;
      setRetryAt(null);
      setStatus('conflict');
      setError(message);
    },
    historyVersion,
  };
}
