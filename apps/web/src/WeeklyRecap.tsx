import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, ImagePlus } from 'lucide-react';
import { todayIn, type Album } from '../../../packages/domain/index.js';
import type { TimelineSpace } from '../../../packages/domain/journal.js';
import { weekStartFor, shiftDate, type WeeklyView } from '../../../packages/domain/weekly-recap.js';
import { validatedApi } from './api.js';
import { thumbnailUrl } from './thumbnail.js';
import { RecapComposer } from './RecapComposer.js';

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
  const tape = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!data || !tape.current) return;
    const host = tape.current;
    const day = data.days.reduce(
      (index, d, i) => (d.date <= today && d.photos > 0 ? i : index),
      -1,
    );
    const index =
      day >= 0
        ? day
        : Math.max(
            0,
            data.days.findIndex((d) => d.date === today),
          );
    const frame = requestAnimationFrame(() => {
      const item = host.children[index] as HTMLElement | undefined;
      if (item && host.scrollWidth > host.clientWidth)
        host.scrollLeft +=
          item.getBoundingClientRect().left -
          host.getBoundingClientRect().left -
          (host.clientWidth - item.offsetWidth) / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [data, today]);
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
          <h2 ref={heading} tabIndex={-1}>
            {week === current ? 'Tuần này của hai đứa' : 'Một tuần đã giữ'}
          </h2>
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
            <div className="week-tape" ref={tape}>
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
            requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
          }}
          onCreated={onCreated}
        />
      )}
    </section>
  );
}
