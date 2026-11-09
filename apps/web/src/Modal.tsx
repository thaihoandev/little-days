import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
const openModals: HTMLDivElement[] = [];

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = '',
  portal = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
  portal?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const node = ref.current!;
    openModals.push(node);
    const previous = document.activeElement as HTMLElement;
    const first =
      ref.current?.querySelector<HTMLElement>('[data-autofocus]') ||
      ref.current?.querySelector<HTMLElement>('input,button,textarea,select');
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (openModals.at(-1) !== node) return;
      if (e.isComposing) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
      if (e.key === 'Tab') {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,textarea,select,a[href],summary,[tabindex]:not([tabindex="-1"])',
          ) || [],
        ).filter((item) => item.getClientRects().length > 0 && !item.closest('[inert]'));
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      const index = openModals.indexOf(node);
      if (index >= 0) openModals.splice(index, 1);
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);

  const content = (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className={`modal ${wide ? 'wide' : ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Đóng">
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
  return portal ? createPortal(content, document.body) : content;
}
