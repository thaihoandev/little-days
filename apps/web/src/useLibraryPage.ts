import { useCallback, useEffect, useRef, useState } from 'react';
import type { LibraryPage } from '../../../packages/domain/library.js';
import { api } from './api.js';

export function useDebounced<T>(value: T, delay = 250) {
  const [ready, setReady] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setReady(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return ready;
}
export function useLibraryPage<T extends { id?: string; key?: string }>(
  path: string,
  enabled: boolean,
) {
  const [items, setItems] = useState<T[]>([]),
    [total, setTotal] = useState(0),
    [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled),
    [error, setError] = useState(''),
    [epoch, setEpoch] = useState(0);
  const [stats, setStats] = useState<LibraryPage<T>['stats']>();
  const version = useRef(0),
    controller = useRef<AbortController | null>(null),
    busy = useRef(false);
  const request = useCallback(
    async (cursor?: string) => {
      if (!enabled || (cursor && busy.current)) return;
      controller.current?.abort();
      const abort = new AbortController(),
        current = ++version.current;
      controller.current = abort;
      busy.current = true;
      setLoading(true);
      setError('');
      try {
        const page = await api<LibraryPage<T>>(
          path + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
          { signal: abort.signal },
        );
        if (current !== version.current) return;
        setItems((previous) =>
          cursor
            ? [
                ...new Map(
                  [...previous, ...page.items].map((row) => [row.key || row.id, row]),
                ).values(),
              ]
            : page.items,
        );
        setTotal(page.total);
        setNextCursor(page.nextCursor);
        setStats(page.stats);
      } catch (e) {
        if (current === version.current && !abort.signal.aborted) setError((e as Error).message);
      } finally {
        if (current === version.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [path, enabled],
  );
  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    setTotal(0);
    if (enabled) void request();
    else setLoading(false);
    return () => {
      controller.current?.abort();
      version.current++;
      busy.current = false;
    };
  }, [request, epoch, enabled]);
  return {
    items,
    setItems,
    total,
    stats,
    nextCursor,
    loading,
    error,
    loadMore: () => nextCursor && void request(nextCursor),
    refresh: () => setEpoch((v) => v + 1),
    retry: () => void request(),
  };
}
