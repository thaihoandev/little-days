import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { HourglassController, HourglassMotion, HourglassTheme } from './hourglass-scene.js';
const themes = { amber: 'Nắng ấm', rose: 'Hồng sương', midnight: 'Trời sao' } as const;
const motions = { gentle: 'Êm dịu', lively: 'Lấp lánh', still: 'Tĩnh' } as const;
function preference() {
  try {
    const value = JSON.parse(localStorage.getItem('little-days-hourglass') || '{}');
    return {
      theme: (typeof value.theme === 'string' && Object.hasOwn(themes, value.theme)
        ? value.theme
        : 'amber') as HourglassTheme,
      motion: (typeof value.motion === 'string' && Object.hasOwn(motions, value.motion)
        ? value.motion
        : 'gentle') as HourglassMotion,
    };
  } catch {
    return { theme: 'amber' as const, motion: 'gentle' as const };
  }
}
export function Hourglass3D({
  progress,
  active = true,
  autoStart = true,
}: {
  progress: number;
  active?: boolean;
  autoStart?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    controller = useRef<HourglassController | null>(null);
  const [style, setStyle] = useState(preference),
    [demo, setDemo] = useState(false);
  const [state, setState] = useState<'poster' | 'loading' | 'ready' | 'fallback'>('poster');
  const running = active && (autoStart || demo);
  const latest = useRef({ progress, ...style, active: running });
  latest.current = { progress, ...style, active: running };
  useEffect(() => {
    if (!running || controller.current || state === 'fallback') return;
    let canceled = false,
      idle = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    const initialize = () => {
      if (canceled) return;
      setState('loading');
      void import('./hourglass-scene.js')
        .then(({ createHourglass }) => {
          if (canceled || !host.current) return;
          try {
            controller.current = createHourglass(
              host.current,
              latest.current.progress,
              latest.current,
            );
            setState('ready');
          } catch {
            setState('fallback');
          }
        })
        .catch(() => {
          if (!canceled) setState('fallback');
        });
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        // Account forms and the first paint take priority over shader compilation.
        if ('requestIdleCallback' in window)
          idle = window.requestIdleCallback(initialize, { timeout: 1800 });
        else timer = setTimeout(initialize, 100);
      },
      { rootMargin: '120px' },
    );
    observer.observe(host.current!);
    return () => {
      canceled = true;
      observer.disconnect();
      if (idle) window.cancelIdleCallback(idle);
      if (timer) clearTimeout(timer);
    };
  }, [running]);
  useEffect(() => {
    controller.current?.update(latest.current);
  }, [progress, style, running]);
  useEffect(
    () => () => {
      controller.current?.();
      controller.current = null;
    },
    [],
  );
  const choose = (next: typeof style) => {
    setStyle(next);
    try {
      localStorage.setItem('little-days-hourglass', JSON.stringify(next));
    } catch {}
  };
  return (
    <div
      className="hourglass-stage"
      data-renderer={state}
      data-theme={style.theme}
      data-motion={style.motion}
      data-active={running}
    >
      <div className="hourglass-aura" aria-hidden="true" />
      <div className="hourglass-canvas" ref={host} />
      {state !== 'ready' && (
        <img
          className="hourglass-still"
          src="/hourglass-still.png"
          alt="Đồng hồ cát kết xuất từ mô hình 3D"
        />
      )}
      {state === 'loading' && (
        <span className="hourglass-loading" role="status">
          Đang mở 3D…
        </span>
      )}
      {!autoStart && !demo && (
        <button className="hourglass-demo" onClick={() => setDemo(true)}>
          <Sparkles size={13} />
          Xem thử 3D
        </button>
      )}
      <details className="hourglass-options">
        <summary aria-label="Tùy chỉnh đồng hồ cát" title="Màu sắc, chuyển động và góc nhìn">
          <SlidersHorizontal size={15} />
        </summary>
        <div className="hourglass-settings">
          <fieldset>
            <legend>Sắc màu</legend>
            <div className="hourglass-swatches">
              {(Object.keys(themes) as HourglassTheme[]).map((theme) => (
                <button
                  key={theme}
                  className={'hourglass-swatch ' + theme}
                  aria-label={themes[theme]}
                  aria-pressed={style.theme === theme}
                  title={themes[theme]}
                  onClick={() => choose({ ...style, theme })}
                />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Chuyển động</legend>
            <div className="hourglass-motion-options">
              {(Object.keys(motions) as HourglassMotion[]).map((motion) => (
                <button
                  key={motion}
                  aria-pressed={style.motion === motion}
                  onClick={() => choose({ ...style, motion })}
                >
                  {motions[motion]}
                </button>
              ))}
            </div>
          </fieldset>
          {state === 'ready' && (
            <div className="hourglass-orbit">
              <button
                aria-label="Xoay đồng hồ sang trái"
                onClick={() => controller.current?.turn(-1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                aria-label="Đặt lại góc nhìn đồng hồ"
                onClick={() => controller.current?.reset()}
              >
                <RotateCcw size={14} />
              </button>
              <button
                aria-label="Xoay đồng hồ sang phải"
                onClick={() => controller.current?.turn(1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          <small>Luôn tôn trọng chế độ giảm chuyển động của thiết bị.</small>
        </div>
      </details>
      <span className="hourglass-caption">Từng chút thời gian, cùng giữ lại.</span>
    </div>
  );
}
