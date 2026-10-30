import { useEffect, useRef, useState, useMemo, type FormEvent } from 'react';
import { X, BookOpen, LoaderCircle } from 'lucide-react';
import { type Album, createAlbumContent } from '../../../packages/domain/index.js';
import { builtInTemplates, templatePage } from '../../../packages/domain/templates.js';
import {
  buildJournalPages,
  sourceKey,
  type JournalSource,
  type JournalAlbumEntry,
} from '../../../packages/domain/journal-album.js';
import { api } from './api.js';
import { PagePreview } from './Viewer.js';
import { useBodyScrollLock } from './Overlays.js';

export type TimelineChoice = { source: JournalSource; entry: JournalAlbumEntry };
export function TimelineAlbumDialog({
  choices,
  onClose,
  onCreated,
}: {
  choices: TimelineChoice[];
  onClose: () => void;
  onCreated: (album: Album) => void;
}) {
  useBodyScrollLock();
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('Những ngày mình muốn giữ'),
    [first, setFirst] = useState(''),
    [second, setSecond] = useState(''),
    [template, setTemplate] = useState('polaroid'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useRef({ signature: '', id: crypto.randomUUID() });
  const preview = useMemo(() => {
    try {
      if (!choices.length) throw new Error('Chọn ít nhất một dấu mốc trước khi tạo sổ.');
      return {
        pages: buildJournalPages(
          choices.map((c) => c.entry),
          template,
        ),
        error: '',
      };
    } catch (error) {
      return { pages: [], error: (error as Error).message };
    }
  }, [choices, template]);
  const [previewIndex, setPreviewIndex] = useState(0);
  useEffect(() => setPreviewIndex(0), [template]);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  const sample: Album = {
    ...createAlbumContent(),
    id: 'preview',
    revision: 0,
    schemaVersion: 1,
    createdAt: '',
    updatedAt: '',
    assets: choices.flatMap((c) => c.entry.assets),
    names: [first || 'Bạn', second || 'Người thương'],
    startDate: choices.map((c) => c.entry.date).sort()[0],
    pages: preview.pages,
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (preview.error) return;
    setBusy(true);
    setError('');
    const body = {
      title,
      names: [first, second],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      templateId: template,
      sources: choices.map((c) => c.source),
    };
    const signature = JSON.stringify(body);
    if (request.current.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    try {
      onCreated(
        await api<Album>('/albums/from-journal', {
          method: 'POST',
          body: JSON.stringify({ ...body, requestId: request.current.id }),
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="timeline-album-dialog"
      aria-label="Tạo scrapbook từ dấu mốc"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">TỪ DẤU MỐC THÀNH MỘT CUỐN SỔ</span>
          <h2>Giữ lại thành scrapbook</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Đóng tạo scrapbook"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      <form onSubmit={(event) => void submit(event)}>
        <div className="timeline-album-body">
          <fieldset disabled={busy} className="form-stack">
            <p className="muted small">
              {choices.length} dấu mốc · sắp xếp từ ngày cũ đến mới. Ảnh và lời nhắn được chép riêng
              vào album.
            </p>
            <label>
              Tên scrapbook
              <input
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="journal-form-row">
              <label>
                Tên của bạn
                <input
                  required
                  maxLength={60}
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                />
              </label>
              <label>
                Tên người thương
                <input
                  required
                  maxLength={60}
                  value={second}
                  onChange={(e) => setSecond(e.target.value)}
                />
              </label>
            </div>
            <label>Chọn bố cục</label>
            <div className="import-template-grid">
              {builtInTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-label={'Dùng mẫu ' + t.name}
                  aria-pressed={template === t.id}
                  onClick={() => setTemplate(t.id)}
                >
                  <PagePreview album={{ ...sample, pages: [templatePage(t.id)] }} width={75} />
                  <strong>{t.name}</strong>
                </button>
              ))}
            </div>
            <details>
              <summary>Các dấu mốc đã chọn</summary>
              <ol className="import-source-list">
                {[...choices]
                  .sort((a, b) => a.entry.date.localeCompare(b.entry.date))
                  .map((c) => (
                    <li key={sourceKey(c.source)}>
                      <time>{c.entry.date.split('-').reverse().join('/')}</time>
                      <span>{c.entry.title}</span>
                    </li>
                  ))}
              </ol>
            </details>
          </fieldset>
          <aside className="import-preview" aria-label="Xem trước scrapbook sẽ tạo">
            {preview.pages.length > 0 && (
              <>
                <PagePreview
                  album={sample}
                  index={Math.min(previewIndex, preview.pages.length - 1)}
                  width={220}
                />
                <div className="row">
                  <button
                    type="button"
                    className="button quiet"
                    disabled={busy || previewIndex === 0}
                    aria-label="Trang xem trước trước"
                    onClick={() => setPreviewIndex((i) => i - 1)}
                  >
                    ←
                  </button>
                  <span>
                    {previewIndex + 1} / {preview.pages.length}
                  </span>
                  <button
                    type="button"
                    className="button quiet"
                    disabled={busy || previewIndex === preview.pages.length - 1}
                    aria-label="Trang xem trước sau"
                    onClick={() => setPreviewIndex((i) => i + 1)}
                  >
                    →
                  </button>
                </div>
                <p className="muted small">
                  Ghi chú dài và nhiều ảnh được chia thêm trang, tối đa 20 trang. Bạn vẫn chỉnh sửa
                  mọi trang sau khi tạo.
                </p>
              </>
            )}
            {preview.error && (
              <p className="error" role="alert">
                {preview.error}
              </p>
            )}
          </aside>
        </div>
        <footer>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full" disabled={busy || !!preview.error}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <BookOpen size={17} />}{' '}
            {busy ? 'Đang tạo và giữ ảnh…' : 'Tạo scrapbook ' + preview.pages.length + ' trang'}
          </button>
          <p className="muted small">
            Dấu mốc gốc giữ nguyên. Xóa nguồn sau này không làm mất ảnh trong album.
          </p>
        </footer>
      </form>
    </dialog>
  );
}
