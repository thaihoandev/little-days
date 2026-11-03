import { useEffect, useRef, useState } from 'react';
import { ElementContent } from '../../../packages/scrapbook-renderer/index.js';
import type { Album, ScrapElement } from '../../../packages/domain/index.js';
const previews = new Map<string, string>();
// Only built-in SVG decorations enter this cache. Original artwork and saved layouts stay intact.
export function DecorationPreview({ src, small = false }: { src: string; small?: boolean }) {
  const [preview, setPreview] = useState(() => previews.get(src) || src);
  useEffect(() => setPreview(previews.get(src) || src), [src]);
  return (
    <div className={'decoration-preview' + (small ? ' small' : '')}>
      <img
        src={preview}
        alt=""
        data-normalized={preview !== src}
        onLoad={(event) => {
          if (preview !== src || !src.startsWith('data:image/svg+xml')) return;
          const image = event.currentTarget;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 192;
            canvas.height = 192;
            const ctx = canvas.getContext('2d')!;
            const fit = Math.min(192 / image.naturalWidth, 192 / image.naturalHeight);
            ctx.drawImage(image, 0, 0, image.naturalWidth * fit, image.naturalHeight * fit);
            const data = ctx.getImageData(0, 0, 192, 192).data;
            let left = 192,
              top = 192,
              right = -1,
              bottom = -1;
            for (let y = 0; y < 192; y++)
              for (let x = 0; x < 192; x++)
                if (data[(y * 192 + x) * 4 + 3] > 2) {
                  left = Math.min(left, x);
                  right = Math.max(right, x);
                  top = Math.min(top, y);
                  bottom = Math.max(bottom, y);
                }
            if (right < left) return;
            const result = document.createElement('canvas');
            result.width = 128;
            result.height = 128;
            const out = result.getContext('2d')!,
              w = right - left + 1,
              h = bottom - top + 1,
              scale = 116 / Math.max(w, h);
            out.drawImage(
              canvas,
              left,
              top,
              w,
              h,
              (128 - w * scale) / 2,
              (128 - h * scale) / 2,
              w * scale,
              h * scale,
            );
            const url = result.toDataURL('image/png');
            if (previews.size >= 64) previews.delete(previews.keys().next().value!);
            previews.set(src, url);
            setPreview(url);
          } catch {
            /* Original static SVG remains a safe fallback. */
          }
        }}
      />
    </div>
  );
}
export function CounterPresetPreview({
  element,
  album,
  referenceDate,
}: {
  element: ScrapElement;
  album: Album;
  referenceDate: string;
}) {
  const host = useRef<HTMLSpanElement>(null),
    [width, setWidth] = useState(100);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(Math.max(1, width - 12) / element.width, 76 / element.height);
  return (
    <span className="counter-preset-art" ref={host}>
      <span
        style={{
          width: element.width,
          height: element.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <ElementContent element={element} album={album} referenceDate={referenceDate} />
      </span>
    </span>
  );
}
