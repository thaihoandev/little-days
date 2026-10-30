import { useEffect, useRef, useState, type FormEvent } from 'react';
import { UsersRound, X } from 'lucide-react';
import type { TimelineGrant, TimelineSharingState } from '../../../packages/domain/journal.js';
import { api } from './api.js';
import { ConfirmDialog, useBodyScrollLock } from './Overlays.js';

export function TimelineSharingPanel({
  state,
  verified,
  onChange,
  onClose,
}: {
  state: TimelineSharingState;
  verified: boolean;
  onChange: () => Promise<void>;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const dialog = useRef<HTMLDialogElement>(null);
  const [calendarChanges, setCalendarChanges] = useState<Record<string, boolean>>({});
  const [email, setEmail] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [removing, setRemoving] = useState<TimelineGrant | null>(null);
  useEffect(() => {
    let active = true;
    dialog.current!.showModal();
    void onChange().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
      dialog.current?.close();
    };
  }, []);
  const change = async (grant: TimelineGrant, body: object, remove = false) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/timeline-sharing/' + grant.id, {
        method: remove ? 'DELETE' : 'PATCH',
        body: JSON.stringify({ expectedRevision: grant.revision, ...body }),
      });
      await onChange();
      setRemoving(null);
    } catch (e) {
      setRemoving(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/timeline-sharing', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      await onChange();
      setEmail('');
      setMessage(
        'Đã tạo lời mời. Người nhận mở Chia sẻ dòng thời gian trong tài khoản của họ để chấp nhận.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const incoming = state.grants.filter((g) => g.memberId === state.ownId),
    outgoing = state.grants.filter((g) => g.timelineOwner === state.ownId);
  return (
    <>
      <dialog
        ref={dialog}
        className="timeline-sharing-dialog"
        aria-label="Chia sẻ dòng thời gian"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) onClose();
        }}
      >
        <header>
          <div>
            <span className="eyebrow">CÙNG NHAU GIỮ LẠI</span>
            <h2>
              <UsersRound size={22} /> Chia sẻ dòng thời gian
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Đóng chia sẻ dòng thời gian"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <p>
          Mời người được chỉ định cùng thêm, sửa, xóa dấu mốc và ảnh. Album riêng không tự động được
          chia sẻ.
        </p>
        {!verified && (
          <p className="sharing-hint">
            Đăng nhập và xác minh email trong Tài khoản để mời hoặc chấp nhận lời mời.
          </p>
        )}
        <form onSubmit={(e) => void invite(e)} className="timeline-invite-form">
          <label>
            Email người cùng xây dựng
            <input
              type="email"
              required
              maxLength={254}
              placeholder="nguoi-thuong@example.com"
              value={email}
              disabled={!verified || busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={!verified || busy}>
            Mời cùng chỉnh sửa
          </button>
        </form>
        <p className="muted small">
          Người nhận cần có tài khoản đã xác minh email. Lời mời hiển thị trong ứng dụng.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="sharing-hint">
            {message}
          </p>
        )}
        <section aria-label="Người được mời">
          <h3>Người cùng xây dựng dòng thời gian của bạn</h3>
          {outgoing.length ? (
            outgoing.map((g) => (
              <article className="timeline-member" key={g.id}>
                <div>
                  <strong>{g.memberLabel}</strong>
                  <small>{g.state === 'pending' ? 'Đang chờ chấp nhận' : 'Có thể chỉnh sửa'}</small>
                </div>
                <button
                  className="text-button danger"
                  disabled={busy}
                  aria-label={'Thu hồi quyền ' + g.memberLabel}
                  onClick={() => setRemoving(g)}
                >
                  {g.state === 'pending' ? 'Hủy lời mời' : 'Thu hồi quyền'}
                </button>
              </article>
            ))
          ) : (
            <p className="muted small">Dòng thời gian này hiện chỉ mình bạn xem và chỉnh sửa.</p>
          )}
        </section>
        <section aria-label="Dòng thời gian được chia sẻ">
          <h3>Dòng thời gian được chia sẻ với bạn</h3>
          {incoming.length ? (
            incoming.map((g) => (
              <article className="timeline-member incoming" key={g.id}>
                <div>
                  <strong>{g.ownerLabel}</strong>
                  <small>
                    {g.state === 'pending'
                      ? 'Mời bạn cùng xây dựng dòng thời gian'
                      : 'Bạn có thể thêm, sửa, xóa dấu mốc và ảnh'}
                  </small>
                </div>
                {g.state === 'pending' ? (
                  <button
                    className="button primary"
                    disabled={busy || !verified}
                    aria-label={'Chấp nhận lời mời ' + g.ownerLabel}
                    onClick={() => void change(g, { action: 'accept' })}
                  >
                    Chấp nhận
                  </button>
                ) : (
                  <label className="sharing-calendar-toggle">
                    <input
                      type="checkbox"
                      checked={calendarChanges[g.id] ?? g.showOnCalendar}
                      disabled={busy}
                      onChange={(e) => {
                        const value = e.target.checked;
                        setCalendarChanges((changes) => ({ ...changes, [g.id]: value }));
                        void change(g, { action: 'calendar', showOnCalendar: value }).finally(() =>
                          setCalendarChanges((changes) => {
                            const next = { ...changes };
                            delete next[g.id];
                            return next;
                          }),
                        );
                      }}
                    />
                    Hiện trên lịch của tôi
                  </label>
                )}
                <button
                  className="text-button"
                  disabled={busy}
                  aria-label={'Rời dòng thời gian ' + g.ownerLabel}
                  onClick={() => setRemoving(g)}
                >
                  {g.state === 'pending' ? 'Từ chối' : 'Rời dòng thời gian'}
                </button>
              </article>
            ))
          ) : (
            <p className="muted small">Lời mời nhận được sẽ xuất hiện ở đây.</p>
          )}
        </section>
        <footer>
          <button
            className="button quiet"
            disabled={busy}
            onClick={() => void onChange().catch((e) => setError(e.message))}
          >
            Tải lại lời mời
          </button>
          <button className="button primary" disabled={busy} onClick={onClose}>
            Xong
          </button>
        </footer>
      </dialog>
      {removing && (
        <ConfirmDialog
          title={
            removing.timelineOwner === state.ownId
              ? 'Thu hồi quyền truy cập?'
              : 'Rời dòng thời gian?'
          }
          description="Quyền xem và chỉnh sửa dòng thời gian cùng ảnh sẽ kết thúc. Các dấu mốc đã lưu vẫn thuộc dòng thời gian gốc."
          confirmLabel="Xác nhận"
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
          onConfirm={() => {
            if (!busy) void change(removing, {}, true);
          }}
        />
      )}
    </>
  );
}
