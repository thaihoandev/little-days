import { useEffect, useRef, useState } from 'react';
import { Heart, Sparkles, Check, Flame, UsersRound, ChevronDown } from 'lucide-react';
import type { TimelineSpace } from '../../../packages/domain/journal.js';
import type { RhythmView } from '../../../packages/domain/rhythm.js';
import { api, ApiError } from './api.js';
import { Hourglass3D } from './Hourglass3D.js';
import { UserAvatar } from './UserAvatar.js';
import { rhythmCache as cache } from './rhythm-cache.js';
export { clearRhythmMemory } from './rhythm-cache.js';
export function TogetherHome({
  userId,
  spaces,
  ready,
  enabled,
  refreshKey,
  immersiveActive = true,
  onNavigate,
}: {
  userId: string;
  spaces: TimelineSpace[];
  ready: boolean;
  enabled: boolean;
  refreshKey: string;
  immersiveActive?: boolean;
  onNavigate: (path: string) => void;
}) {
  const shared = spaces.filter((s) => s.shared && s.members.length > 1),
    [chosen, setChosen] = useState('');
  const space = shared.find((s) => s.id === chosen) || shared[0];
  const scope = space ? [space.id, ...space.members.map((m) => m.id).sort()].join(':') : '';
  const [data, setData] = useState<RhythmView | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [hidden, setHidden] = useState(() => {
      try {
        return localStorage.getItem('rhythm-hidden:' + userId) === '1';
      } catch {
        return false;
      }
    });
  const version = useRef(refreshKey);
  useEffect(() => {
    const controller = new AbortController();
    const key = userId + ':' + scope + ':' + refreshKey;
    setError('');
    setData((current) => (current?.spaceId === space?.id ? current : null));
    if (!space || !enabled || hidden) return;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < 30000 && version.current === refreshKey) {
      setData(cached.data);
      return;
    }
    version.current = refreshKey;
    void api<RhythmView>('/together/' + space.id + '/rhythm', { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        cache.set(key, { at: Date.now(), data: value });
        while (cache.size > 12) cache.delete(cache.keys().next().value!);
        setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
            cache.delete(key);
            setData(null);
          }
        }
      });
    return () => controller.abort();
  }, [userId, scope, enabled, refreshKey, retry, hidden]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        cache.clear();
        setRetry((n) => n + 1);
      }
    };
    window.addEventListener('little-days:shared-activity', refresh);
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('little-days:shared-activity', refresh);
      window.removeEventListener('focus', refresh);
      clearInterval(timer);
    };
  }, []);
  const target = (tab: string) => '/together?tab=' + tab + (space ? '&space=' + space.id : '');
  if (!ready)
    return (
      <section className="together-home is-loading">
        <p role="status">Đang mở không gian của mình…</p>
      </section>
    );
  return (
    <section
      className={'together-home' + (hidden || !enabled ? ' rhythm-hidden' : '')}
      aria-label="Nhịp yêu thương"
    >
      {!hidden && enabled && (
        <Hourglass3D
          active={immersiveActive}
          autoStart={!!space}
          progress={(data?.completedDays || 0) / 7}
        />
      )}
      <div className="together-home-content">
        <header>
          <h2>Một điều cho nhau</h2>
          {space && (
            <div
              className="home-space-members"
              aria-label={
                'Thành viên không gian: ' + space.members.map((m) => m.displayName).join(', ')
              }
            >
              <span className="home-face-stack">
                {space.members.map((m) => (
                  <UserAvatar key={m.id} name={m.displayName} url={m.avatarUrl} />
                ))}
              </span>
              <small>{space.members.map((m) => m.displayName).join(' & ')}</small>
            </div>
          )}
        </header>
        {space && shared.length > 1 && (
          <label className="rhythm-space">
            <UsersRound size={14} />
            <select
              aria-label="Không gian của nhịp yêu thương"
              value={space.id}
              onChange={(e) => setChosen(e.target.value)}
            >
              {shared.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {s.members.map((m) => m.displayName).join(' & ')}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
        )}
        {!space ? (
          <p>Một câu hỏi, một lời cảm ơn, một ngày gần nhau hơn.</p>
        ) : !hidden && enabled ? (
          <>
            {error ? (
              <p role="alert">
                {error}{' '}
                <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
                  Thử lại
                </button>
              </p>
            ) : !data ? (
              <p role="status">Đang xem nhịp tuần này…</p>
            ) : (
              <>
                <div className="rhythm-summary">
                  <strong>
                    {data.completedDays}
                    <small>/7 ngày cùng góp</small>
                  </strong>
                  {data.streak > 1 && (
                    <span
                      className="rhythm-streak"
                      title="Chuỗi ngày gần đây mọi thành viên đều có đóng góp"
                    >
                      <Flame size={15} />
                      {data.streak}
                      {data.streakCapped ? '+' : ''} ngày
                    </span>
                  )}
                </div>
                <div className="rhythm-week" aria-label="Nhịp bảy ngày trong tuần">
                  {data.days.map((d, i) => (
                    <span
                      key={d.date}
                      className={d.state + (d.date === data.today ? ' is-today' : '')}
                      title={
                        d.date +
                        ' · ' +
                        {
                          empty: 'Chưa có đóng góp',
                          started: 'Đã có một chút thương',
                          together: 'Đã cùng góp một điều nhỏ',
                          future: 'Ngày sắp tới',
                        }[d.state]
                      }
                    >
                      <i>
                        {d.state === 'together' ? (
                          <Check size={13} />
                        ) : d.state === 'started' ? (
                          <Heart size={11} />
                        ) : null}
                      </i>
                      <small>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i]}</small>
                    </span>
                  ))}
                </div>
                <p className="rhythm-today">
                  {data.togetherToday
                    ? 'Hôm nay mình đã cùng giữ một điều nhỏ.'
                    : data.myToday
                      ? 'Bạn đã góp một chút thương hôm nay.'
                      : 'Hôm nay, mình dành cho nhau một điều nhỏ nhé.'}
                </p>
              </>
            )}
          </>
        ) : null}
        <div className="ritual-home-links">
          <button onClick={() => onNavigate(target('questions'))}>
            <Sparkles size={20} />
            <span>
              <strong>Câu hỏi dành cho hai người</strong>
              <small>Một câu để hiểu nhau.</small>
            </span>
          </button>
          <button onClick={() => onNavigate(target('jar'))}>
            <Heart size={20} />
            <span>
              <strong>Lọ điều thương</strong>
              <small>Một lời để dành đúng lúc.</small>
            </span>
          </button>
        </div>
        {!space && (
          <button className="text-button" onClick={() => onNavigate('/timeline?sharing=1')}>
            Mời người thương cùng giữ nhịp <UsersRound size={14} />
          </button>
        )}
        {enabled && (
          <footer className="rhythm-footer">
            <details>
              <summary>Cách giữ nhịp</summary>
              <p>
                Lưu một câu trả lời, lời thương, dấu mốc hoặc ảnh trong không gian chung. Mỗi người
                tính một lần mỗi ngày theo giờ Việt Nam; khi mọi thành viên cùng góp, ngày đó sáng
                lên. Nghỉ một ngày vẫn giữ những ngày đã làm trong tuần. Nhịp gần đây chỉ tính nội
                dung đang còn quyền xem.
              </p>
            </details>
            <button
              className="text-button"
              onClick={() => {
                const next = !hidden;
                setHidden(next);
                try {
                  localStorage.setItem('rhythm-hidden:' + userId, next ? '1' : '0');
                } catch {}
              }}
            >
              {hidden ? 'Hiện nhịp tuần' : 'Ẩn nhịp tuần'}
            </button>
          </footer>
        )}
      </div>
    </section>
  );
}
