import { useEffect } from 'react';

/** Animate headings only. Keep form nodes, canvas coordinates and dialog containing blocks stable. */
export function usePageMotion(path: string, waiting: boolean) {
  useEffect(() => {
    if (waiting || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const headers = document.querySelectorAll<HTMLElement>(
      '.dashboard .journal-hero, .dashboard .albums-section > .section-heading, .dashboard .library-hero, .dashboard .ritual-heading',
    );
    const animations = Array.from(headers).map((node) =>
      node.animate(
        [
          { opacity: 0.35, transform: 'translateY(7px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' },
      ),
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [path, waiting]);
}
