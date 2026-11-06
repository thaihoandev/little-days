import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, BookOpen, Check, X } from 'lucide-react';
import { createAlbumContent, type Album } from '../../../packages/domain/index.js';
import {
  buildWeeklyPage,
  type RecapInput,
  type WeeklyPhoto,
  type WeeklyView,
} from '../../../packages/domain/weekly-recap.js';
import { api } from './api.js';
import { thumbnailUrl } from './thumbnail.js';
import { UserAvatar } from './UserAvatar.js';
import { PagePreview } from './Viewer.js';
import { useBodyScrollLock } from './Overlays.js';

const short = (date: string) => date.slice(5).split('-').reverse().join('/');
const layouts = [
  { id: 'grid', name: 'Ô ảnh', hint: 'Gọn gàng' },
  { id: 'film', name: 'Thước phim', hint: 'Một chút hoài niệm' },
  { id: 'editorial', name: 'Nhật ký ảnh', hint: 'Kể một câu chuyện' },
] as const;
const colors = ['#f8f1e5', '#e3eada', '#f3e3d9', '#24364e'] as const;
const colorNames = ['Kem giấy', 'Xanh lá', 'Hồng đất', 'Xanh đêm'];

/** Fit the complete authored page to its available viewport, without crop/negative margins. */
function FittedRecap({ album }: { album: Album }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(180);
  useLayoutEffect(() => {
    const node = host.current!;
    const measure = () => {
      if (!node.clientWidth || !node.clientHeight) return;
      const next = Math.max(
        1,
        Math.floor(Math.min(360, node.clientWidth, (node.clientHeight * 720) / 900)),
      );
      setWidth((previous) => (previous === next ? previous : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={host} className="recap-paper-host">
      <PagePreview album={album} width={width} thumbnails />
    </div>
  );
}

export function RecapComposer({
  data,
  onClose,
  onCreated,
}: {
  data: WeeklyView;
  onClose: () => void;
  onCreated: (album: Album) => void;
}) {
  useBodyScrollLock();
  const dialog = useRef<HTMLDialogElement>(null),
    alive = useRef(true),
    content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current!,
      viewport = window.visualViewport;
    const update = () => {
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      node.style.setProperty('--recap-viewport-height', (viewport?.height || innerHeight) + 'px');
      node.style.setProperty('--recap-viewport-top', (viewport?.offsetTop || 0) + 'px');
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  useEffect(() => {
    const node = dialog.current!;
    alive.current = true;
    node.showModal();
    return () => {
      alive.current = false;
      node.close();
    };
  }, []);
  const [step, setStep] = useState(0);
  useLayoutEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [step]);
  const [items, setItems] = useState(data.items),
    [cursor, setCursor] = useState(data.nextCursor),
    [more, setMore] = useState(false),
    [selected, setSelected] = useState<WeeklyPhoto[]>(data.items.slice(0, 9));
  const [title, setTitle] = useState('Một tuần của chúng mình'),
    [message, setMessage] = useState(''),
    [layout, setLayout] = useState<RecapInput['layout']>('grid'),
    [background, setBackground] = useState<RecapInput['background']>('#f8f1e5'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useRef({ signature: '', id: crypto.randomUUID() });
  const previewIds = useRef<string[]>([]);
  const preview = useMemo<Album>(() => {
    const page = selected.length
      ? buildWeeklyPage(
          selected.map((p) => ({ assetId: p.asset.id, date: p.date })),
          { weekStart: data.weekStart, title, message, layout, background },
        )
      : null;
    if (page) {
      page.id = previewIds.current[0] ??= crypto.randomUUID();
      page.elements = page.elements.map((element, i) => ({
        ...element,
        id: (previewIds.current[i + 1] ??= crypto.randomUUID()),
      }));
    }
    return {
      ...createAlbumContent(),
      id: 'preview',
      schemaVersion: 1,
      revision: 0,
      createdAt: '',
      updatedAt: '',
      assets: selected.map((p) => p.asset),
      pages: page ? [page] : [],
    };
  }, [selected, title, message, layout, background, data.weekStart]);
  const toggle = (photo: WeeklyPhoto) =>
    setSelected((previous) =>
      previous.some((p) => p.asset.id === photo.asset.id)
        ? previous.filter((p) => p.asset.id !== photo.asset.id)
        : previous.length < 9
          ? [...previous, photo]
          : previous,
    );
  const move = (index: number, delta: number) =>
    setSelected((previous) => {
      const target = index + delta;
      if (target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const loadMore = async () => {
    if (!cursor || more || busy) return;
    setMore(true);
    setError('');
    try {
      const next = await api<WeeklyView>(
        `/weekly-recap?spaceId=${data.space.id}&weekStart=${data.weekStart}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (alive.current) {
        setItems((old) => [
          ...old,
          ...next.items.filter((p) => !old.some((o) => o.asset.id === p.asset.id)),
        ]);
        setCursor(next.nextCursor);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setMore(false);
    }
  };
  const save = async () => {
    if (busy || !selected.length || !title.trim()) return;
    setBusy(true);
    setError('');
    const body = {
      spaceId: data.space.id,
      weekStart: data.weekStart,
      title,
      message,
      layout,
      background,
      photos: selected.map((p) => ({
        entryId: p.entryId,
        assetId: p.asset.id,
        expectedRevision: p.revision,
      })),
    };
    const signature = JSON.stringify(body);
    if (request.current.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    try {
      const album = await api<Album>('/albums/weekly-recap', {
        method: 'POST',
        body: JSON.stringify({ ...body, requestId: request.current.id }),
      });
      if (alive.current) onCreated(album);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="recap-dialog recap-studio"
      data-step={step}
      aria-label="Thiết kế recap tuần"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">
            {short(data.weekStart)} — {short(data.weekEnd)}
          </span>
          <h2>Giữ lại một tuần</h2>
        </div>
        <button className="icon-button" aria-label="Đóng recap" disabled={busy} onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <nav className="recap-steps" aria-label="Các bước tạo recap">
        {['Ảnh', 'Thiết kế', 'Xem trước'].map((label, index) => (
          <button
            key={label}
            aria-label={label}
            disabled={busy || (index > 0 && !selected.length)}
            aria-current={step === index ? 'step' : undefined}
            aria-controls={'recap-step-' + index}
            onClick={() => setStep(index)}
          >
            <b>{index < step ? <Check size={13} /> : index + 1}</b>
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="recap-compose">
        <div className="recap-options" ref={content}>
          <section id="recap-step-0" hidden={step !== 0} aria-label="Chọn ảnh recap">
            <fieldset disabled={busy}>
              <legend>
                Ảnh của tuần <span>{selected.length}/9</span>
              </legend>
              <p className="recap-help">
                {selected.length === 9
                  ? 'Đã đủ 9 ảnh. Bỏ chọn một ảnh để đổi ảnh khác.'
                  : 'Chạm ảnh để chọn hoặc bỏ chọn. Một ảnh cũng đủ để bắt đầu.'}
              </p>
              <div className="recap-photo-grid">
                {items.map((photo) => {
                  const index = selected.findIndex((p) => p.asset.id === photo.asset.id);
                  return (
                    <button
                      key={photo.entryId + photo.asset.id}
                      data-asset-id={photo.asset.id}
                      aria-label={`${index >= 0 ? 'Bỏ chọn' : 'Chọn'} ảnh ${photo.authorName} ${short(photo.date)}`}
                      aria-pressed={index >= 0}
                      disabled={index < 0 && selected.length >= 9}
                      onClick={() => toggle(photo)}
                    >
                      <img src={thumbnailUrl(photo.asset.url)} alt="" loading="lazy" />
                      {index >= 0 && (
                        <b>
                          {index + 1}
                          <Check size={11} />
                        </b>
                      )}
                      <span>
                        <UserAvatar name={photo.authorName} url={photo.authorAvatarUrl} />
                        <em>{photo.authorName}</em>
                        <small>{short(photo.date)}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {cursor && (
              <button
                className="button quiet recap-load-more"
                disabled={more || busy}
                onClick={() => void loadMore()}
              >
                {more ? 'Đang tải…' : 'Xem thêm ảnh'}
              </button>
            )}
            {selected.length > 0 && (
              <details className="recap-reorder">
                <summary>Sắp xếp {selected.length} ảnh đã chọn</summary>
                <ol className="recap-order">
                  {selected.map((photo, index) => (
                    <li key={photo.asset.id} data-asset-id={photo.asset.id}>
                      <img src={thumbnailUrl(photo.asset.url)} alt="" loading="lazy" />
                      <span>
                        <strong>Ảnh {index + 1}</strong>
                        <small>
                          {photo.authorName} · {short(photo.date)}
                        </small>
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`Đưa ảnh ${index + 1} lên trước`}
                        disabled={!index || busy}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Đưa ảnh ${index + 1} xuống sau`}
                        disabled={index === selected.length - 1 || busy}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Bỏ ảnh ${index + 1}`}
                        disabled={busy}
                        onClick={() => toggle(photo)}
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </section>
          <section id="recap-step-1" hidden={step !== 1} aria-label="Tùy chỉnh recap">
            <fieldset className="form-stack" disabled={busy}>
              <legend>Kể tuần này theo cách của mình</legend>
              <label>
                Tiêu đề
                <input
                  aria-label="Tiêu đề recap"
                  maxLength={80}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                Lời nhắn
                <textarea
                  aria-label="Lời nhắn recap"
                  maxLength={240}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={3}
                />
              </label>
              <fieldset className="recap-layouts">
                <legend>Bố cục recap</legend>
                <div>
                  {layouts.map((choice) => (
                    <button
                      key={choice.id}
                      aria-label={choice.name}
                      aria-pressed={layout === choice.id}
                      onClick={() => setLayout(choice.id)}
                    >
                      <span className={'recap-layout-icon ' + choice.id} aria-hidden="true">
                        {Array.from({ length: choice.id === 'editorial' ? 3 : 9 }, (_, i) => (
                          <i key={i} />
                        ))}
                      </span>
                      <strong>{choice.name}</strong>
                      <small>{choice.hint}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="recap-palettes" role="group" aria-label="Màu recap">
                {colors.map((color, index) => (
                  <button
                    key={color}
                    aria-label={colorNames[index]}
                    title={colorNames[index]}
                    aria-pressed={background === color}
                    style={{ background: color }}
                    onClick={() => setBackground(color)}
                  >
                    {background === color && <Check size={17} />}
                  </button>
                ))}
              </div>
            </fieldset>
          </section>
          <section
            id="recap-step-2"
            hidden={step !== 2}
            className="recap-confirm-info"
            aria-label="Thông tin recap"
          >
            <span className="eyebrow">MỘT TUẦN ĐÃ GIỮ</span>
            <h3>{title || 'Recap của mình'}</h3>
            <p>
              {selected.length} ảnh · {layouts.find((choice) => choice.id === layout)!.name}
            </p>
            <p>
              Sổ được lưu riêng cho bạn. Sau khi lưu, bạn có thể chỉnh tiếp, tải ảnh hoặc tạo link
              chia sẻ trong editor.
            </p>
          </section>
        </div>
        <section className="recap-preview" aria-label="Bản xem trước recap">
          <div className="recap-preview-caption">
            <span>BẢN NHÁP</span>
            <small>{selected.length} ảnh</small>
          </div>
          {selected.length ? <FittedRecap album={preview} /> : <p>Chọn một ảnh để xem bản nháp.</p>}
        </section>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <footer>
        <span>Chỉ bạn xem được sổ sau khi lưu.</span>
        <div>
          {step > 0 && (
            <button
              className="button quiet recap-back"
              aria-label="Quay lại bước trước"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={17} />
            </button>
          )}
          {step < 2 ? (
            <button
              className="button primary"
              disabled={busy || !selected.length || (step === 1 && !title.trim())}
              onClick={() => setStep(step + 1)}
            >
              {step === 0 ? 'Tiếp tục: Thiết kế' : 'Xem trước recap'}
              <ArrowRight size={17} />
            </button>
          ) : (
            <button
              className="button primary"
              disabled={busy || !selected.length || !title.trim()}
              onClick={() => void save()}
            >
              <BookOpen size={17} />
              {busy ? 'Đang lưu ảnh…' : 'Lưu và mở trong editor'}
            </button>
          )}
        </div>
      </footer>
    </dialog>
  );
}
