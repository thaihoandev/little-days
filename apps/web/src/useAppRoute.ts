import { useEffect, useState } from 'react';
export const sectionPaths = {
  home: '/today',
  timeline: '/timeline',
  calendar: '/calendar',
  albums: '/albums',
  photos: '/photos',
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
  const [pathname, setPathname] = useState(() => location.pathname);
  useEffect(() => {
    const back = () => setPathname(location.pathname);
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const navigate = (path: string, replace = false) => {
    if (location.pathname !== path || location.search) {
      history[replace ? 'replaceState' : 'pushState'](null, '', path);
      setPathname(path);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };
  return { route: parseRoute(pathname), pathname, navigate };
}
