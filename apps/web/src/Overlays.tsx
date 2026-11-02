import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Trash2, X } from 'lucide-react';
import { PhotoDownload } from './PhotoDownload.js';
let locks = 0,
  previousOverflow = '';
export function useBodyScrollLock() {
  useEffect(() => {
    if (!locks++) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      if (!--locks) document.body.style.overflow = previousOverflow;
    };
  }, []);
}
function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useBodyScrollLock();
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return ref;
}
export function ConfirmDialog({
  title,
  description,
  onClose,
  onConfirm,
  confirmLabel = 'Xóa trang',
  busy = false,
}: {
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  busy?: boolean;
}) {
  const ref = useDialog();
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="confirm-dialog-icon">
        <Trash2 size={24} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="confirm-dialog-actions">
        <button className="button quiet" autoFocus disabled={busy} onClick={onClose}>
          Giữ lại
        </button>
        <button className="button danger" disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
function LightboxImage({ url, name }: { url: string; name: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  return (
    <div className="lightbox-image" aria-busy={state === 'loading'}>
      <img
        src={url}
        alt={name}
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
      />
      {state === 'loading' && (
        <p className="lightbox-loading" role="status">
          Đang mở ảnh…
        </p>
      )}
      {state === 'error' && (
        <p className="lightbox-loading" role="alert">
          Chưa mở được ảnh. Hãy kiểm tra kết nối hoặc quyền xem.
        </p>
      )}
    </div>
  );
}
export function PhotoLightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: { id: string; url: string; name: string }[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const ref = useDialog(),
    photo = photos[index];
  if (!photo) return null;
  return (
    <dialog
      ref={ref}
      className="photo-lightbox"
      aria-label="Xem ảnh kỉ niệm"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          onIndex(Math.max(0, index - 1));
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          onIndex(Math.min(photos.length - 1, index + 1));
        }
      }}
    >
      <header>
        <span>
          {index + 1} / {photos.length}
        </span>
        <div className="lightbox-toolbar">
          <PhotoDownload url={photo.url} id={photo.id} />
          <button className="icon-button" aria-label="Đóng ảnh" autoFocus onClick={onClose}>
            <X />
          </button>
        </div>
      </header>
      <LightboxImage key={photo.id + photo.url} url={photo.url} name={photo.name} />
      <footer>
        <button
          className="icon-button"
          aria-label="Ảnh trước"
          disabled={index === 0}
          onClick={() => onIndex(index - 1)}
        >
          <ArrowLeft />
        </button>
        <span className="lightbox-caption">Khoảnh khắc {index + 1}</span>
        <button
          className="icon-button"
          aria-label="Ảnh sau"
          disabled={index === photos.length - 1}
          onClick={() => onIndex(index + 1)}
        >
          <ArrowRight />
        </button>
      </footer>
    </dialog>
  );
}
