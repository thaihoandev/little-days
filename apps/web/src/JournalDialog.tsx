import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { X, ImagePlus, MapPin, ChevronDown, CalendarDays, Check, LoaderCircle } from 'lucide-react';
import { api } from './api.js';
import { uploadImage, uploadBatch, prepareUploadImage } from './image-upload.js';
import { thumbnailUrl } from './thumbnail.js';
import { ConfirmDialog, useBodyScrollLock } from './Overlays.js';
import { PlanFields } from './PlanFields.js';
import {
  type JournalEntry,
  type JournalContent,
  type TimelineSpace,
  journalKindNames,
} from '../../../packages/domain/journal.js';
const LocationFields = lazy(() =>
  import('./LocationFields.js').then((m) => ({ default: m.LocationFields })),
);

function SelectedPhotos({
  files,
  disabled,
  onRemove,
}: {
  files: File[];
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [failed, setFailed] = useState<File[]>([]);
  const urls = useRef(new Map<File, string>());
  const fail = (file: File) => setFailed((old) => (old.includes(file) ? old : [...old, file]));
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current.clear();
    },
    [],
  );
  useEffect(() => {
    let active = true;
    for (const [file, url] of urls.current)
      if (!files.includes(file)) {
        URL.revokeObjectURL(url);
        urls.current.delete(file);
      }
    setPreviews(
      files.flatMap((file) => {
        const url = urls.current.get(file);
        return url ? [{ file, url }] : [];
      }),
    );
    setFailed((old) => old.filter((file) => files.includes(file)));
    for (const file of files)
      if (!urls.current.has(file))
        void prepareUploadImage(file)
          .then((prepared) => {
            if (!active) return;
            const url = URL.createObjectURL(prepared);
            urls.current.set(file, url);
            setPreviews((old) => [...old, { file, url }]);
          })
          .catch(() => {
            if (active) fail(file);
          });
    return () => {
      active = false;
    };
  }, [files]);
  if (!files.length) return null;
  return (
    <div className="milestone-selected-photos" aria-label="Ảnh đã chọn">
      {files.map((file, index) => {
        const preview = previews.find((p) => p.file === file);
        return (
          <div key={index}>
            {preview && !failed.includes(file) ? (
              <img src={preview.url} alt={`Ảnh đã chọn ${index + 1}`} onError={() => fail(file)} />
            ) : (
              <span className="milestone-photo-loading">
                {failed.includes(file) ? (
                  'Chưa xem được ảnh'
                ) : (
                  <>
                    <LoaderCircle size={18} />
                    Ảnh {index + 1}
                  </>
                )}
              </span>
            )}
            <button
              type="button"
              className="icon-button"
              disabled={disabled}
              aria-label={`Bỏ ảnh đã chọn ${index + 1}`}
              onClick={() => onRemove(index)}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

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
    [error, setError] = useState(''),
    [locationReady, setLocationReady] = useState(!!initial?.location || !!draft?.location),
    [locationOpen, setLocationOpen] = useState(!!initial?.location || !!draft?.location),
    [confirmation, setConfirmation] = useState<'close' | string | null>(null);
  const saving = useRef(false);
  useBodyScrollLock();
  const requestClose = () => {
    if (saving.current) return;
    const changed =
      files.length > 0 ||
      (entry
        ? Object.entries(content).some(
            ([key, value]) =>
              JSON.stringify(value) !== JSON.stringify(entry[key as keyof JournalEntry]),
          )
        : !!(
            content.title.trim() ||
            content.note.trim() ||
            content.location ||
            content.annual ||
            content.plan?.checklist.length
          ));
    if (changed) setConfirmation('close');
    else onClose();
  };

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
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
      if (remaining.length)
        throw new Error(
          `Đã lưu ${completed}/${files.length} ảnh. ${batch.results.find((r) => r.error)!.error!.message}`,
        );
      onSaved(current);
    } catch (e) {
      if (current && current !== entry) onUpdated(current);
      setError((e as Error).message);
    } finally {
      saving.current = false;
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
        requestClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">
            <CalendarDays size={13} /> MỘT KHOẢNH KHẮC CỦA MÌNH
          </span>
          <h2>{initial ? 'Sửa dấu mốc' : 'Thêm dấu mốc'}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Đóng dấu mốc"
          disabled={busy}
          onClick={requestClose}
        >
          <X size={20} />
        </button>
      </header>
      <form className="form-stack" aria-busy={busy} onSubmit={(event) => void submit(event)}>
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
            <label className="journal-upload milestone-upload">
              <ImagePlus size={19} />
              <span>
                <strong>{files.length ? 'Thêm ảnh khác' : 'Thêm ảnh cho khoảnh khắc'}</strong>
                <small>Chọn ảnh trước, hoặc chỉ viết một dòng cũng được</small>
              </span>
              <input
                aria-label="Ảnh dấu mốc"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  const selected = Array.from(e.target.files || []);
                  e.target.value = '';
                  if (selected.length + files.length + (entry?.assets.length || 0) > 6) {
                    setError('Mỗi dấu mốc tối đa 6 ảnh.');
                    return;
                  }
                  if (selected.some((f) => f.size > 20 * 1048576)) {
                    setError('Mỗi ảnh tối đa 20 MB.');
                    return;
                  }
                  if (
                    selected.some(
                      (f) => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type),
                    )
                  ) {
                    setError('Chọn ảnh JPEG, PNG hoặc WebP.');
                    return;
                  }
                  setFiles((old) => [...old, ...selected]);
                  setError('');
                }}
              />
              <small>{(entry?.assets.length || 0) + files.length}/6 ảnh · tối đa 20 MB/ảnh</small>
            </label>
            <SelectedPhotos
              files={files}
              disabled={busy}
              onRemove={(index) => setFiles((old) => old.filter((_, i) => i !== index))}
            />

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
                rows={3}
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
            {entry && entry.assets.length > 0 && (
              <div className="journal-edit-photos">
                {entry.assets.map((asset) => (
                  <div key={asset.id}>
                    <img
                      src={thumbnailUrl(asset.url)}
                      alt="Ảnh đã lưu của dấu mốc"
                      loading="lazy"
                      decoding="async"
                    />
                    <button
                      type="button"
                      className="text-button"
                      aria-label={'Xóa ảnh ' + asset.name}
                      onClick={() => {
                        setConfirmation(asset.id);
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
            <details
              className="milestone-location"
              open={locationOpen}
              onToggle={(e) => {
                setLocationOpen(e.currentTarget.open);
                if (e.currentTarget.open) setLocationReady(true);
              }}
              onInvalidCapture={() => setLocationOpen(true)}
            >
              <summary>
                <MapPin size={16} />
                <span>
                  {content.location?.label || 'Ghim thêm địa điểm'}
                  <small>Không bắt buộc · mở bản đồ khi cần</small>
                </span>
                <ChevronDown size={16} />
              </summary>
              {locationReady && (
                <Suspense fallback={<p role="status">Đang mở địa điểm…</p>}>
                  <LocationFields
                    value={content.location}
                    disabled={busy}
                    onChange={(location) => setContent((current) => ({ ...current, location }))}
                  />
                </Suspense>
              )}
            </details>
          )}
        </div>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <footer className="journal-form-footer">
          <button type="submit" className="button primary full" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle size={17} className="spin" />
                Đang giữ lại…
              </>
            ) : (
              <>
                <Check size={17} />
                Lưu dấu mốc
              </>
            )}
          </button>
          <p className="muted small">
            {spaces.find((s) => s.id === timelineId)
              ? spaces.find((s) => s.id === timelineId)?.shared
                ? 'Lưu trong không gian chung · các thành viên cùng xem và viết.'
                : 'Lưu trong không gian riêng · chỉ mình bạn xem.'
              : 'Chỉ người có quyền truy cập dòng thời gian đã chọn được xem.'}
          </p>
        </footer>
      </form>
      {confirmation && (
        <ConfirmDialog
          title={confirmation === 'close' ? 'Rời dấu mốc đang viết?' : 'Xóa ảnh khỏi dấu mốc?'}
          description={
            confirmation === 'close'
              ? 'Nội dung chưa lưu và ảnh chưa tải sẽ không được giữ. Dấu mốc đã lưu trên máy chủ vẫn còn.'
              : 'Ảnh sẽ được gỡ khỏi dấu mốc. Nội dung bạn đang viết vẫn được giữ trong form.'
          }
          confirmLabel={confirmation === 'close' ? 'Rời và bỏ phần chưa lưu' : 'Xóa ảnh'}
          busy={busy}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            if (confirmation === 'close') {
              onClose();
              return;
            }
            if (!entry || saving.current) return;
            saving.current = true;
            setBusy(true);
            void api<JournalEntry>('/journal/' + entry.id + '/assets/' + confirmation, {
              method: 'DELETE',
              body: JSON.stringify({ expectedRevision: entry.revision }),
            })
              .then((value) => {
                setEntry(value);
                onUpdated(value);
                setConfirmation(null);
              })
              .catch((e) => {
                setConfirmation(null);
                setError(e.message);
              })
              .finally(() => {
                saving.current = false;
                setBusy(false);
              });
          }}
        />
      )}
    </dialog>
  );
}
