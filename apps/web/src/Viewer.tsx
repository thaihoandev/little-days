import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Heart, X, Music2, VolumeX } from 'lucide-react';
import {
  type Album,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  todayIn,
  daysTogether,
  defaultPresentation,
  type AlbumPresentation,
} from '../../../packages/domain/index.js';
import { PageArtwork } from '../../../packages/scrapbook-renderer/index.js';
import { thumbnailUrl } from './thumbnail.js';
import { useBodyScrollLock } from './Overlays.js';
import { LegalLinks } from './LegalLinks.js';
import { builtInMusic } from '../../../packages/domain/music.js';
import { PreviewAudio } from './PreviewAudio.js';

function useMotionPreference() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function PagePreview({
  album,
  index = 0,
  width = 300,
  thumbnails = false,
  animateEffects = false,
}: {
  album: Album;
  index?: number;
  width?: number;
  thumbnails?: boolean;
  animateEffects?: boolean;
}) {
  const [reduced, setReduced] = useState(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
    [effectTime, setEffectTime] = useState(0);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  const hasEffects = album.pages[index]?.elements.some(
    (element) => element.visualEffect && element.visualEffect !== 'none',
  );
  const hasEntrance = album.pages[index]?.elements.some((e) => e.animation !== 'none');
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (!animateEffects || reduced || !visible || (!hasEffects && !hasEntrance)) {
      setEffectTime(0);
      return;
    }
    let handle = 0,
      last = -1;
    const start = performance.now();
    const tick = (now: number) => {
      const frame = Math.floor(((now - start) * 30) / 1000);
      if (frame !== last) {
        setEffectTime(frame / 30);
        last = frame;
      }
      if (hasEffects || frame < 90) handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [animateEffects, reduced, visible, index, hasEffects, hasEntrance]);
  return (
    <div style={{ width, height: (width / PAGE_WIDTH) * PAGE_HEIGHT, overflow: 'hidden' }}>
      <div style={{ transform: `scale(${width / PAGE_WIDTH})`, transformOrigin: 'top left' }}>
        <PageArtwork
          page={album.pages[index]}
          album={
            thumbnails
              ? { ...album, assets: album.assets.map((a) => ({ ...a, url: thumbnailUrl(a.url) })) }
              : album
          }
          imageComponent={PreviewImage}
          referenceDate={todayIn(album.timezone)}
          effectTime={effectTime}
          elementStyle={
            animateEffects && !reduced && visible
              ? (e, i) => {
                  if (e.animation === 'none') return {};
                  const t = Math.min(1, Math.max(0, (effectTime - i * 0.04) / 0.5));
                  const progress = 1 - (1 - t) ** 3;
                  return {
                    opacity: e.opacity * progress,
                    transform: `translateY(${(1 - progress) * (e.animation === 'drop' ? -65 : e.animation === 'fade' ? 0 : 35)}px) rotate(${e.rotation}deg)`,
                  };
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
function PreviewImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} loading="lazy" decoding="async" />;
}
export function Viewer({
  album,
  onClose,
  onPresentationChange,
}: {
  album: Album;
  onClose?: () => void;
  onPresentationChange?: (value: AlbumPresentation) => void;
}) {
  useBodyScrollLock();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const presentation = album.presentation || defaultPresentation;
  const scrolling = presentation.readingMode === 'scroll';
  const [transition, setTransition] = useState(presentation.transition);
  const [binding, setBinding] = useState(presentation.binding);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false),
    [audioError, setAudioError] = useState('');
  const track = builtInMusic(presentation.musicId);
  const source = track
    ? `/audio/${track.file}`
    : presentation.musicId === 'custom'
      ? onClose
        ? `/api/albums/${album.id}/audio/${presentation.audioId}`
        : album.previewAudio?.url
      : undefined;
  useEffect(() => {
    if (audio.current) audio.current.volume = presentation.volume;
  }, [presentation.volume, source]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) audio.current?.pause();
    };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  const reducedMotion = useMotionPreference();
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const turn = (delta: number) => {
    setDirection(delta < 0 ? -1 : 1);
    setIndex((i) => Math.max(0, Math.min(album.pages.length - 1, i + delta)));
  };
  const [width, setWidth] = useState(480);
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document
      .querySelectorAll<HTMLAudioElement>('.preview-audio-editor audio')
      .forEach((node) => node.pause());
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        onClose &&
        !event.defaultPrevented &&
        !document.querySelector('select:open,dialog[open]')
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
            scrolling ? 720 : ((entries[0].contentRect.height - 16) * PAGE_WIDTH) / PAGE_HEIGHT,
            720,
          ),
        ),
      ),
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [scrolling]);
  const days = daysTogether(album.startDate, reference);
  return createPortal(
    <div
      ref={root}
      tabIndex={-1}
      className={
        'viewer' +
        (!onClose ? ' shared-viewer' : '') +
        (album.documentKind === 'invitation' ? ' invitation-viewer' : '') +
        (scrolling ? ' scroll-reader' : '')
      }
      role="dialog"
      aria-modal={!!onClose}
      aria-label="Xem album"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('dialog[open]')) return;
        const field = (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable=true]',
        );
        if (field?.matches('select:open')) return;
        if (e.key === 'Escape' && onClose) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        if (e.key === 'ArrowLeft' && !field && !scrolling) {
          e.preventDefault();
          e.stopPropagation();
          turn(-1);
        }
        if (e.key === 'ArrowRight' && !field && !scrolling) {
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
        {onClose && !scrolling && (
          <select
            className="viewer-binding"
            aria-label="Phong cách cuốn sổ"
            value={binding}
            onChange={(e) => {
              const binding = e.target.value as typeof presentation.binding;
              setBinding(binding);
              onPresentationChange?.({ ...presentation, binding });
            }}
          >
            <option value="stitched">Sổ khâu chỉ</option>
            <option value="spiral">Sổ gáy xoắn</option>
            <option value="linen">Sổ bìa vải</option>
          </select>
        )}
        {onClose && (
          <button className="icon-button" aria-label="Đóng album" onClick={onClose}>
            <X />
          </button>
        )}
      </header>
      <div className="viewer-intro">
        <span className="eyebrow">
          {album.documentKind === 'invitation'
            ? 'MỘT LỜI MỜI DÀNH CHO BẠN'
            : 'MỘT CUỐN SỔ CỦA HAI ĐỨA'}
        </span>
        <h1>{album.documentKind === 'invitation' ? album.title : album.names.join(' & ')}</h1>
        <p>
          {album.documentKind === 'invitation'
            ? 'Một ngày đặc biệt, mong có bạn ở đây.'
            : days >= 0
              ? `${days.toLocaleString('vi-VN')} ngày cùng nhau, và còn nhiều hơn thế.`
              : `Còn ${-days} ngày đến ngày của mình.`}
        </p>
      </div>
      <div className="viewer-page" ref={host}>
        {scrolling ? (
          <div className="scroll-story" style={{ width }}>
            {album.pages.map((page, i) => (
              <ScrollSection key={page.id} album={album} index={i} width={width} />
            ))}
          </div>
        ) : (
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
                <PagePreview album={album} index={index} width={width} animateEffects />
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
      <nav className="viewer-controls">
        {!scrolling && (
          <>
            {' '}
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
            {onClose && (
              <select
                aria-label="Hiệu ứng lật trang"
                value={transition}
                onChange={(e) => {
                  const transition = e.target.value as typeof presentation.transition;
                  setTransition(transition);
                  onPresentationChange?.({ ...presentation, transition });
                }}
              >
                <option value="turn">Lật trang sổ</option>
                <option value="slide">Trượt giấy</option>
                <option value="soft">Mờ nhẹ</option>
              </select>
            )}
          </>
        )}
        {scrolling && <span>Thiệp cuộn · {album.pages.length} phần</span>}
        {source && (
          <>
            <PreviewAudio
              audioRef={audio}
              source={source}
              presentation={presentation}
              autoStart
              onPlaying={setPlaying}
              onError={() => {
                setPlaying(false);
                setAudioError('Chưa phát được nhạc. Bạn vẫn có thể xem các trang.');
              }}
            />
            <button
              className="viewer-music"
              aria-label={playing ? 'Tắt nhạc' : 'Bật nhạc'}
              aria-pressed={playing}
              onClick={() => {
                if (playing) audio.current?.pause();
                else {
                  setAudioError('');
                  void audio.current?.play().catch(() => {
                    setAudioError('Chưa phát được nhạc. Bấm bật nhạc để thử lại.');
                  });
                }
              }}
            >
              {playing ? <VolumeX size={17} /> : <Music2 size={17} />}
              <span>{playing ? 'Tắt nhạc' : 'Bật nhạc'}</span>
            </button>
          </>
        )}
        {audioError && (
          <span className="viewer-audio-error" role="status">
            {audioError}
          </span>
        )}
      </nav>
      {presentation.ambience !== 'none' && !reducedMotion && (
        <div className={'viewer-ambience ambience-' + presentation.ambience} aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span
              key={i}
              style={{
                left: `${5 + ((i * 37) % 90)}%`,
                animationDelay: `${-i * 1.7}s`,
                animationDuration: `${11 + (i % 5)}s`,
              }}
            >
              {presentation.ambience === 'hearts'
                ? '♡'
                : presentation.ambience === 'petals'
                  ? '❀'
                  : '✧'}
            </span>
          ))}
        </div>
      )}
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
        <LegalLinks />
      </footer>
    </div>,
    document.body,
  );
}

function ScrollSection({ album, index, width }: { album: Album; index: number; width: number }) {
  const ref = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '120px',
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <section ref={ref} aria-label={album.pages[index].title}>
      <PagePreview album={album} index={index} width={width} animateEffects={visible} />
    </section>
  );
}
