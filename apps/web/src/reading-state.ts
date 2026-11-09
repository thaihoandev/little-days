import { useEffect, useRef } from 'react';
export type ReadingState = {
  query?: string;
  kind?: string;
  timeline?: string;
  selected?: string;
  month?: string;
  expanded?: string[];
  count?: number;
  y?: number;
  anchor?: string;
  offset?: number;
};
const states = new Map<string, ReadingState>();
let generation = 0;
export function historyEntry() {
  if (!history.state?.littleDaysEntry)
    history.replaceState(
      { ...history.state, littleDaysEntry: crypto.randomUUID() },
      '',
      location.href,
    );
  return String(history.state.littleDaysEntry);
}
export function readingKey(actor: string, mode: string) {
  return actor + ':' + historyEntry() + ':' + mode;
}
export function getReading(key: string) {
  return states.get(key) || {};
}
export function clearReadingMemory() {
  generation++;
  states.clear();
}
export function useReadingPosition(key: string, value: ReadingState, ready: boolean) {
  const createdGeneration = useRef(generation).current;
  const initial = useRef(getReading(key)),
    latest = useRef(value),
    restored = useRef(false),
    restoring = useRef(false);
  latest.current = value;
  const save = () => {
    if (createdGeneration !== generation) return;
    if (restoring.current || !restored.current) return;
    const anchor = Array.from(document.querySelectorAll<HTMLElement>('[data-reading-id]')).find(
      (n) => n.getBoundingClientRect().bottom > 80,
    );
    states.set(key, {
      ...latest.current,
      y: window.scrollY,
      anchor: anchor?.dataset.readingId,
      offset: anchor?.getBoundingClientRect().top,
    });
    while (states.size > 40) states.delete(states.keys().next().value!);
  };
  useEffect(() => {
    if (!ready || restored.current) return;
    restoring.current = true;
    const target = initial.current;
    const place = () => {
      const node = target.anchor
        ? Array.from(document.querySelectorAll<HTMLElement>('[data-reading-id]')).find(
            (n) => n.dataset.readingId === target.anchor,
          )
        : null;
      window.scrollTo({
        top: node
          ? window.scrollY + node.getBoundingClientRect().top - (target.offset || 0)
          : target.y || 0,
        behavior: 'instant',
      });
    };
    const frame = requestAnimationFrame(place),
      observer = new ResizeObserver(place);
    observer.observe(document.body);
    const finish = () => {
      observer.disconnect();
      restoring.current = false;
      restored.current = true;
    };
    const timer = setTimeout(finish, 2000);
    // A deliberate user gesture immediately takes over scroll position.
    window.addEventListener('wheel', finish, { once: true });
    window.addEventListener('touchstart', finish, { once: true });
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('wheel', finish);
      window.removeEventListener('touchstart', finish);
    };
  }, [key, ready]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let left = false;
    const scroll = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 100);
    };
    const leave = () => {
      left = true;
      clearTimeout(timer);
      restoring.current = false;
      restored.current = true;
      save();
    };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('little-days:before-navigate', leave);
    return () => {
      clearTimeout(timer);
      if (!left) save();
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('little-days:before-navigate', leave);
    };
  }, [key]);
}
