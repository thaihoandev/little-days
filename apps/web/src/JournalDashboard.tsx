import { Fragment, lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Heart,
  Plus,
  Search,
  X,
  ImagePlus,
  ArrowUpRight,
  Trash2,
  Repeat2,
  NotebookPen,
  BookOpen,
  UsersRound,
  MapPin,
  Pencil,
  Maximize2,
  CheckCheck,
  History,
  MessageCircle,
} from 'lucide-react';
import { type Album, todayIn, daysTogether } from '../../../packages/domain/index.js';
import {
  type JournalEntry,
  type JournalContent,
  type TimelineSharingState,
  journalKindNames,
  monthDays,
  occursOn,
  nextOccurrence,
  memoriesOnThisDay,
} from '../../../packages/domain/journal.js';
import { api, ApiError } from './api.js';
import { PhotoLightbox, ConfirmDialog } from './Overlays.js';
import { TimelineSharingPanel } from './TimelineSharingPanel.js';
import { LocationFields } from './LocationFields.js';
import { MemoryMapDialog } from './MemoryMapDialog.js';
import { UserAvatar } from './UserAvatar.js';
import { groupJournalDays } from '../../../packages/domain/journal-feed.js';
import { uploadImage, uploadBatch } from './image-upload.js';
import type { MilestoneLocation } from '../../../packages/domain/journal.js';
import { TimelineAlbumDialog, type TimelineChoice } from './TimelineAlbumDialog.js';
import { TimelineHeading } from './TimelineHeading.js';
import { TimelineTrail } from './TimelineTrail.js';
import { JournalDetails, JournalTrash } from './JournalDetails.js';
import { PhotoDownload } from './PhotoDownload.js';
const MemoryMap = lazy(() => import('./MemoryMap.js'));

type Item = JournalEntry & { album?: Album };
const isBook = (entry: Item) => !!entry.album && entry.id.startsWith('start-');
const storyCategory = (entry: Item) =>
  entry.album ? (isBook(entry) ? 'Album' : 'Kỉ niệm trong album') : journalKindNames[entry.kind];
async function readSharing() {
  try {
    return await api<TimelineSharingState>('/timeline-sharing');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
) =>
  new Intl.DateTimeFormat('vi-VN', { ...options, timeZone: 'UTC' }).format(
    new Date(date + 'T12:00:00Z'),
  );
export default function JournalDashboard({
  albums,
  mode,
  onOpenAlbum,
  onCreatedAlbum,
  userId,
  verified,
  displayName,
  enhancedReady,
  communityReady = false,
}: {
  albums: Album[];
  mode: 'home' | 'timeline' | 'calendar';
  onOpenAlbum: (album: Album) => void;
  onCreatedAlbum: (album: Album) => void;
  userId: string;
  verified: boolean;
  displayName?: string;
  enhancedReady: boolean;
  communityReady?: boolean;
}) {
  const [today, setToday] = useState(() =>
    todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [newKind, setNewKind] = useState<JournalContent['kind']>('memory');
  const loadVersion = useRef(0);
  const [sharingReady, setSharingReady] = useState(false);
  const [details, setDetails] = useState<{ entry: JournalEntry; tab: 'social' | 'history' } | null>(
      null,
    ),
    [trashOpen, setTrashOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false),
    [mapPoint, setMapPoint] = useState<MilestoneLocation | null>(null);
  const [sharing, setSharing] = useState<TimelineSharingState>({ ownId: userId, grants: [] }),
    [sharingOpen, setSharingOpen] = useState(false),
    [selectedTimeline, setSelectedTimeline] = useState('all'),
    [deleting, setDeleting] = useState<JournalEntry | null>(null),
    [deletingBusy, setDeletingBusy] = useState(false);
  const timelineOptions = [
    { id: userId, label: 'Dòng thời gian của tôi' },
    ...sharing.grants
      .filter((g) => g.memberId === userId && g.state === 'active')
      .map((g) => ({ id: g.timelineOwner, label: 'Cùng ' + g.ownerLabel })),
  ];
  const [chosen, setChosen] = useState<string[]>([]),
    [creatingAlbum, setCreatingAlbum] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{
    photos: JournalEntry['assets'];
    index: number;
  } | null>(null);
  useEffect(() => {
    const timer = setInterval(
      () => setToday(todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone)),
      60000,
    );
    return () => clearInterval(timer);
  }, []);
  const [selected, setSelected] = useState(today),
    [month, setMonth] = useState(today.slice(0, 7)),
    [entries, setEntries] = useState<JournalEntry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [kind, setKind] = useState('all'),
    [limit, setLimit] = useState(20),
    [editing, setEditing] = useState<JournalEntry | null | undefined>();
  useEffect(() => {
    let active = true;
    const version = ++loadVersion.current;
    Promise.all([api<JournalEntry[]>('/journal'), readSharing()])
      .then(([data, state]) => {
        if (active && version === loadVersion.current) {
          setEntries(data);
          setSharingReady(!!state);
          setSharing(state || { ownId: userId, grants: [] });
        }
      })
      .catch((e) => {
        if (active && version === loadVersion.current) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      loadVersion.current++;
    };
  }, []);
  const refresh = async () => {
    const version = ++loadVersion.current;
    const [data, state] = await Promise.all([api<JournalEntry[]>('/journal'), readSharing()]);
    if (version !== loadVersion.current) return;
    setEntries(data);
    setSharingReady(!!state);
    setSharing(state || { ownId: userId, grants: [] });
    setError('');
    if (
      selectedTimeline !== 'all' &&
      selectedTimeline !== userId &&
      !state?.grants.some(
        (g) =>
          g.memberId === userId && g.timelineOwner === selectedTimeline && g.state === 'active',
      )
    )
      setSelectedTimeline('all');
  };
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'visible' && editing === undefined && !sharingOpen)
        void refresh().catch((e) => setError(e.message));
    };
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [editing, sharingOpen, selectedTimeline]);
  useEffect(() => setLimit(20), [query, kind, mode]);
  const albumItems: Item[] = albums.flatMap((album) => [
    {
      id: 'start-' + album.id,
      title: 'Ngày bắt đầu · ' + album.names.join(' & '),
      date: album.startDate,
      note: 'Câu chuyện của hai đứa bắt đầu từ đây.',
      kind: 'anniversary' as const,
      annual: true,
      assets: album.assets.slice(0, 1),
      revision: album.revision,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
      album,
    },
    ...album.memories.map((memory) => ({
      ...memory,
      id: album.id + ':' + memory.id,
      note: memory.body,
      kind: 'memory' as const,
      annual: false,
      assets: album.assets.filter((a) => a.id === memory.assetId),
      revision: album.revision,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
      album,
    })),
  ]);
  const all: Item[] = [...entries, ...albumItems].filter((e) =>
      mode === 'timeline'
        ? selectedTimeline === 'all' || (e.timelineId || userId) === selectedTimeline
        : e.calendarVisible !== false,
    ),
    upcoming = all
      .map((entry) => ({ entry, next: nextOccurrence(entry, today) }))
      .filter((i): i is { entry: Item; next: string } => !!i.next)
      .sort((a, b) => a.next.localeCompare(b.next))
      .slice(0, 4);
  const choices: TimelineChoice[] = all
    .filter((e) => chosen.includes(e.id) && !e.timelineId)
    .map((entry) => ({
      entry,
      source: entry.album
        ? {
            kind: entry.id.startsWith('start-') ? 'album-start' : 'album-memory',
            id: entry.album.id,
            expectedRevision: entry.album.revision,
            ...(entry.id.startsWith('start-') ? {} : { memoryId: entry.id.split(':')[1] }),
          }
        : { kind: 'journal', id: entry.id, expectedRevision: entry.revision },
    }));
  const dayItems = all.filter((item) => occursOn(item, selected)),
    filtered = all
      .filter(
        (item) =>
          (kind === 'all' || item.kind === kind) &&
          (!query ||
            (item.title + ' ' + item.note)
              .toLocaleLowerCase('vi')
              .includes(query.toLocaleLowerCase('vi'))),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  const mapEntries = mode === 'timeline' ? filtered : all;
  const visible =
    mode === 'calendar'
      ? dayItems
      : mode === 'home'
        ? dayItems.length
          ? dayItems
          : filtered.slice(0, 4)
        : filtered.slice(0, limit);
  const [year, monthIndex] = month.split('-').map(Number),
    days = monthDays(year, monthIndex - 1);
  const groupedDays = groupJournalDays(
    visible.map((entry) =>
      mode !== 'timeline' && occursOn(entry, selected)
        ? { ...entry, occurrenceDate: selected }
        : entry,
    ),
  );
  const moveMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
    if (d.getUTCFullYear() >= 1900 && d.getUTCFullYear() <= 2200)
      setMonth(d.toISOString().slice(0, 7));
  };
  const update = (entry: JournalEntry) => {
    loadVersion.current++;
    setEntries((previous) => [entry, ...previous.filter((e) => e.id !== entry.id)]);
  };
  const remove = async (entry: JournalEntry) => {
    if (deletingBusy) return;
    setDeletingBusy(true);
    try {
      await api('/journal/' + entry.id, {
        method: 'DELETE',
        body: JSON.stringify({ expectedRevision: entry.revision }),
      });
      loadVersion.current++;
      setEntries((previous) => previous.filter((e) => e.id !== entry.id));
      setDeleting(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingBusy(false);
    }
  };
  return (
    <section
      className={'journal-home ' + mode + '-mode'}
      aria-label="Lịch và dòng thời gian của bạn"
    >
      <div className="journal-hero">
        <div>
          {mode === 'timeline' ? (
            <TimelineHeading />
          ) : (
            <>
              <h1>
                {mode === 'calendar'
                  ? 'Lịch của ' + (displayName || 'mình')
                  : 'Hôm nay của ' + (displayName || 'bạn')}
              </h1>
              <p>
                {all.filter((e) => !e.album).length} dấu mốc · {albums.length} album
              </p>
            </>
          )}
          <span className="journal-today">
            <CalendarDays size={15} />
            {dateLabel(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div className="journal-primary-actions">
          <button
            className="button quiet journal-share-action"
            disabled={!sharingReady}
            aria-label="Chia sẻ dòng thời gian"
            title={
              sharingReady
                ? 'Chia sẻ dòng thời gian'
                : 'Chia sẻ tạm thời chưa sẵn sàng; lịch riêng vẫn sử dụng bình thường.'
            }
            onClick={() => setSharingOpen(true)}
          >
            <UsersRound size={17} />
            <span className="share-action-label">Chia sẻ dòng thời gian</span>
            {sharing.grants.some((g) => g.memberId === userId && g.state === 'pending') && (
              <span className="invitation-count">
                {
                  sharing.grants.filter((g) => g.memberId === userId && g.state === 'pending')
                    .length
                }
              </span>
            )}
          </button>
          <button
            className="button primary"
            onClick={() => {
              setNewKind('memory');
              setEditing(null);
            }}
          >
            <Plus size={17} />
            Thêm dấu mốc
          </button>
        </div>
      </div>
      {sharing.grants.some((g) => g.memberId === userId && g.state === 'pending') && (
        <button className="timeline-invitation-banner" onClick={() => setSharingOpen(true)}>
          <UsersRound size={18} />
          <span>Bạn có lời mời cùng xây dựng dòng thời gian</span>
          <ArrowUpRight size={16} />
        </button>
      )}
      {mode === 'home' && (
        <div className="today-focus" aria-label="Tổng quan hôm nay">
          <div>
            <span>HÔM NAY</span>
            <strong>{all.filter((e) => occursOn(e, today)).length} điều muốn nhớ</strong>
            <p>Lịch, lời hẹn và ghi chú của bạn ở ngay bên dưới.</p>
          </div>
          <button
            className="button quiet"
            onClick={() => {
              setSelected(today);
              setMonth(today.slice(0, 7));
              setNewKind('note');
              setEditing(null);
            }}
          >
            <NotebookPen size={16} />
            Ghi nhanh hôm nay
          </button>
        </div>
      )}
      {mode === 'timeline' && timelineOptions.length > 1 && (
        <label className="timeline-scope">
          Dòng thời gian đang xem
          <select
            aria-label="Chọn dòng thời gian"
            value={selectedTimeline}
            onChange={(e) => {
              setSelectedTimeline(e.target.value);
              setChosen([]);
            }}
          >
            <option value="all">Tất cả dòng thời gian</option>
            {timelineOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode === 'timeline' && (
        <div className="journey-intro">
          <div className="journey-banner-copy">
            <span className="eyebrow">DẤU CHÂN CỦA CHÚNG MÌNH</span>
            <h2>Mỗi chặng đường, một điều thương.</h2>
            <p>
              {groupedDays.length
                ? `Đang mở ${groupedDays.length} ngày có kỉ niệm`
                : 'Câu chuyện bắt đầu từ một dấu mốc nhỏ'}
            </p>
          </div>
          <div className="journey-banner-art" aria-hidden="true">
            <span>♡</span>
            <BookOpen />
            <MapPin />
            <span>✦</span>
          </div>
          <div className="journey-numbers" aria-label="Câu chuyện qua những con số">
            <div>
              <Heart size={19} />
              <strong>{all.filter((e) => !e.album).length}</strong>
              <span>dấu mốc đã giữ</span>
            </div>
            <div>
              <ImagePlus size={19} />
              <strong>{new Set(all.flatMap((e) => e.assets.map((a) => a.id))).size}</strong>
              <span>tấm ảnh kỉ niệm</span>
            </div>
            <div>
              <CalendarDays size={19} />
              <strong>{all.filter((e) => !!nextOccurrence(e, today)).length}</strong>
              <span>ngày đang chờ</span>
            </div>
          </div>
        </div>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => {
              setError('');
              refresh().catch((e) => setError(e.message));
            }}
          >
            Tải lại
          </button>
        </p>
      )}
      {mode !== 'timeline' && (
        <div className="journal-overview">
          <section className="calendar-card" aria-label="Lịch tháng">
            <header>
              <div>
                <span className="eyebrow">LỊCH CỦA CHÚNG MÌNH</span>
                <h2>
                  Tháng {monthIndex}, {year}
                </h2>
              </div>
              <div className="row">
                <button
                  className="icon-button"
                  aria-label="Tháng trước"
                  onClick={() => moveMonth(-1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setSelected(today);
                    setMonth(today.slice(0, 7));
                  }}
                >
                  Hôm nay
                </button>
                <button className="icon-button" aria-label="Tháng sau" onClick={() => moveMonth(1)}>
                  <ChevronRight size={17} />
                </button>
              </div>
            </header>
            <div className="calendar-week">
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {days.map((day) => {
                const events = all.filter((e) => occursOn(e, day)),
                  count = events.length;
                const photos = [
                  ...new Map(
                    events.flatMap((e) => e.assets.slice(0, 1)).map((a) => [a.id, a]),
                  ).values(),
                ];
                return (
                  <button
                    key={day}
                    disabled={day < '1900-01-01' || day > '2200-12-31'}
                    aria-label={dateLabel(day) + (count ? ` · ${count} dấu mốc` : '')}
                    aria-pressed={selected === day}
                    className={[
                      day.slice(0, 7) !== month ? 'outside' : '',
                      day === today ? 'today' : '',
                      day === selected ? 'selected' : '',
                    ].join(' ')}
                    onClick={() => {
                      setSelected(day);
                      setMonth(day.slice(0, 7));
                    }}
                  >
                    <span>{Number(day.slice(-2))}</span>
                    {photos.length ? (
                      <span
                        className={'calendar-photos' + (photos.length > 1 ? ' multiple' : '')}
                        aria-hidden="true"
                      >
                        {photos.slice(0, 2).map((a) => (
                          <img
                            key={a.id}
                            src={a.url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              e.currentTarget.style.visibility = 'hidden';
                            }}
                          />
                        ))}
                        {photos.length > 2 && <b>+{photos.length - 2}</b>}
                      </span>
                    ) : (
                      <i className={count ? 'has-events' : ''} aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="calendar-foot">
              Chọn một ngày để xem kỉ niệm hoặc ghi thêm một lời nhắn.
            </p>
          </section>
          <aside className="upcoming-card">
            <section className="selected-day-notes" aria-label="Ghi chú ngày đang chọn">
              <span className="eyebrow">NGÀY ĐANG CHỌN</span>
              <h3>{dateLabel(selected, { day: 'numeric', month: 'long' })}</h3>
              {dayItems.filter((e) => e.kind === 'note').length ? (
                dayItems
                  .filter((e) => e.kind === 'note')
                  .slice(0, 3)
                  .map((e) => (
                    <button key={e.id} className="day-note" onClick={() => setEditing(e)}>
                      <strong>{e.title}</strong>
                      <span>{e.note || 'Mở ghi chú'}</span>
                    </button>
                  ))
              ) : (
                <p className="muted small">Chưa có ghi chú cho ngày này.</p>
              )}
            </section>
            <span className="eyebrow">MỘT CHÚT HÁO HỨC</span>
            <h2>Sắp đến những ngày đẹp</h2>
            {upcoming.length ? (
              upcoming.map(({ entry, next }) => (
                <button
                  className="upcoming-item"
                  key={entry.id}
                  onClick={() => {
                    setSelected(next);
                    setMonth(next.slice(0, 7));
                  }}
                >
                  <span className={'event-dot ' + entry.kind} />
                  <span>
                    <strong>{entry.title}</strong>
                    <small>{dateLabel(next, { day: 'numeric', month: 'long' })}</small>
                  </span>
                  <b>{next === today ? 'Hôm nay' : `${daysTogether(today, next)} ngày`}</b>
                </button>
              ))
            ) : (
              <div className="journal-empty-mini">
                <FlowerMark />
                <p>
                  Một buổi hẹn, ngày sinh nhật hay chuyến đi sắp tới — thêm ngày để cùng chờ nhé.
                </p>
              </div>
            )}
            <button
              className="button quiet full"
              onClick={() => {
                setNewKind('note');
                setEditing(null);
              }}
            >
              <NotebookPen size={15} />
              Ghi chú cho ngày {Number(selected.slice(-2))}/{Number(selected.slice(5, 7))}
            </button>
          </aside>
        </div>
      )}
      {mode === 'home' && memoriesOnThisDay(all, today).length > 0 && (
        <section className="on-this-day" aria-label="Ngày này năm trước">
          <header>
            <span className="eyebrow">MÌNH ĐÃ TỪNG CÓ NHỮNG NGÀY NHƯ THẾ</span>
            <h2>Ngày này năm trước</h2>
          </header>
          <div className="on-this-day-cards">
            {memoriesOnThisDay(all, today)
              .slice(0, 8)
              .map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    if (entry.album) onOpenAlbum(entry.album);
                    else setEditing(entry);
                  }}
                >
                  {entry.assets[0] ? (
                    <img src={entry.assets[0].url} alt="Một kỉ niệm năm cũ" loading="lazy" />
                  ) : (
                    <Heart size={28} />
                  )}
                  <span>
                    <small>
                      {Number(today.slice(0, 4)) - Number(entry.date.slice(0, 4))} năm trước ·{' '}
                      {entry.date.slice(0, 4)}
                    </small>
                    <strong>{entry.title}</strong>
                    <p>{entry.note.slice(0, 140)}</p>
                  </span>
                </button>
              ))}
          </div>
        </section>
      )}
      {mode === 'timeline' && all.some((entry) => !entry.timelineId) && (
        <section className="timeline-import-bar" aria-label="Tạo sổ từ dấu mốc">
          <div>
            <BookOpen size={20} />
            <span>
              <strong>
                {choices.length ? choices.length + ' dấu mốc đã chọn' : 'Tạo sổ từ dấu mốc'}
              </strong>
              <small>Chọn tối đa 20 mốc, rồi chọn bố cục cho scrapbook.</small>
            </span>
          </div>
          <div className="import-bar-actions">
            <button
              className="icon-button"
              aria-label="Chọn mốc đang hiện"
              title="Chọn các mốc đang hiện để tạo scrapbook"
              onClick={() =>
                setChosen(
                  visible
                    .filter((e) => !e.timelineId)
                    .slice(0, 20)
                    .map((e) => e.id),
                )
              }
            >
              <CheckCheck size={17} />
            </button>
            {chosen.length > 0 && (
              <button
                className="icon-button"
                aria-label="Bỏ chọn"
                title="Bỏ chọn dấu mốc"
                onClick={() => setChosen([])}
              >
                <X size={17} />
              </button>
            )}
            <button
              className="button primary"
              disabled={!choices.length}
              onClick={() => setCreatingAlbum(true)}
            >
              <BookOpen size={16} />
              Tạo scrapbook
            </button>
          </div>
        </section>
      )}
      <div className={mode === 'timeline' ? 'timeline-workspace' : 'journal-workspace'}>
        <section className="journal-feed" aria-label="Các dấu mốc">
          <header className="section-heading">
            <div>
              <h2>
                {mode === 'timeline'
                  ? 'Dòng thời gian'
                  : mode === 'home'
                    ? 'Những điều mình đã giữ'
                    : dateLabel(selected)}
              </h2>
              <p>
                {mode === 'calendar'
                  ? 'Dấu mốc và ghi chú cho ngày đang chọn.'
                  : `${visible.length} nội dung đang hiện · Album và dấu mốc được phân biệt riêng`}
              </p>
            </div>
            {mode === 'timeline' && (
              <div className="journal-filters">
                <label className="journal-search">
                  <Search size={15} />
                  <input
                    aria-label="Tìm dấu mốc"
                    placeholder="Tìm một kỉ niệm…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Lọc loại dấu mốc"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="all">Tất cả</option>
                  {Object.entries(journalKindNames).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {communityReady && (
              <button
                className="icon-button"
                aria-label="Mở thùng rác dấu mốc"
                title="Thùng rác dấu mốc"
                onClick={() => setTrashOpen(true)}
              >
                <Trash2 size={17} />
              </button>
            )}
            {enhancedReady && mode !== 'timeline' && (
              <button
                className="icon-button"
                aria-label={`Bản đồ (${mapEntries.filter((e) => e.location).length})`}
                title="Xem bản đồ kỉ niệm"
                onClick={() => {
                  setMapPoint(null);
                  setMapOpen(true);
                }}
              >
                <MapPin size={15} />
              </button>
            )}
          </header>
          {loading ? (
            <p className="muted" role="status">
              Đang mở những ngày đã lưu…
            </p>
          ) : visible.length ? (
            <div className="journal-timeline">
              {mode === 'timeline' && (
                <TimelineTrail
                  signature={groupedDays
                    .map((g) => g.date + ':' + g.items.map((e) => e.id).join(','))
                    .join('|')}
                />
              )}
              {groupedDays.map((group, index) => (
                <section
                  className="journal-day-group"
                  key={group.date}
                  aria-label={'Kỉ niệm ngày ' + group.date}
                >
                  {mode === 'timeline' &&
                    (index === 0 ||
                      groupedDays[index - 1].date.slice(0, 7) !== group.date.slice(0, 7)) && (
                      <div className="timeline-month">
                        <span>{dateLabel(group.date, { month: 'long', year: 'numeric' })}</span>
                      </div>
                    )}
                  <header
                    className={
                      'journal-day-heading' + (mode === 'calendar' ? ' calendar-day-summary' : '')
                    }
                  >
                    {mode !== 'calendar' && (
                      <time dateTime={group.date}>{dateLabel(group.date)}</time>
                    )}
                    <span>
                      {[
                        group.items.filter(isBook).length
                          ? `${group.items.filter(isBook).length} album`
                          : '',
                        group.items.filter((e) => !isBook(e)).length
                          ? `${group.items.filter((e) => !isBook(e)).length} dấu mốc`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </header>
                  <div className="journal-day-stories">
                    {group.items.map((entry, itemIndex) => (
                      <Fragment key={entry.id}>
                        {(itemIndex === 0 ||
                          storyCategory(group.items[itemIndex - 1]) !== storyCategory(entry)) && (
                          <h4 className="story-category">{storyCategory(entry)}</h4>
                        )}
                        <article
                          className={
                            'journal-entry ' +
                            entry.kind +
                            (isBook(entry) ? ' album-story' : ' milestone-story')
                          }
                        >
                          {entry.album && isBook(entry) && (
                            <button
                              className="story-album-cover"
                              aria-label={'Mở album trong dòng thời gian ' + entry.album.title}
                              onClick={() => onOpenAlbum(entry.album!)}
                            >
                              {entry.assets[0] || entry.album.assets[0] ? (
                                <img
                                  src={(entry.assets[0] || entry.album.assets[0]).url}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : (
                                <BookOpen size={34} />
                              )}
                              <span>{entry.album.title}</span>
                            </button>
                          )}
                          <div className="journal-entry-body">
                            {mode === 'timeline' && !entry.timelineId && (
                              <label className="import-pick" title="Chọn dấu mốc làm scrapbook">
                                <input
                                  type="checkbox"
                                  aria-label={'Chọn dấu mốc ' + entry.title}
                                  checked={chosen.includes(entry.id)}
                                  disabled={chosen.length >= 20 && !chosen.includes(entry.id)}
                                  onChange={(e) =>
                                    setChosen((ids) =>
                                      e.target.checked
                                        ? [...ids, entry.id]
                                        : ids.filter((id) => id !== entry.id),
                                    )
                                  }
                                />
                                <span>Chọn làm scrapbook</span>
                              </label>
                            )}
                            <div className="journal-entry-meta">
                              <span>
                                {entry.album
                                  ? isBook(entry)
                                    ? `Album · ${entry.album.pages.length} trang`
                                    : 'Kỉ niệm trong ' + entry.album.title
                                  : journalKindNames[entry.kind]}
                              </span>
                              {entry.timelineLabel && (
                                <small className="shared-timeline-label">
                                  <UsersRound size={12} />
                                  {entry.timelineAvatarUrl && (
                                    <UserAvatar
                                      name={entry.timelineLabel}
                                      url={entry.timelineAvatarUrl}
                                    />
                                  )}
                                  Cùng {entry.timelineLabel}
                                </small>
                              )}
                              {entry.annual && (
                                <small>
                                  <Repeat2 size={12} />
                                  Mỗi năm
                                </small>
                              )}
                            </div>
                            <h3>{entry.title}</h3>
                            {entry.location && (
                              <button
                                className="story-location"
                                onClick={() => {
                                  setMapPoint(entry.location!);
                                  setMapOpen(true);
                                }}
                              >
                                <MapPin size={14} />
                                {entry.location.label || 'Địa điểm đã ghim'}
                              </button>
                            )}
                            {entry.note && <p>{entry.note}</p>}
                            {!isBook(entry) && entry.assets.length > 0 && (
                              <div className={'journal-photos photos-' + entry.assets.length}>
                                {entry.assets.slice(0, 3).map((asset, index) => (
                                  <button
                                    className="journal-photo-button"
                                    aria-label={'Xem ảnh ' + asset.name}
                                    key={asset.id}
                                    onClick={() => setPhotoPreview({ photos: entry.assets, index })}
                                  >
                                    <img
                                      src={asset.url}
                                      alt={asset.name}
                                      loading="lazy"
                                      decoding="async"
                                      width={asset.width}
                                      height={asset.height}
                                    />
                                    {index === 2 && entry.assets.length > 3 && (
                                      <span className="photo-overflow">
                                        +{entry.assets.length - 3} ảnh
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="journal-entry-actions">
                              {!entry.album && communityReady && (
                                <>
                                  <button
                                    className="icon-button"
                                    aria-label={'Lời nhắn và cảm xúc ' + entry.title}
                                    title="Lời nhắn & cảm xúc"
                                    onClick={() => setDetails({ entry, tab: 'social' })}
                                  >
                                    <MessageCircle size={16} />
                                  </button>
                                  <button
                                    className="icon-button"
                                    aria-label={'Lịch sử dấu mốc ' + entry.title}
                                    title="Lịch sử dấu mốc"
                                    onClick={() => setDetails({ entry, tab: 'history' })}
                                  >
                                    <History size={16} />
                                  </button>
                                </>
                              )}
                              {entry.album ? (
                                <button
                                  className="icon-button"
                                  aria-label={'Mở album ' + entry.album.title}
                                  title={'Mở album ' + entry.album.title}
                                  onClick={() => onOpenAlbum(entry.album!)}
                                >
                                  <ArrowUpRight size={17} />
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="icon-button"
                                    aria-label={'Sửa dấu mốc ' + entry.title}
                                    title="Chỉnh sửa dấu mốc"
                                    onClick={() => setEditing(entry)}
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  <button
                                    className="icon-button"
                                    aria-label={'Xóa dấu mốc ' + entry.title}
                                    title="Xóa dấu mốc"
                                    onClick={() => setDeleting(entry)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </article>
                      </Fragment>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="journal-empty">
              <Heart size={27} />
              <h3>Chừa một chỗ cho điều đáng nhớ</h3>
              <p>Thêm dấu mốc, ảnh kỉ niệm hoặc ghi chú cho ngày này.</p>
              <button
                className="button quiet"
                onClick={() => {
                  setNewKind('memory');
                  setEditing(null);
                }}
              >
                Thêm điều muốn giữ
              </button>
            </div>
          )}
          {mode === 'timeline' && filtered.length > limit && (
            <button className="button quiet" onClick={() => setLimit((n) => n + 20)}>
              Xem thêm dấu mốc
            </button>
          )}
        </section>
        {mode === 'timeline' && enhancedReady && (
          <aside className="timeline-map-panel" aria-label="Bản đồ dòng thời gian">
            <header>
              <div>
                <span className="eyebrow">NHỮNG NƠI ĐÃ ĐẾN</span>
                <h2>Bản đồ kỉ niệm</h2>
                <p>{mapEntries.filter((e) => e.location).length} dấu mốc đã ghim</p>
              </div>
              <button
                className="icon-button"
                aria-label="Mở rộng bản đồ"
                title="Mở rộng bản đồ"
                onClick={() => {
                  setMapPoint(null);
                  setMapOpen(true);
                }}
              >
                <Maximize2 size={17} />
              </button>
            </header>
            <Suspense fallback={<p role="status">Đang mở bản đồ…</p>}>
              <MemoryMap
                entries={mapEntries}
                selected={mapPoint}
                onOpen={(entry) => setEditing(entry)}
              />
            </Suspense>
            {!mapEntries.some((e) => e.location) && (
              <p className="map-empty-hint">
                Ghim địa điểm khi thêm dấu mốc để lưu lại những nơi của hai bạn.
              </p>
            )}
          </aside>
        )}
      </div>
      {creatingAlbum && (
        <TimelineAlbumDialog
          choices={choices}
          onClose={() => setCreatingAlbum(false)}
          onCreated={(album) => {
            setCreatingAlbum(false);
            setChosen([]);
            onCreatedAlbum(album);
          }}
        />
      )}
      {mapOpen && (
        <MemoryMapDialog
          entries={mapEntries}
          selected={mapPoint}
          onClose={() => setMapOpen(false)}
          onOpen={(entry) => {
            setMapOpen(false);
            setEditing(entry);
          }}
        />
      )}
      {photoPreview && (
        <PhotoLightbox
          {...photoPreview}
          onIndex={(index) => setPhotoPreview({ ...photoPreview, index })}
          onClose={() => setPhotoPreview(null)}
        />
      )}
      {details && (
        <JournalDetails
          entry={details.entry}
          initialTab={details.tab}
          onClose={() => setDetails(null)}
          onRestored={(entry) => {
            update(entry);
            setDetails(null);
          }}
        />
      )}
      {trashOpen && <JournalTrash onClose={() => setTrashOpen(false)} onRestored={update} />}
      {editing !== undefined && (
        <JournalDialog
          enhancedReady={enhancedReady}
          timelines={timelineOptions}
          defaultTimeline={
            mode === 'timeline' && selectedTimeline !== 'all' ? selectedTimeline : userId
          }
          initial={editing}
          initialKind={newKind}
          date={selected}
          onClose={() => setEditing(undefined)}
          onUpdated={update}
          onSaved={(entry) => {
            update(entry);
            setEditing(undefined);
            setSelected(entry.date);
            setMonth(entry.date.slice(0, 7));
          }}
        />
      )}
      {sharingOpen && (
        <TimelineSharingPanel
          state={sharing}
          verified={verified}
          onChange={refresh}
          onClose={() => setSharingOpen(false)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Xóa dấu mốc?"
          busy={deletingBusy}
          description={
            communityReady
              ? 'Chuyển “' +
                deleting.title +
                '” vào thùng rác. Bạn có thể lấy lại cả nội dung và ảnh sau đó.'
              : 'Xóa “' +
                deleting.title +
                '” cùng ảnh khỏi dòng thời gian và lịch của mọi thành viên?'
          }
          confirmLabel="Xóa dấu mốc"
          onClose={() => {
            if (!deletingBusy) setDeleting(null);
          }}
          onConfirm={() => void remove(deleting)}
        />
      )}
    </section>
  );
}
function FlowerMark() {
  return (
    <span className="journal-flower" aria-hidden="true">
      ✿
    </span>
  );
}
function JournalDialog({
  enhancedReady,
  timelines,
  defaultTimeline,
  initial,
  initialKind,
  date,
  onClose,
  onSaved,
  onUpdated,
}: {
  enhancedReady: boolean;
  timelines: { id: string; label: string }[];
  defaultTimeline: string;
  initial: JournalEntry | null;
  initialKind: JournalContent['kind'];
  date: string;
  onClose: () => void;
  onSaved: (entry: JournalEntry) => void;
  onUpdated: (entry: JournalEntry) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [timelineId, setTimelineId] = useState(initial?.timelineId || defaultTimeline),
    [entry, setEntry] = useState(initial),
    [content, setContent] = useState<JournalContent>(() =>
      initial
        ? {
            title: initial.title,
            date: initial.date,
            note: initial.note,
            kind: initial.kind,
            annual: initial.annual,
            location: initial.location,
          }
        : { title: '', date, note: '', kind: initialKind, annual: false },
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
      current = await api<JournalEntry>(entry ? '/journal/' + entry.id : '/journal', {
        method: entry ? 'PATCH' : 'POST',
        body: JSON.stringify(
          entry ? { expectedRevision: entry.revision, content } : { ...content, timelineId },
        ),
      });
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
              disabled={busy || !!entry}
              onChange={(e) => setTimelineId(e.target.value)}
            >
              {timelines.map((t) => (
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
