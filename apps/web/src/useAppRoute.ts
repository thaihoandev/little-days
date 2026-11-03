import { useEffect, useState } from 'react';
export const sectionPaths = {
  home: '/today',
  timeline: '/timeline',
  calendar: '/calendar',
  albums: '/albums',
  photos: '/photos',
  together: '/together',
} as const;
export type AppSection = keyof typeof sectionPaths;
export function parseRoute(path: string): {
  section: AppSection;
  albumId?: string;
  unknown?: boolean;
} {
  if (path === '/' || path === '/today') return { section: 'home' };
  const album = /^\/albums\/([a-f0-9-]{36})\/?$/i.exec(path);
  if (album) return { section: 'albums', albumId: album[1] };
  const item = Object.entries(sectionPaths).find(([, value]) => value === path.replace(/\/$/, ''));
  return item ? { section: item[0] as AppSection } : { section: 'home', unknown: true };
}
export function useAppRoute() {
  const [locationKey, setLocationKey] = useState(() => location.pathname + location.search);
  const pathname = locationKey.split('?')[0],
    search = locationKey.includes('?') ? locationKey.slice(locationKey.indexOf('?')) : '';
  useEffect(() => {
    const back = () => setLocationKey(location.pathname + location.search);
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const navigate = (path: string, replace = false) => {
    const target = new URL(path, location.origin);
    if (target.origin !== location.origin) throw new Error('Chỉ điều hướng trong ứng dụng.');
    const next = target.pathname + target.search;
    if (location.pathname + location.search !== next) {
      history[replace ? 'replaceState' : 'pushState'](null, '', next);
      setLocationKey(next);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };
  return { route: parseRoute(pathname), pathname, search, navigate };
}
