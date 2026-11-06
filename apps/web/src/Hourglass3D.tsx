import { useEffect, useRef, useState } from 'react';
export function Hourglass3D({ progress }: { progress: number }) {
  const host = useRef<HTMLDivElement>(null),
    [state, setState] = useState<'loading' | 'ready' | 'fallback'>('loading');
  useEffect(() => {
    let dispose: (() => void) | undefined,
      canceled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        void import('./hourglass-scene.js')
          .then(({ createHourglass }) => {
            if (canceled) return;
            try {
              dispose = createHourglass(host.current!, progress);
              setState('ready');
            } catch {
              setState('fallback');
            }
          })
          .catch(() => {
            if (!canceled) setState('fallback');
          });
      },
      { rootMargin: '120px' },
    );
    observer.observe(host.current!);
    return () => {
      canceled = true;
      observer.disconnect();
      dispose?.();
    };
  }, [progress]);
  return (
    <div className="hourglass-stage" data-renderer={state}>
      <div className="hourglass-canvas" ref={host} />
      {state === 'fallback' && (
        <img
          className="hourglass-still"
          src="/hourglass-still.png"
          alt="Đồng hồ cát kết xuất từ mô hình 3D"
        />
      )}
      {state === 'loading' && (
        <div className="hourglass-placeholder" role="status">
          {state === 'loading'
            ? 'Đang mở đồng hồ cát…'
            : 'Nhịp yêu thương vẫn được giữ trên thiết bị này.'}
        </div>
      )}
      <span className="hourglass-caption">Từng chút thời gian, cùng giữ lại.</span>
    </div>
  );
}
