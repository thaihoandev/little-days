import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Compass, Footprints, Map as MapIcon, X } from 'lucide-react';
import type { JournalEntry, MilestoneLocation } from '../../../packages/domain/journal.js';
import type { ProvinceInfo } from '../../../packages/domain/vietnam-provinces.js';
import { useBodyScrollLock } from './Overlays.js';
const VietnamFootprintMap = lazy(() =>
  import('./VietnamFootprintMap.js').then((module) => ({ default: module.VietnamFootprintMap })),
);

const MemoryMap = lazy(() => import('./MemoryMap.js'));

export function MemoryMapDialog({
  entries,
  selected,
  onOpen,
  onClose,
  onAddAtProvince,
}: {
  entries: JournalEntry[];
  selected?: MilestoneLocation | null;
  onOpen: (entry: JournalEntry) => void;
  onClose: () => void;
  onAddAtProvince?: (province: ProvinceInfo) => void;
}) {
  useBodyScrollLock();
  const dialog = useRef<HTMLDialogElement>(null);
  const [activeTab, setActiveTab] = useState<'footprint' | 'satellite'>(
    selected ? 'satellite' : 'footprint',
  );

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
      <header className="memory-map-header">
        <div>
          <h2>Bản đồ kỉ niệm</h2>
          <div className="map-dialog-tabs" role="tablist" aria-label="Chế độ bản đồ">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'footprint'}
              className={`map-tab-btn ${activeTab === 'footprint' ? 'active' : ''}`}
              onClick={() => setActiveTab('footprint')}
            >
              <Footprints size={15} />
              Dấu chân Việt Nam
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'satellite'}
              className={`map-tab-btn ${activeTab === 'satellite' ? 'active' : ''}`}
              onClick={() => setActiveTab('satellite')}
            >
              <Compass size={15} />
              Bản đồ địa điểm
            </button>
          </div>
        </div>
        <button className="icon-button" aria-label="Đóng bản đồ kỉ niệm" onClick={onClose}>
          <X />
        </button>
      </header>

      {activeTab === 'footprint' ? (
        <Suspense fallback={<p role="status">Đang mở bản đồ địa phương…</p>}>
          <VietnamFootprintMap
            entries={entries}
            onOpenEntry={onOpen}
            onAddAtProvince={onAddAtProvince}
          />
        </Suspense>
      ) : (
        <>
          <Suspense fallback={<p>Đang mở bản đồ…</p>}>
            <MemoryMap entries={entries} selected={selected} onOpen={onOpen} />
          </Suspense>
          {!entries.some((e) => e.location) && (
            <p className="muted small">Thêm địa điểm trong dấu mốc để ghim kỉ niệm lên bản đồ.</p>
          )}
        </>
      )}
    </dialog>
  );
}
