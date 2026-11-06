import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

/** Product actions float above clipped photo cards; saved artwork is unaffected. */
export function ActionPopover({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const anchor = useRef({ top: 0, left: 0 });
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect(),
      menu = panel.current.getBoundingClientRect();
    anchor.current = { top: rect.top, left: rect.left };
    setPosition({
      left: Math.max(12, Math.min(rect.right - menu.width, innerWidth - menu.width - 12)),
      top:
        rect.bottom + menu.height + 12 < innerHeight
          ? rect.bottom + 6
          : Math.max(12, rect.top - menu.height - 6),
    });
    panel.current.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const scroll = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (
        !rect ||
        Math.abs(rect.top - anchor.current.top) > 2 ||
        Math.abs(rect.left - anchor.current.left) > 2
      )
        close();
    };
    const outside = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        trigger.current?.focus({ preventScroll: true });
      }
    };
    const blur = (event: FocusEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('focusin', blur);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('focusin', blur);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        className="icon-button card-more"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            className="action-popover"
            role="group"
            aria-label={label}
            style={position}
            onClickCapture={() => trigger.current?.focus({ preventScroll: true })}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
