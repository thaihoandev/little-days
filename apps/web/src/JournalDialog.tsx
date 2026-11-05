import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X, ImagePlus } from 'lucide-react';
import { api } from './api.js';
import { uploadImage, uploadBatch } from './image-upload.js';
import { thumbnailUrl } from './thumbnail.js';
import { LocationFields } from './LocationFields.js';
import { PlanFields } from './PlanFields.js';
import {
  type JournalEntry,
  type JournalContent,
  type TimelineSpace,
  journalKindNames,
} from '../../../packages/domain/journal.js';

export function JournalPhotoTiles({
  entry,
  onOpen,
}: {
  entry: JournalEntry;
  onOpen: (index: number) => void;
}) {
  if (!entry.assets.length) return null;
  return (
    <div className={'journal-photos photos-' + entry.assets.length}>
      {entry.assets.slice(0, 3).map((asset, index) => (
        <button
          className="journal-photo-button"
          aria-label={'Xem ảnh ' + asset.name}
          key={asset.id}
          onClick={() => onOpen(index)}
        >
          <img
            src={thumbnailUrl(asset.url)}
            alt={asset.name}
            loading="lazy"
            decoding="async"
            width={asset.width}
            height={asset.height}
          />
          {index === 2 && entry.assets.length > 3 && (
            <span className="photo-overflow">+{entry.assets.length - 3} ảnh</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function JournalDialog({
  enhancedReady,
  sharedPlansReady,
  separateSpaces,
  ownerId,
  convertPlan,
  spaces,
  timelines,
  defaultTimeline,
  initial,
  initialKind,
  draft,
  date,
  onClose,
  onSaved,
  onUpdated,
}: {
  enhancedReady: boolean;
  sharedPlansReady: boolean;
  separateSpaces: boolean;
  ownerId: string;
  convertPlan: boolean;
  spaces: TimelineSpace[];
  timelines: { id: string; label: string }[];
  defaultTimeline: string;
  initial: JournalEntry | null;
  initialKind: JournalContent['kind'];
  draft?: Partial<JournalContent>;
  date: string;
  onClose: () => void;
  onSaved: (entry: JournalEntry) => void;
  onUpdated: (entry: JournalEntry) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [timelineId, setTimelineId] = useState(
      initial?.spaceId || initial?.timelineId || defaultTimeline,
    ),
    [entry, setEntry] = useState(initial),
    [content, setContent] = useState<JournalContent>(() =>
      initial
        ? {
            title: initial.title,
            date: initial.date,
            note: initial.note,
            kind: convertPlan ? 'memory' : initial.kind,
            annual: initial.annual,
            location: initial.location,
            plan: convertPlan
              ? { ...(initial.plan || { checklist: [] }), status: 'completed' }
              : initial.plan,
          }
        : {
            title: '',
            date,
            note: '',
            kind: initialKind,
            annual: false,
            ...(sharedPlansReady && initialKind === 'plan'
              ? { plan: { status: 'planned' as const, checklist: [] } }
              : {}),
            ...draft,
          },
    ),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [uploadMessage, setUploadMessage] = useState(''),
    [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    let current = entry,
      remaining = [...files];
    setUploadMessage('');
    try {
      if (
        !entry ||
        (separateSpaces && entry.canChangeSpace && timelineId !== entry.spaceId) ||
        Object.entries(content).some(
          ([key, value]) =>
            JSON.stringify(value) !== JSON.stringify(entry[key as keyof JournalEntry]),
        )
      )
        current = await api<JournalEntry>(entry ? '/journal/' + entry.id : '/journal', {
          method: entry ? 'PATCH' : 'POST',
          body: JSON.stringify(
            entry
              ? {
                  expectedRevision: entry.revision,
                  content,
                  ...(separateSpaces && entry.canChangeSpace ? { spaceId: timelineId } : {}),
                }
              : { ...content, timelineId },
          ),
        });
      if (!current) throw new Error('Chưa lưu được dấu mốc.');
      setEntry(current);
      onUpdated(current);
      const id = current.id;
      let completed = 0;
      const batch = await uploadBatch<JournalEntry>(files, async (file, index) => {
        const result = await uploadImage<JournalEntry>('/journal/' + id + '/assets', file, (p) =>
          setUploadMessage(
            `Đã lưu ${completed}/${files.length} · Ảnh ${index + 1}: ${p.phase === 'prepare' ? 'đang tối ưu' : p.phase === 'save' ? 'đang lưu' : Math.round((p.loaded / Math.max(1, p.total)) * 100) + '%'}`,
          ),
        );
        completed++;
        return result;
      });
      current = batch.latest || current;
      remaining = batch.results.filter((r) => r.error).map((r) => r.file);
      setFiles(remaining);
      setEntry(current);
      onUpdated(current);
      if (remaining.length)
        throw new Error(
          `Đã lưu ${completed}/${files.length} ảnh. ${batch.results.find((r) => r.error)!.error!.message}`,
        );
      onSaved(current);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="journal-dialog"
      aria-label={initial ? 'Sửa dấu mốc' : 'Thêm dấu mốc'}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">MỘT NGÀY ĐỂ NHỚ</span>
          <h2>{initial ? 'Sửa dấu mốc' : 'Thêm dấu mốc'}</h2>
        </div>
        <button className="icon-button" aria-label="Đóng dấu mốc" disabled={busy} onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        {busy && uploadMessage && (
          <p role="status" className="upload-detail">
            {uploadMessage}
          </p>
        )}
        {timelines.length > 1 && (
          <label className="journal-target-label">
            Lưu vào dòng thời gian
            <select
              aria-label="Lưu vào dòng thời gian"
              value={timelineId}
              disabled={busy || (!!entry && (!separateSpaces || !entry.canChangeSpace))}
              onChange={(e) => setTimelineId(e.target.value)}
            >
              {timelines
                .filter(
                  (t) =>
                    !separateSpaces ||
                    !entry?.canChangeSpace ||
                    t.id === ownerId ||
                    spaces.some((s) => s.id === t.id && !s.shared),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="journal-form-fields">
          <fieldset disabled={busy}>
            <label>
              Tên dấu mốc
              <input
                required
                maxLength={160}
                value={content.title}
                onChange={(e) => setContent({ ...content, title: e.target.value })}
                placeholder="Buổi hẹn đầu tiên, sinh nhật, một lời hẹn…"
              />
            </label>
            <div className="journal-form-row">
              <label>
                Ngày đáng nhớ
                <input
                  required
                  type="date"
                  min="1900-01-01"
                  max="2200-12-31"
                  value={content.date}
                  onChange={(e) => setContent({ ...content, date: e.target.value })}
                />
              </label>
              <label>
                Loại dấu mốc
                <select
                  aria-label="Loại dấu mốc"
                  value={content.kind}
                  onChange={(e) =>
                    setContent({ ...content, kind: e.target.value as JournalContent['kind'] })
                  }
                >
                  {Object.entries(journalKindNames).map(([id, name]) => (
                    <option value={id} key={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Lời nhắn / ghi chú
              <textarea
                aria-label="Lời nhắn / ghi chú"
                rows={5}
                maxLength={5000}
                value={content.note}
                onChange={(e) => setContent({ ...content, note: e.target.value })}
                placeholder="Hôm ấy có gì đặc biệt? Hay một điều mình muốn làm cùng nhau…"
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={content.annual}
                onChange={(e) => setContent({ ...content, annual: e.target.checked })}
              />
              Đánh dấu ngày này mỗi năm
            </label>
            {sharedPlansReady && (content.kind === 'plan' || content.plan) && (
              <PlanFields
                value={content.plan || { status: 'planned', checklist: [] }}
                members={spaces.find((s) => s.id === timelineId)?.members || []}
                onChange={(plan) => setContent({ ...content, plan })}
              />
            )}
            <label className="journal-upload">
              <ImagePlus size={19} />
              Ảnh cho ngày này
              <input
                aria-label="Ảnh dấu mốc"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  const selected = Array.from(e.target.files || []);
                  if (selected.length + (entry?.assets.length || 0) > 6) {
                    setError('Mỗi dấu mốc tối đa 6 ảnh.');
                    return;
                  }
                  if (selected.some((f) => f.size > 20 * 1048576)) {
                    setError('Mỗi ảnh tối đa 20 MB.');
                    return;
                  }
                  setFiles(selected);
                  setError('');
                }}
              />
              <small>JPEG/PNG/WebP · tối đa 6 ảnh, 20 MB/ảnh</small>
            </label>
            {files.length > 0 && (
              <p className="muted small">Sẽ thêm: {files.map((f) => f.name).join(', ')}</p>
            )}
            {entry && entry.assets.length > 0 && (
              <div className="journal-edit-photos">
                {entry.assets.map((asset) => (
                  <div key={asset.id}>
                    <img src={asset.url} alt={asset.name} />
                    <button
                      type="button"
                      className="text-button"
                      aria-label={'Xóa ảnh ' + asset.name}
                      onClick={() => {
                        if (!window.confirm('Xóa ảnh này khỏi dấu mốc?')) return;
                        setBusy(true);
                        api<JournalEntry>('/journal/' + entry.id + '/assets/' + asset.id, {
                          method: 'DELETE',
                          body: JSON.stringify({ expectedRevision: entry.revision }),
                        })
                          .then((value) => {
                            setEntry(value);
                            onUpdated(value);
                          })
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      Xóa ảnh
                    </button>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
          {enhancedReady && (
            <LocationFields
              value={content.location}
              disabled={busy}
              onChange={(location) => setContent((current) => ({ ...current, location }))}
            />
          )}
        </div>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <footer className="journal-form-footer">
          <button type="submit" className="button primary full" disabled={busy}>
            {busy ? 'Đang giữ lại…' : 'Lưu dấu mốc'}
          </button>
          <p className="muted small">
            Chỉ những người có quyền truy cập dòng thời gian này mới xem và chỉnh sửa được.
          </p>
        </footer>
      </form>
    </dialog>
  );
}
