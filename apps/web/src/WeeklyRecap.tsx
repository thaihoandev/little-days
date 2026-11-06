import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, X, Check, ImagePlus, BookOpen } from 'lucide-react';
import { createAlbumContent, todayIn, type Album } from '../../../packages/domain/index.js';
import type { TimelineSpace } from '../../../packages/domain/journal.js';
import {
  weekStartFor,
  shiftDate,
  buildWeeklyPage,
  type WeeklyView,
  type WeeklyPhoto,
  type RecapInput,
} from '../../../packages/domain/weekly-recap.js';
import { api, validatedApi } from './api.js';
import { thumbnailUrl } from './thumbnail.js';
import { UserAvatar } from './UserAvatar.js';
import { PagePreview } from './Viewer.js';
import { useBodyScrollLock } from './Overlays.js';

const dayName = (date: string) =>
  ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(date + 'T12:00:00Z').getUTCDay()];
const short = (date: string) => date.slice(5).split('-').reverse().join('/');
export function WeeklyRecap({
  spaces,
  ready,
  refreshKey,
  onCreated,
  onAddDay,
  onViewRecaps,
}: {
  spaces: TimelineSpace[];
  ready: boolean;
  refreshKey: string;
  onCreated: (album: Album) => void;
  onAddDay: (date: string, space: string) => void;
  onViewRecaps: () => void;
}) {
  const shared = spaces.filter((s) => s.shared && s.members.length > 1),
    [space, setSpace] = useState('');
  const actual = shared.some((s) => s.id === space) ? space : shared[0]?.id;
  const today = todayIn('Asia/Ho_Chi_Minh'),
    current = weekStartFor(today);
  const [week, setWeek] = useState(current),
    [data, setData] = useState<WeeklyView | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [composer, setComposer] = useState<WeeklyView | null>(null),
    [retry, setRetry] = useState(0);
  const membership = shared
    .map(
      (s) =>
        s.id +
        ':' +
        s.members
          .map((m) => m.id)
          .sort()
          .join(','),
    )
    .sort()
    .join('|');
  useEffect(() => setComposer(null), [actual, week, ready, membership]);
  useEffect(() => {
    setData(null);
    setError('');
    setLoading(true);
    if (!ready || !actual) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    validatedApi<WeeklyView>(`/weekly-recap?spaceId=${actual}&weekStart=${week}`, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          if ([401, 403, 404].includes(e.status)) setComposer(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [actual, week, ready, membership, refreshKey, retry]);
  return (
    <section className="weekly-recap" aria-label="Tuần của chúng mình">
      <header>
        <div>
          <h2>{week === current ? 'Tuần này của hai đứa' : 'Một tuần đã giữ'}</h2>
          <p className="week-range">
            {short(week)} — {short(shiftDate(week, 6))}
          </p>
        </div>
        <div className="weekly-actions">
          <button
            className="icon-button"
            aria-label="Tuần trước"
            onClick={() => setWeek(shiftDate(week, -7))}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Tuần sau"
            disabled={week >= current}
            onClick={() => setWeek(shiftDate(week, 7))}
          >
            <ArrowRight size={18} />
          </button>
          <button className="button quiet" onClick={onViewRecaps}>
            Recap đã lưu
          </button>
        </div>
      </header>
      {ready && shared.length > 1 && (
        <label className="weekly-space">
          Không gian
          <select
            aria-label="Không gian recap"
            value={actual}
            onChange={(e) => setSpace(e.target.value)}
          >
            {shared.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {!ready || loading ? (
        <p role="status">Đang gom những ngày nhỏ…</p>
      ) : !actual ? (
        <div className="week-onboarding">
          <div className="week-empty-tape" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i}>
                <Plus size={18} />
                <small>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i]}</small>
              </span>
            ))}
          </div>
          <p>Mời người thương vào không gian chung để bắt đầu tuần của hai người.</p>
        </div>
      ) : error ? (
        <div role="alert">
          {error}{' '}
          <button className="button quiet" onClick={() => setRetry((x) => x + 1)}>
            Thử lại
          </button>
        </div>
      ) : (
        data && (
          <>
            <div className="week-tape">
              {data.days.map((day) => (
                <button
                  key={day.date}
                  aria-current={day.date === today ? 'date' : undefined}
                  disabled={day.date > today}
                  onClick={() => (day.photos ? setComposer(data) : onAddDay(day.date, actual))}
                  aria-label={`${dayName(day.date)} ${short(day.date)} · ${day.photos} ảnh`}
                >
                  {day.cover ? (
                    <img src={thumbnailUrl(day.cover.url)} alt="" loading="lazy" />
                  ) : (
                    <span className="week-placeholder">
                      <Plus size={22} />
                    </span>
                  )}
                  <span className="week-day">
                    {dayName(day.date)}
                    <small>{short(day.date)}</small>
                  </span>
                  {day.photos > 0 && <span className="week-count">{day.photos}</span>}
                </button>
              ))}
            </div>
            <footer>
              <span>
                {data.items.length
                  ? 'Những chuyện nhỏ cũng xứng đáng được giữ lại.'
                  : 'Một tấm ảnh cũng đủ để bắt đầu. Không cần lấp đầy cả tuần.'}
              </span>
              <button
                className="button primary"
                disabled={!data.items.length}
                onClick={() => setComposer(data)}
              >
                <ImagePlus size={17} />
                Tạo recap tuần
              </button>
            </footer>
          </>
        )
      )}
      {composer && composer.space.id === actual && composer.weekStart === week && (
        <RecapComposer
          key={actual + week}
          data={composer}
          onClose={() => {
            setComposer(null);
            setRetry((value) => value + 1);
          }}
          onCreated={onCreated}
        />
      )}
    </section>
  );
}

function RecapComposer({
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
    alive = useRef(true);
  useEffect(() => {
    const node = dialog.current!;
    alive.current = true;
    node.showModal();
    return () => {
      alive.current = false;
      node.close();
    };
  }, []);
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
  const preview = useMemo<Album>(
    () => ({
      ...createAlbumContent(),
      id: 'preview',
      schemaVersion: 1,
      revision: 0,
      createdAt: '',
      updatedAt: '',
      assets: selected.map((p) => p.asset),
      pages: selected.length
        ? [
            buildWeeklyPage(
              selected.map((p) => ({ assetId: p.asset.id, date: p.date })),
              { weekStart: data.weekStart, title, message, layout, background },
            ),
          ]
        : [],
    }),
    [selected, title, message, layout, background, data.weekStart],
  );
  const toggle = (photo: WeeklyPhoto) =>
    setSelected((previous) =>
      previous.some((p) => p.asset.id === photo.asset.id)
        ? previous.filter((p) => p.asset.id !== photo.asset.id)
        : previous.length < 9
          ? [...previous, photo]
          : previous,
    );
  const save = async () => {
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
      className="recap-dialog"
      aria-label="Thiết kế recap tuần"
      onCancel={(e) => {
        e.preventDefault();
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
          <X />
        </button>
      </header>
      <div className="recap-compose">
        <div className="recap-options">
          <p>
            Chọn 1–9 ảnh từ không gian chung. Sổ được lưu riêng cho bạn, chỉ chia sẻ khi bạn muốn.
          </p>
          <fieldset disabled={busy}>
            <legend>Ảnh của tuần · {selected.length}/9</legend>
            <div className="recap-photo-grid">
              {items.map((p) => {
                const index = selected.findIndex((s) => s.asset.id === p.asset.id);
                return (
                  <button
                    key={p.entryId + p.asset.id}
                    aria-label={`${index >= 0 ? 'Bỏ chọn' : 'Chọn'} ảnh ${p.authorName} ${short(p.date)}`}
                    aria-pressed={index >= 0}
                    disabled={index < 0 && selected.length >= 9}
                    onClick={() => toggle(p)}
                  >
                    <img src={thumbnailUrl(p.asset.url)} alt="" loading="lazy" />
                    {index >= 0 && (
                      <b>
                        {index + 1}
                        <Check size={11} />
                      </b>
                    )}
                    <span>
                      <UserAvatar name={p.authorName} url={p.authorAvatarUrl} />
                      {p.authorName}
                      <small>{dayName(p.date)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          {cursor && (
            <button
              className="button quiet"
              disabled={more || busy}
              onClick={async () => {
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
              }}
            >
              {more ? 'Đang tải…' : 'Xem thêm ảnh'}
            </button>
          )}
          <fieldset className="form-stack" disabled={busy}>
            <legend>Thiết kế</legend>
            <label>
              Tiêu đề
              <input
                aria-label="Tiêu đề recap"
                maxLength={80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Lời nhắn
              <textarea
                maxLength={240}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
            </label>
            <label>
              Bố cục
              <select
                aria-label="Bố cục recap"
                value={layout}
                onChange={(e) => setLayout(e.target.value as typeof layout)}
              >
                <option value="grid">Ô ảnh · tối giản</option>
                <option value="film">Thước phim</option>
                <option value="editorial">Nhật ký ảnh</option>
              </select>
            </label>
            <div className="recap-palettes" role="group" aria-label="Màu recap">
              {(['#f8f1e5', '#e3eada', '#f3e3d9', '#24364e'] as const).map((color, i) => (
                <button
                  key={color}
                  aria-label={['Kem giấy', 'Xanh lá', 'Hồng đất', 'Xanh đêm'][i]}
                  aria-pressed={background === color}
                  style={{ background: color }}
                  onClick={() => setBackground(color)}
                />
              ))}
            </div>
          </fieldset>
          <ol className="recap-order">
            {selected.map((p, i) => (
              <li key={p.asset.id}>
                <span>
                  Ảnh {i + 1} · {p.authorName}
                </span>
                <button
                  className="icon-button"
                  aria-label={`Đưa ảnh ${i + 1} lên trước`}
                  disabled={!i || busy}
                  onClick={() =>
                    setSelected((old) => {
                      const next = [...old];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      return next;
                    })
                  }
                >
                  <ArrowLeft size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Bỏ ảnh ${i + 1}`}
                  disabled={busy}
                  onClick={() => toggle(p)}
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="recap-preview">
          {selected.length ? (
            <PagePreview album={preview} width={300} thumbnails />
          ) : (
            <p>Chọn một ảnh để xem bản nháp.</p>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <footer>
        <span>Ảnh, chữ và bố cục vẫn sửa được sau khi lưu.</span>
        <button
          className="button primary"
          disabled={busy || !selected.length || !title.trim()}
          onClick={() => void save()}
        >
          <BookOpen size={17} />
          {busy ? 'Đang lưu ảnh…' : 'Lưu và mở trong editor'}
        </button>
      </footer>
    </dialog>
  );
}
