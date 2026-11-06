import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  BellRing,
  CheckCheck,
  Settings,
  X,
  Trash2,
  CalendarDays,
  Heart,
  ImagePlus,
  UsersRound,
} from 'lucide-react';
import { api } from './api.js';
import { useBodyScrollLock, ConfirmDialog } from './Overlays.js';
import type {
  ReminderSource,
  ReminderPreferences,
  ReminderRuleView,
  NotificationView,
  NotificationList,
} from '../../../packages/domain/reminders.js';

type SettingsResponse = {
  preferences: ReminderPreferences;
  canEmail: boolean;
  schedulerConfigured: boolean;
  lastSchedulerRunAt: number | null;
};
function ReminderModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useBodyScrollLock();
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="reminder-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">GIỮ MỘT NGÀY TRONG LÒNG</span>
          <h2>{title}</h2>
        </div>
        <button className="icon-button" aria-label="Đóng lời nhắc" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
const offsetLabel = (n: number) => (n ? `Trước ${n} ngày` : 'Đúng ngày');
const equalSource = (a: ReminderSource, b: ReminderSource) =>
  a.kind === b.kind &&
  a.id === b.id &&
  (a.kind !== 'album-memory' || (b.kind === 'album-memory' && a.memoryId === b.memoryId));
export function ReminderDialog({
  source,
  title,
  onClose,
  onSaved,
}: {
  source: ReminderSource;
  title: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [settings, setSettings] = useState<SettingsResponse>(),
    [rule, setRule] = useState<ReminderRuleView>(),
    [offsets, setOffsets] = useState<number[]>([1]),
    [email, setEmail] = useState(false),
    [enabled, setEnabled] = useState(true),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all([
      api<SettingsResponse>('/reminder-settings', { signal: abort.signal }),
      api<ReminderRuleView[]>('/reminders', { signal: abort.signal }),
    ])
      .then(([s, rules]) => {
        setSettings(s);
        const found = rules.find((r) => equalSource(r.source, source));
        if (found) {
          setRule(found);
          setOffsets(found.offsets);
          setEmail(found.email);
          setEnabled(found.enabled);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, []);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/reminders', {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: rule?.revision ?? -1,
          content: { source, offsets, email, enabled },
        }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ReminderModal
      title="Nhắc tôi về ngày này"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="reminder-source-title">{title}</p>
      {loading ? (
        <p role="status">Đang mở lời nhắc…</p>
      ) : settings ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="form-stack"
        >
          <label className="check-label">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Bật lời nhắc cho kỉ niệm này
          </label>
          <fieldset disabled={busy}>
            <legend>Bạn muốn được nhắc khi nào?</legend>
            <div className="reminder-offsets">
              {[0, 1, 3, 7].map((n) => (
                <label key={n} className={offsets.includes(n) ? 'chosen' : ''}>
                  <input
                    type="checkbox"
                    checked={offsets.includes(n)}
                    onChange={(e) =>
                      setOffsets((values) =>
                        e.target.checked ? [...values, n] : values.filter((v) => v !== n),
                      )
                    }
                  />
                  {offsetLabel(n)}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="reminder-hint">
            <Bell size={15} />
            Thông báo trong app sau {String(settings.preferences.hour).padStart(2, '0')}:00 ·{' '}
            {settings.preferences.timeZone}. Đổi giờ tại Chuông → Cài đặt.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={email}
              disabled={busy || (!settings.canEmail && !email)}
              onChange={(e) => setEmail(e.target.checked)}
            />
            Nhận thêm email cho kỉ niệm này
          </label>
          {!settings.canEmail && (
            <p className="muted small">Email cần được xác minh và dịch vụ gửi thư cần sẵn sàng.</p>
          )}
          {email && !settings.preferences.emailEnabled && (
            <p className="reminder-hint">
              Bạn còn cần bật nhận email tại Chuông → Cài đặt. Hiện chỉ nhắc trong app.
            </p>
          )}
          {email && !settings.schedulerConfigured && (
            <p className="reminder-hint">Lịch gửi email tự động đang chờ quản trị viên cấu hình.</p>
          )}
          <button className="button primary full" disabled={busy || !offsets.length}>
            {busy ? 'Đang lưu…' : 'Lưu lời nhắc'}
          </button>
        </form>
      ) : null}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </ReminderModal>
  );
}

export function NotificationCenter({
  userId,
  onNavigate,
  onOpenDay,
  onItems,
  onPreferences,
}: {
  userId: string;
  onNavigate?: (target: string) => void;
  onOpenDay: (date: string) => void;
  onItems: (items: NotificationView[]) => void;
  onPreferences: (preferences: ReminderPreferences) => void;
}) {
  const [list, setList] = useState<NotificationList>({ items: [], unread: 0 }),
    [open, setOpen] = useState(false),
    [tab, setTab] = useState<'notifications' | 'rules' | 'settings'>('notifications'),
    [settings, setSettings] = useState<SettingsResponse>(),
    [rules, setRules] = useState<ReminderRuleView[]>([]),
    [prefs, setPrefs] = useState<ReminderPreferences>(),
    [editing, setEditing] = useState<ReminderRuleView | null>(null),
    [deleting, setDeleting] = useState<ReminderRuleView | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const callbacks = useRef({ onItems, onPreferences });
  const loadVersion = useRef(0);
  callbacks.current = { onItems, onPreferences };
  const load = async (signal?: AbortSignal) => {
    const version = ++loadVersion.current;
    const result = await api<NotificationList>('/notifications', { signal });
    if (signal?.aborted || version !== loadVersion.current) return;
    setList(result);
    callbacks.current.onItems(result.items);
  };
  useEffect(() => {
    const abort = new AbortController();
    const refresh = () => {
      if (document.visibilityState === 'visible') void load(abort.signal).catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('little-days:reminders', refresh);
    window.addEventListener('little-days:shared-activity', refresh);
    return () => {
      loadVersion.current++;
      abort.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('little-days:reminders', refresh);
      window.removeEventListener('little-days:shared-activity', refresh);
    };
  }, [userId]);
  const details = async () => {
    setLoading(true);
    setError('');
    try {
      const [s, r] = await Promise.all([
        api<SettingsResponse>('/reminder-settings'),
        api<ReminderRuleView[]>('/reminders'),
      ]);
      setSettings(s);
      setPrefs(s.preferences);
      setRules(r);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (open) void details();
  }, [open]);
  const save = async () => {
    if (!prefs) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await api<ReminderPreferences>('/reminder-settings', {
        method: 'PATCH',
        body: JSON.stringify({ expectedRevision: prefs.revision, content: prefs }),
      });
      setPrefs(next);
      setSettings((s) => (s ? { ...s, preferences: next } : s));
      callbacks.current.onPreferences(next);
      setMessage('Đã lưu cách nhắc của bạn.');
      window.dispatchEvent(new Event('little-days:reminders'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openNotice = async (n: NotificationView) => {
    setError('');
    try {
      await api('/notifications/' + n.id + '/read', { method: 'POST' });
      setOpen(false);
      if (n.target && /^\/(timeline|together|calendar)\?/.test(n.target) && onNavigate)
        onNavigate(n.target);
      else onOpenDay(n.occurrenceDate);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <button
        className="icon-button notification-bell"
        aria-label={`Thông báo${list.unread ? ' · ' + list.unread + ' chưa đọc' : ''}`}
        title="Thông báo & lời nhắc"
        onClick={() => {
          setOpen(true);
          setTab('notifications');
        }}
      >
        <Bell size={20} />
        {list.unread > 0 && <b>{list.unread > 99 ? '99+' : list.unread}</b>}
      </button>
      {open && (
        <ReminderModal
          title="Những ngày muốn nhớ"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <nav className="reminder-tabs" aria-label="Mục lời nhắc">
            {(
              [
                ['notifications', 'Thông báo', BellRing],
                ['rules', 'Lời nhắc', CalendarDays],
                ['settings', 'Cài đặt', Settings],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                aria-pressed={tab === id}
                onClick={() => {
                  setTab(id);
                  setMessage('');
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
          {loading ? (
            <p role="status">Đang tải những ngày của bạn…</p>
          ) : (
            <>
              {tab === 'notifications' && (
                <section className="notification-list" aria-label="Danh sách thông báo">
                  {list.items.length > 0 && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void api('/notifications/all/read', { method: 'POST' })
                          .then(() => load())
                          .catch((e) => setError(e.message))
                      }
                    >
                      <CheckCheck size={15} />
                      Đánh dấu tất cả đã đọc
                    </button>
                  )}
                  {list.items.length ? (
                    list.items.map((n) => (
                      <button
                        key={n.id}
                        className={'notification-item ' + (!n.readAt ? 'unread' : '')}
                        onClick={() => void openNotice(n)}
                      >
                        <span className="notice-icon">
                          {n.kind === 'love-note' ? (
                            <Heart size={19} />
                          ) : n.kind === 'invite' || n.kind === 'accepted' ? (
                            <UsersRound size={19} />
                          ) : n.kind === 'photo' || n.kind === 'memory' ? (
                            <ImagePlus size={19} />
                          ) : (
                            <BellRing size={19} />
                          )}
                        </span>
                        <span>
                          <strong>{n.title}</strong>
                          <small>
                            {n.kind
                              ? new Date(n.createdAt).toLocaleString('vi-VN', {
                                  day: 'numeric',
                                  month: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : `${n.occurrenceDate} · ${offsetLabel(n.offset)}`}
                          </small>
                          {n.emailDelivery === 'accepted' && (
                            <small>Email đã được dịch vụ tiếp nhận</small>
                          )}
                          {['failed', 'unknown', 'sending'].includes(n.emailDelivery) && (
                            <small>
                              Trạng thái email:{' '}
                              {n.emailDelivery === 'failed'
                                ? 'chưa gửi được'
                                : n.emailDelivery === 'unknown'
                                  ? 'chưa xác định'
                                  : 'đang xử lý'}
                            </small>
                          )}
                        </span>
                        <i aria-hidden="true" />
                      </button>
                    ))
                  ) : (
                    <div className="reminder-empty">
                      <BellRing size={28} />
                      <h3>Mọi điều mới sẽ ở đây</h3>
                      <p>
                        Lời mời, dấu mốc, ảnh và điều thương từ không gian chung, cùng những ngày
                        bạn muốn được nhắc.
                      </p>
                    </div>
                  )}
                </section>
              )}
              {tab === 'rules' && (
                <section className="reminder-rule-list" aria-label="Các lời nhắc đã lưu">
                  {rules.length ? (
                    rules.map((r) => (
                      <article key={r.id}>
                        <div>
                          <strong>{r.title}</strong>
                          <p>{r.offsets.map(offsetLabel).join(' · ')}</p>
                          <small>
                            {!r.available
                              ? 'Không còn quyền xem'
                              : r.enabled
                                ? 'Đang bật'
                                : 'Đã tắt'}
                            {r.email ? ' · Có chọn email' : ''}
                          </small>
                        </div>
                        <button
                          className="button quiet"
                          disabled={!r.available}
                          onClick={() => setEditing(r)}
                        >
                          Chỉnh
                        </button>
                        <button
                          className="icon-button"
                          aria-label={'Xóa lời nhắc ' + r.title}
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </article>
                    ))
                  ) : (
                    <p className="reminder-empty">Bạn chưa lưu lời nhắc nào.</p>
                  )}
                </section>
              )}
              {tab === 'settings' && prefs && settings && (
                <form
                  className="form-stack reminder-settings"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                  }}
                >
                  <div className="two-fields">
                    <label>
                      Giờ bắt đầu nhắc
                      <select
                        value={prefs.hour}
                        onChange={(e) => setPrefs({ ...prefs, hour: Number(e.target.value) })}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {String(i).padStart(2, '0')}:00
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Múi giờ
                      <input
                        list="reminder-timezones"
                        value={prefs.timeZone}
                        maxLength={80}
                        onChange={(e) => setPrefs({ ...prefs, timeZone: e.target.value })}
                      />
                      <datalist id="reminder-timezones">
                        <option value="Asia/Ho_Chi_Minh" />
                        <option value="Asia/Bangkok" />
                        <option value="Asia/Tokyo" />
                        <option value="Europe/London" />
                        <option value="America/New_York" />
                      </datalist>
                    </label>
                  </div>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={prefs.emailEnabled}
                      disabled={busy || (!settings.canEmail && !prefs.emailEnabled)}
                      onChange={(e) => setPrefs({ ...prefs, emailEnabled: e.target.checked })}
                    />
                    Tôi muốn nhận email cho những lời nhắc đã chọn
                  </label>
                  {!settings.canEmail && (
                    <p className="muted small">
                      Email cần được xác minh và dịch vụ gửi thư cần sẵn sàng.
                    </p>
                  )}
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={prefs.showHolidays}
                      onChange={(e) => setPrefs({ ...prefs, showHolidays: e.target.checked })}
                    />
                    Hiển thị ngày lễ và dịp kỷ niệm trên lịch
                  </label>
                  <p className="reminder-hint">
                    Thông báo trong app xuất hiện khi mở trang sau giờ đã chọn. Email được lịch tự
                    động kiểm tra theo giờ, có thể đến muộn trong ngày.
                  </p>
                  {!settings.schedulerConfigured && (
                    <p className="reminder-hint">
                      Email tự động đang chờ quản trị viên bật lịch gửi.
                    </p>
                  )}
                  {settings.schedulerConfigured && !settings.lastSchedulerRunAt && (
                    <p className="reminder-hint">Chưa ghi nhận lượt chạy lịch tự động đầu tiên.</p>
                  )}
                  {settings.lastSchedulerRunAt &&
                  Date.now() - settings.lastSchedulerRunAt > 26 * 3600000 ? (
                    <p className="reminder-hint">
                      Lịch gửi chưa chạy lại trong hơn một ngày. Quản trị viên cần kiểm tra lịch tự
                      động.
                    </p>
                  ) : null}
                  <button className="button primary" disabled={busy}>
                    {busy ? 'Đang lưu…' : 'Lưu cách nhắc'}
                  </button>
                </form>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}{' '}
              <button className="text-button" onClick={() => void details()}>
                Tải lại
              </button>
            </p>
          )}
          {message && (
            <p role="status" className="success-message">
              {message}
            </p>
          )}
        </ReminderModal>
      )}
      {editing && (
        <ReminderDialog
          source={editing.source}
          title={editing.title}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void details();
            window.dispatchEvent(new Event('little-days:reminders'));
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Xóa lời nhắc?"
          description={'Ngừng nhắc về “' + deleting.title + '”. Kỉ niệm vẫn được giữ nguyên.'}
          confirmLabel="Xóa lời nhắc"
          busy={busy}
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
          onConfirm={() => {
            setBusy(true);
            void api('/reminders/' + encodeURIComponent(deleting.id), {
              method: 'DELETE',
              body: JSON.stringify({ expectedRevision: deleting.revision }),
            })
              .then(() => {
                setDeleting(null);
                return details();
              })
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        />
      )}
    </>
  );
}
