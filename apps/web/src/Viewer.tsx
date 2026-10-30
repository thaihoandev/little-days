import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Heart, X } from 'lucide-react';
import {
  type Album,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  todayIn,
  daysTogether,
} from '../../../packages/domain/index.js';
import { PageArtwork } from '../../../packages/scrapbook-renderer/index.js';
import { useBodyScrollLock } from './Overlays.js';

export function PagePreview({
  album,
  index = 0,
  width = 300,
}: {
  album: Album;
  index?: number;
  width?: number;
}) {
  return (
    <div style={{ width, height: (width / PAGE_WIDTH) * PAGE_HEIGHT, overflow: 'hidden' }}>
      <div style={{ transform: `scale(${width / PAGE_WIDTH})`, transformOrigin: 'top left' }}>
        <PageArtwork
          page={album.pages[index]}
          album={album}
          referenceDate={todayIn(album.timezone)}
        />
      </div>
    </div>
  );
}
export function Viewer({ album, onClose }: { album: Album; onClose?: () => void }) {
  useBodyScrollLock();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [transition, setTransition] = useState<'turn' | 'slide' | 'soft'>('turn');
  const [binding, setBinding] = useState<'stitched' | 'spiral' | 'linen'>('stitched');
  const reducedMotion = useReducedMotion();
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const turn = (delta: number) => {
    setDirection(delta < 0 ? -1 : 1);
    setIndex((i) => Math.max(0, Math.min(album.pages.length - 1, i + delta)));
  };
  const [width, setWidth] = useState(480);
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        onClose &&
        !event.defaultPrevented &&
        !document.querySelector('select:open')
      ) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => previous?.focus();
  }, []);
  const [reference, setReference] = useState(todayIn(album.timezone));
  useEffect(() => {
    const update = () => setReference(todayIn(album.timezone));
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [album.timezone]);
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(
        Math.max(
          1,
          Math.min(
            entries[0].contentRect.width - 32,
            ((entries[0].contentRect.height - 16) * PAGE_WIDTH) / PAGE_HEIGHT,
            720,
          ),
        ),
      ),
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const days = daysTogether(album.startDate, reference);
  return createPortal(
    <div
      ref={root}
      tabIndex={-1}
      className="viewer"
      role="dialog"
      aria-modal={!!onClose}
      aria-label="Xem album"
      onKeyDown={(e) => {
        const field = (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable=true]',
        );
        if (field?.matches('select:open')) return;
        if (e.key === 'Escape' && onClose) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        if (e.key === 'ArrowLeft' && !field) {
          e.preventDefault();
          e.stopPropagation();
          turn(-1);
        }
        if (e.key === 'ArrowRight' && !field) {
          e.preventDefault();
          e.stopPropagation();
          turn(1);
        }
        if (e.key === 'Tab' && onClose) {
          const items = Array.from(
            root.current!.querySelectorAll<HTMLElement>(
              'button:not(:disabled),select:not(:disabled),a[href]',
            ),
          );
          if (
            e.shiftKey &&
            (document.activeElement === items[0] || document.activeElement === root.current)
          ) {
            e.preventDefault();
            items.at(-1)?.focus();
          } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
            e.preventDefault();
            items[0]?.focus();
          }
        }
      }}
    >
      <header>
        <a className="wordmark" href="/">
          little days<span>♡</span>
        </a>
        <select
          className="viewer-binding"
          aria-label="Phong cách cuốn sổ"
          value={binding}
          onChange={(e) => setBinding(e.target.value as typeof binding)}
        >
          <option value="stitched">Sổ khâu chỉ</option>
          <option value="spiral">Sổ gáy xoắn</option>
          <option value="linen">Sổ bìa vải</option>
        </select>
        {onClose && (
          <button className="icon-button" aria-label="Đóng album" onClick={onClose}>
            <X />
          </button>
        )}
      </header>
      <div className="viewer-intro">
        <span className="eyebrow">MỘT CUỐN SỔ CỦA HAI ĐỨA</span>
        <h1>{album.names.join(' & ')}</h1>
        <p>
          {days >= 0
            ? `${days.toLocaleString('vi-VN')} ngày cùng nhau, và còn nhiều hơn thế.`
            : `Còn ${-days} ngày đến ngày của mình.`}
        </p>
      </div>
      <div className="viewer-page" ref={host}>
        <div
          className={'book-shell book-' + binding}
          style={{ width, height: (width / PAGE_WIDTH) * PAGE_HEIGHT }}
          onPointerDown={(e) => {
            if (e.button === 0) swipe.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerCancel={() => {
            swipe.current = null;
          }}
          onPointerUp={(e) => {
            const start = swipe.current;
            swipe.current = null;
            if (!start) return;
            const dx = e.clientX - start.x,
              dy = e.clientY - start.y;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) turn(dx < 0 ? 1 : -1);
          }}
        >
          <span className="book-spine" aria-hidden="true" />
          <AnimatePresence initial={false} mode="wait" custom={direction}>
            <motion.div
              key={index}
              className="book-paper"
              custom={direction}
              variants={{
                enter: (d: number) => ({
                  opacity: reducedMotion ? 1 : 0.2,
                  rotateY: !reducedMotion && transition === 'turn' ? d * 65 : 0,
                  x: !reducedMotion && transition !== 'soft' ? d * 22 : 0,
                }),
                shown: { opacity: 1, rotateY: 0, x: 0 },
                exit: (d: number) => ({
                  opacity: reducedMotion ? 1 : 0.15,
                  rotateY: !reducedMotion && transition === 'turn' ? -d * 65 : 0,
                  x: !reducedMotion && transition !== 'soft' ? -d * 22 : 0,
                }),
              }}
              initial="enter"
              animate="shown"
              exit="exit"
              transition={{
                duration: reducedMotion ? 0 : transition === 'soft' ? 0.18 : 0.36,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{ transformOrigin: 'left center' }}
            >
              <PagePreview album={album} index={index} width={width} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <nav className="viewer-controls">
        <button
          className="icon-button"
          aria-label="Trang trước"
          disabled={index === 0}
          onClick={() => turn(-1)}
        >
          <ArrowLeft />
        </button>
        <span>
          {index + 1} / {album.pages.length}
        </span>
        <button
          className="icon-button"
          aria-label="Trang sau"
          disabled={index === album.pages.length - 1}
          onClick={() => turn(1)}
        >
          <ArrowRight />
        </button>
        <select
          aria-label="Hiệu ứng lật trang"
          value={transition}
          onChange={(e) => setTransition(e.target.value as typeof transition)}
        >
          <option value="turn">Lật trang sổ</option>
          <option value="slide">Trượt giấy</option>
          <option value="soft">Mờ nhẹ</option>
        </select>
      </nav>
      <div className="semantic-album">
        <h2>{album.title}</h2>
        {album.pages.map((p) => (
          <section key={p.id}>
            <h3>{p.title}</h3>
            {p.elements
              .filter((e) => e.type === 'text' && e.visible !== false)
              .map((e) => (
                <p key={e.id}>{e.text}</p>
              ))}
          </section>
        ))}
      </div>
      <footer>
        <Heart size={13} /> Những điều bình thường, được thương thật nhiều.
      </footer>
    </div>,
    document.body,
  );
}
