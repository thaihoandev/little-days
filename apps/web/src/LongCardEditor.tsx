import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Album } from '../../../packages/domain/index.js';
import { PagePreview } from './Viewer.js';

export function LongCardEditor({
  album,
  pageId,
  onSelect,
  zoom,
  children,
}: {
  album: Album;
  pageId: string;
  onSelect: (id: string) => void;
  zoom: number;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(360);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([e]) => setWidth(Math.max(72, e.contentRect.width)));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const scrolling = album.presentation?.readingMode === 'scroll';
  useEffect(() => {
    if (scrolling)
      root.current?.querySelector('[data-active=true]')?.scrollIntoView({ block: 'nearest' });
  }, [pageId, scrolling]);
  return (
    <div ref={root} className={scrolling ? 'long-card-editor' : 'single-page-editor'}>
      {scrolling
        ? album.pages.map((page, i) => (
            <section key={page.id} data-active={page.id === pageId}>
              <button
                className="long-section-label"
                aria-pressed={page.id === pageId}
                onClick={() => onSelect(page.id)}
              >
                Phần {i + 1} · {page.title}
                {page.id === pageId ? ' · đang sửa' : ' · bấm để sửa'}
              </button>
              {page.id === pageId ? (
                children
              ) : (
                <button
                  className="long-section-preview"
                  aria-label={`Sửa phần ${i + 1}`}
                  onClick={() => onSelect(page.id)}
                >
                  <PagePreview
                    album={album}
                    index={i}
                    width={Math.max(72, Math.min(width - 72, 720 * 0.76) * zoom)}
                    thumbnails
                  />
                </button>
              )}
            </section>
          ))
        : children}
    </div>
  );
}
