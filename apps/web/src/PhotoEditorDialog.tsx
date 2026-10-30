import { useEffect, useRef, useState } from 'react';
import { X, Upload } from 'lucide-react';
import {
  assetUrl,
  type Album,
  type Asset,
  type ScrapElement,
} from '../../../packages/domain/index.js';
import {
  fullPhoto,
  photoWindow,
  photoZoom,
  zoomPhoto,
  panPhoto,
} from '../../../packages/domain/photo-edit.js';
import { useBodyScrollLock } from './Overlays.js';

export function PhotoEditorDialog({
  element,
  album,
  onClose,
  onApply,
  onUpload,
}: {
  element: ScrapElement;
  album: Album;
  onClose: () => void;
  onApply: (patch: Partial<ScrapElement>) => void;
  onUpload: (file: File) => Promise<Asset>;
}) {
  useBodyScrollLock();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(element),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const drag = useRef<{
    x: number;
    y: number;
    crop: ScrapElement['crop'];
    width: number;
    height: number;
  } | null>(null);
  const asset = album.assets.find((a) => a.id === draft.assetId),
    crop = photoWindow(draft, asset);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  const replace = (id: string) => setDraft((e) => ({ ...e, assetId: id, crop: { ...fullPhoto } }));
  return (
    <dialog
      ref={dialog}
      className="photo-editor-dialog"
      aria-label="Chỉnh ảnh trong khung"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">GIỮ KHUNG, CHỈNH KHOẢNH KHẮC</span>
          <h2>Ảnh trong trang sổ</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Đóng chỉnh ảnh"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      <div className="photo-editor-body">
        <div>
          <div
            className="photo-crop-surface"
            role="img"
            aria-label="Kéo để dịch ảnh trong khung"
            style={{
              width: Math.min(
                430,
                (330 * Math.max(1, draft.width - 24)) / Math.max(1, draft.height - 50),
              ),
              maxWidth: '100%',
              aspectRatio: `${Math.max(1, draft.width - 24)} / ${Math.max(1, draft.height - 50)}`,
            }}
            onPointerDown={(e) => {
              if (busy) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const r = e.currentTarget.getBoundingClientRect();
              drag.current = { x: e.clientX, y: e.clientY, crop, width: r.width, height: r.height };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || busy) return;
              setDraft((old) => ({
                ...old,
                crop: panPhoto(
                  old,
                  asset,
                  d.crop.x - ((e.clientX - d.x) / d.width) * d.crop.width,
                  d.crop.y - ((e.clientY - d.y) / d.height) * d.crop.height,
                ),
              }));
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            {assetUrl(draft.assetId, album) && (
              <img
                src={assetUrl(draft.assetId, album)}
                alt=""
                draggable={false}
                style={{
                  width: `${100 / crop.width}%`,
                  height: `${100 / crop.height}%`,
                  left: `${(-crop.x / crop.width) * 100}%`,
                  top: `${(-crop.y / crop.height) * 100}%`,
                }}
              />
            )}
          </div>
          <p className="muted small">
            Kéo ảnh để chọn phần muốn giữ. Khung và bố cục trang không đổi.
          </p>
          <fieldset disabled={busy} className="form-stack">
            <label>
              Phóng ảnh{' '}
              <input
                aria-label="Phóng ảnh trong khung"
                type="range"
                min={1}
                max={8}
                step={0.05}
                value={Math.min(8, photoZoom(draft, asset))}
                onChange={(e) =>
                  setDraft((old) => ({
                    ...old,
                    crop: zoomPhoto(old, asset, Number(e.target.value)),
                  }))
                }
              />
            </label>
            {(['x', 'y'] as const).map((axis) => (
              <label key={axis}>
                {axis === 'x' ? 'Dịch ngang' : 'Dịch dọc'}
                <input
                  aria-label={axis === 'x' ? 'Vị trí ảnh ngang' : 'Vị trí ảnh dọc'}
                  type="range"
                  min={0}
                  max={Math.max(0, 1 - crop[axis === 'x' ? 'width' : 'height'])}
                  step={0.001}
                  value={crop[axis]}
                  onChange={(e) =>
                    setDraft((old) => ({
                      ...old,
                      crop: panPhoto(
                        old,
                        asset,
                        axis === 'x' ? Number(e.target.value) : crop.x,
                        axis === 'y' ? Number(e.target.value) : crop.y,
                      ),
                    }))
                  }
                />
              </label>
            ))}
            <button
              className="button quiet"
              onClick={() => setDraft((e) => ({ ...e, crop: { ...fullPhoto } }))}
            >
              Đặt lại vùng ảnh
            </button>
          </fieldset>
        </div>
        <div>
          <h3>Thay ảnh trong khung</h3>
          <label className="button quiet photo-upload">
            <Upload size={16} /> Tải ảnh thay khung
            <input
              aria-label="Tải ảnh thay khung"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                setError('');
                try {
                  replace((await onUpload(file)).id);
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          <p className="muted small">
            Ảnh tải lên được giữ trong thư viện kể cả khi bạn hủy chỉnh khung.
          </p>
          <div className="photo-replacement-grid">
            {[
              ...album.assets,
              ...[1, 2, 3].map((i) => ({
                id: `demo-${i}`,
                name: `Minh họa ${i}`,
                url: `/api/demo/${i}.svg`,
              })),
            ].map((a) => (
              <button
                key={a.id}
                aria-label={'Dùng ảnh ' + a.name}
                aria-pressed={draft.assetId === a.id}
                disabled={busy}
                onClick={() => replace(a.id)}
              >
                <img src={a.url} alt="" loading="lazy" />
                <span>{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <footer>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button quiet" disabled={busy} onClick={onClose}>
            Hủy
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              onApply({ assetId: draft.assetId, crop: draft.crop });
              onClose();
            }}
          >
            {busy ? 'Đang tải ảnh…' : 'Áp dụng ảnh'}
          </button>
        </div>
      </footer>
    </dialog>
  );
}
