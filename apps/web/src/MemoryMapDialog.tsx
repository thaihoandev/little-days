import { lazy, Suspense, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { JournalEntry, MilestoneLocation } from '../../../packages/domain/journal.js';
import { useBodyScrollLock } from './Overlays.js';
const MemoryMap = lazy(() => import('./MemoryMap.js'));
export function MemoryMapDialog({
  entries,
  selected,
  onOpen,
  onClose,
}: {
  entries: JournalEntry[];
  selected?: MilestoneLocation | null;
  onOpen: (entry: JournalEntry) => void;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="memory-map-dialog"
      aria-label="Bản đồ kỉ niệm"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2>Bản đồ kỉ niệm</h2>
          <p>{entries.filter((e) => e.location).length} dấu mốc đã ghim · OpenStreetMap</p>
        </div>
        <button className="icon-button" aria-label="Đóng bản đồ kỉ niệm" onClick={onClose}>
          <X />
        </button>
      </header>
      <Suspense fallback={<p>Đang mở bản đồ…</p>}>
        <MemoryMap entries={entries} selected={selected} onOpen={onOpen} />
      </Suspense>
      {!entries.some((e) => e.location) && (
        <p className="muted small">Thêm địa điểm trong dấu mốc để ghim kỉ niệm lên bản đồ.</p>
      )}
    </dialog>
  );
}
