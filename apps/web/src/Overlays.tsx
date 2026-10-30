import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Trash2, X } from 'lucide-react';
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
}: {
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  const ref = useDialog();
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="confirm-dialog-icon">
        <Trash2 size={24} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="confirm-dialog-actions">
        <button className="button quiet" autoFocus onClick={onClose}>
          Giữ lại
        </button>
        <button className="button danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
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
        <button className="icon-button" aria-label="Đóng ảnh" autoFocus onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="lightbox-image">
        <img src={photo.url} alt={photo.name} />
      </div>
      <footer>
        <button
          className="icon-button"
          aria-label="Ảnh trước"
          disabled={index === 0}
          onClick={() => onIndex(index - 1)}
        >
          <ArrowLeft />
        </button>
        <p>{photo.name}</p>
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
