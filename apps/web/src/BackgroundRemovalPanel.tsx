import { useEffect, useRef, useState } from 'react';
import { Scissors, LoaderCircle } from 'lucide-react';
import type { Asset } from '../../../packages/domain/index.js';
import {
  startBackgroundRemoval,
  decorateCutout,
  type RemovalProgress,
} from './background-removal.js';
export function BackgroundRemovalPanel({
  asset,
  onResult,
  onProcessing,
}: {
  asset?: Asset;
  onResult: (blob: Blob | null) => void;
  onProcessing: (busy: boolean) => void;
}) {
  const [base, setBase] = useState<Blob | null>(null),
    [running, setRunning] = useState(false),
    [error, setError] = useState(''),
    [progress, setProgress] = useState<RemovalProgress | null>(null),
    [outline, setOutline] = useState(true),
    [shadow, setShadow] = useState(false);
  const cancel = useRef<(() => void) | null>(null),
    generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      cancel.current?.();
    },
    [],
  );
  useEffect(() => {
    if (!base) return;
    let active = true;
    onProcessing(true);
    onResult(null);
    decorateCutout(base, outline, shadow)
      .then((blob) => {
        if (active) onResult(blob);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) onProcessing(false);
      });
    return () => {
      active = false;
    };
  }, [base, outline, shadow, onResult, onProcessing]);
  const stop = () => {
    generation.current++;
    cancel.current?.();
    cancel.current = null;
    setRunning(false);
    setProgress(null);
    onProcessing(false);
  };
  const start = async () => {
    if (!asset) return;
    const current = ++generation.current,
      controller = new AbortController();
    cancel.current = () => controller.abort();
    setRunning(true);
    setError('');
    setBase(null);
    onResult(null);
    onProcessing(true);
    let segmented = false;
    try {
      const url = new URL(asset.url, location.origin);
      if (
        url.origin !== location.origin ||
        !/^\/api\/albums\/[a-f0-9-]+\/assets\/[a-f0-9-]+$/i.test(url.pathname)
      )
        throw new Error('Chỉ tách nền ảnh trong thư viện riêng của sổ.');
      const response = await fetch(url, {
        credentials: 'same-origin',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      });
      if (!response.ok) throw new Error('Không tải được ảnh. Kiểm tra kết nối hoặc tải lại trang.');
      const image = await response.blob();
      if (image.size > 20 * 1048576)
        throw new Error('Ảnh quá lớn để tách nền. Hãy dùng ảnh tối đa 20 MB.');
      if (current !== generation.current) return;
      const task = startBackgroundRemoval(image, (value) => {
        if (current === generation.current) setProgress(value);
      });
      cancel.current = task.cancel;
      const result = await task.promise;
      if (current === generation.current) {
        segmented = true;
        setBase(result);
        setProgress(null);
      }
    } catch (e) {
      if (current === generation.current && (e as Error).name !== 'AbortError')
        setError((e as Error).message);
    } finally {
      if (current === generation.current) {
        cancel.current = null;
        setRunning(false);
        if (!segmented) onProcessing(false);
      }
    }
  };
  return (
    <section className="background-removal-panel" aria-label="Tách nền ảnh">
      <h3>
        <Scissors size={17} /> Tách nền thành sticker
      </h3>
      <p className="muted small">
        Xử lý trên thiết bị của bạn. Lần đầu tải khoảng 56 MB; máy yếu có thể cần chờ lâu hơn.
      </p>
      {!asset && <p className="small">Chọn ảnh đã tải lên trong thư viện để tách nền.</p>}
      <button
        type="button"
        className="button quiet"
        disabled={!asset || running}
        onClick={() => void start()}
      >
        {running ? <LoaderCircle className="spin" size={16} /> : <Scissors size={16} />}
        {running ? 'Đang tách nền…' : base ? 'Tách nền lại' : 'Tách nền'}
      </button>
      {running && (
        <div role="status" className="removal-progress">
          <span>
            {progress?.phase === 'download' ? 'Đang tải bộ tách nền…' : 'Đang xử lý ảnh…'}
          </span>
          <progress
            max={1}
            value={
              progress?.phase === 'download'
                ? Math.min(1, progress.loaded / progress.total)
                : undefined
            }
          />
          <button className="text-button" onClick={stop}>
            Hủy tách nền
          </button>
        </div>
      )}
      {base && (
        <fieldset className="cutout-options">
          <label>
            <input
              type="checkbox"
              checked={outline}
              onChange={(e) => setOutline(e.target.checked)}
            />
            Viền trắng
          </label>
          <label>
            <input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} />
            Bóng đổ nhẹ
          </label>
          <button
            className="text-button"
            onClick={() => {
              setBase(null);
              onResult(null);
              onProcessing(false);
            }}
          >
            Bỏ kết quả tách nền
          </button>
        </fieldset>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {base && !error && (
        <p className="small muted">
          Xem trước trên nền caro. Bấm Áp dụng để lưu bản mới; ảnh gốc vẫn được giữ.
        </p>
      )}
    </section>
  );
}
