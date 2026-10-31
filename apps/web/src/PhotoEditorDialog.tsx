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
  photoGeometry,
} from '../../../packages/domain/photo-edit.js';
import { useBodyScrollLock } from './Overlays.js';
import { BackgroundRemovalPanel } from './BackgroundRemovalPanel.js';

export function PhotoEditorDialog({
  element,
  album,
  onClose,
  onApply,
  onUpload,
  uploadStatus,
}: {
  element: ScrapElement;
  album: Album;
  onClose: () => void;
  onApply: (patch: Partial<ScrapElement>) => void;
  onUpload: (file: File) => Promise<Asset>;
  uploadStatus?: string;
}) {
  useBodyScrollLock();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(element),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [cutout, setCutout] = useState<Blob | null>(null),
    [removing, setRemoving] = useState(false),
    [previewUrl, setPreviewUrl] = useState(''),
    [showOriginal, setShowOriginal] = useState(false);
  useEffect(() => {
    if (!cutout) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(cutout);
    setPreviewUrl(url);
    setShowOriginal(false);
    return () => URL.revokeObjectURL(url);
  }, [cutout]);
  const drag = useRef<{
    x: number;
    y: number;
    crop: ScrapElement['crop'];
    width: number;
    height: number;
  } | null>(null);
  const asset = album.assets.find((a) => a.id === draft.assetId),
    crop = photoWindow(draft, asset);
  const cutoutMode = draft.photoStyle === 'cutout',
    g = photoGeometry(draft, asset);
  const ratio =
    previewUrl || cutoutMode
      ? draft.width / draft.height
      : Math.max(1, draft.width - 24) / Math.max(1, draft.height - 50);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  const replace = (id: string) => {
    setCutout(null);
    setDraft((e) => ({ ...e, assetId: id, crop: { ...fullPhoto } }));
  };
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
            className={
              'photo-crop-surface' +
              (previewUrl || draft.photoStyle === 'cutout' ? ' transparency-grid' : '')
            }
            role="img"
            aria-label="Kéo để dịch ảnh trong khung"
            style={{
              width: Math.min(430, 330 * ratio),
              maxWidth: '100%',
              aspectRatio: String(ratio),
            }}
            onPointerDown={(e) => {
              if (busy || removing || previewUrl) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const r = e.currentTarget.getBoundingClientRect();
              drag.current = { x: e.clientX, y: e.clientY, crop, width: r.width, height: r.height };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || busy || removing || previewUrl) return;
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
            {previewUrl ? (
              <img
                src={showOriginal ? assetUrl(draft.assetId, album) : previewUrl}
                alt={showOriginal ? 'Ảnh gốc trước khi tách nền' : 'Xem trước ảnh đã tách nền'}
                draggable={false}
                style={{ width: '100%', height: '100%', left: 0, top: 0, objectFit: 'contain' }}
              />
            ) : (
              assetUrl(draft.assetId, album) && (
                <div
                  style={
                    cutoutMode
                      ? {
                          position: 'absolute',
                          overflow: 'hidden',
                          left: `${(g.x / draft.width) * 100}%`,
                          top: `${(g.y / draft.height) * 100}%`,
                          width: `${(g.width / draft.width) * 100}%`,
                          height: `${(g.height / draft.height) * 100}%`,
                        }
                      : { position: 'absolute', inset: 0 }
                  }
                >
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
                </div>
              )
            )}
          </div>
          {previewUrl && (
            <button className="button quiet" onClick={() => setShowOriginal((value) => !value)}>
              {showOriginal ? 'Xem ảnh tách nền' : 'So sánh ảnh gốc'}
            </button>
          )}
          <p className="muted small">
            {cutout
              ? 'Áp dụng để dùng ảnh trong suốt như sticker trên trang sổ.'
              : 'Kéo ảnh để chọn phần muốn giữ. Khung và bố cục trang không đổi.'}
          </p>
          <fieldset
            hidden={!!cutout}
            disabled={busy || removing || !!cutout}
            className="form-stack"
          >
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
          <div inert={busy}>
            <BackgroundRemovalPanel
              key={draft.assetId}
              asset={asset}
              onResult={setCutout}
              onProcessing={setRemoving}
            />
          </div>
          <h3>Thay ảnh trong khung</h3>
          <label className="button quiet photo-upload">
            <Upload size={16} /> Tải ảnh thay khung
            <input
              aria-label="Tải ảnh thay khung"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || removing}
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
                disabled={busy || removing}
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
        {busy && uploadStatus && (
          <p className="small muted" role="status">
            {uploadStatus}
          </p>
        )}
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
            disabled={busy || removing}
            onClick={async () => {
              if (!cutout) {
                onApply({ assetId: draft.assetId, crop: draft.crop, photoStyle: draft.photoStyle });
                onClose();
                return;
              }
              setBusy(true);
              setError('');
              try {
                const next = await onUpload(
                  new File([cutout], 'tach-nen.png', { type: 'image/png' }),
                );
                onApply({ assetId: next.id, crop: { ...fullPhoto }, photoStyle: 'cutout' });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Đang tải ảnh…' : 'Áp dụng ảnh'}
          </button>
        </div>
      </footer>
    </dialog>
  );
}
