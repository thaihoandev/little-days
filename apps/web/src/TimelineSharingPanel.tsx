import { useEffect, useRef, useState, type FormEvent } from 'react';
import { UsersRound, X, LoaderCircle } from 'lucide-react';
import type { TimelineGrant, TimelineSharingState } from '../../../packages/domain/journal.js';
import { api } from './api.js';
import { ConfirmDialog, useBodyScrollLock } from './Overlays.js';
import { UserAvatar } from './UserAvatar.js';
import { PairingCard } from './Pairing.js';
import { signatureFeaturesAvailable } from './signature-features.js';

export function TimelineSharingPanel({
  state,
  verified,
  onChange,
  onClose,
  spaceId,
}: {
  state: TimelineSharingState;
  verified: boolean;
  onChange: () => Promise<void>;
  onClose: () => void;
  spaceId?: string;
}) {
  useBodyScrollLock();
  const dialog = useRef<HTMLDialogElement>(null);
  const [calendarChanges, setCalendarChanges] = useState<Record<string, boolean>>({});
  const [inviteMode, setInviteMode] = useState<'email' | 'qr'>('email');
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
      const result = await api<{ emailDelivery?: string }>('/timeline-sharing', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      await onChange();
      setEmail('');
      setMessage(
        result.emailDelivery === 'accepted'
          ? 'Lời mời đã lưu và email thông báo đã được gửi. Người nhận tự quyết định tham gia trong Little Days.'
          : result.emailDelivery === 'unknown'
            ? 'Lời mời đã lưu. Chưa xác nhận được email; người nhận vẫn có thể mở lời mời trong ứng dụng.'
            : 'Lời mời đã lưu trong ứng dụng. Người nhận mở Chia sẻ dòng thời gian để chấp nhận.',
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
              <UsersRound size={22} /> Không gian chung
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
          Cùng sử dụng một không gian: cả hai thêm dấu mốc, chuẩn bị kế hoạch và lưu ảnh tại đây.
          Chỉ dấu mốc lưu ở Không gian chung mới được cùng xem. Không gian riêng và album cá nhân
          không tự động được chia sẻ.
        </p>
        {!verified && (
          <p className="sharing-hint">
            Đăng nhập và xác minh email trong Tài khoản để mời hoặc chấp nhận lời mời.
          </p>
        )}
        {(!spaceId ||
          spaceId === state.ownId ||
          state.spaces?.some((s) => s.id === spaceId && !s.shared)) && (
          <div>
            {signatureFeaturesAvailable() && (
              <div className="document-kind-picker" role="group" aria-label="Cách mời người thương">
                <button
                  type="button"
                  aria-pressed={inviteMode === 'email'}
                  onClick={() => setInviteMode('email')}
                >
                  Qua email
                </button>
                <button
                  type="button"
                  aria-pressed={inviteMode === 'qr'}
                  onClick={() => setInviteMode('qr')}
                >
                  Mã QR kết đôi
                </button>
              </div>
            )}
            {inviteMode === 'qr' ? (
              <PairingCard verified={verified} />
            ) : (
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
                  {busy && <LoaderCircle size={16} className="spin" />}
                  {busy ? 'Đang gửi lời mời…' : 'Mời cùng chỉnh sửa'}
                </button>
              </form>
            )}
          </div>
        )}
        {state.spaces
          ?.filter((space) => space.shared && (!spaceId || space.id === spaceId))
          .map((space) => (
            <section
              className="shared-space-members"
              key={space.id}
              aria-label="Thành viên không gian chung"
            >
              <h3>{space.title}</h3>
              <div>
                {space.members.map((member) => (
                  <span key={member.id}>
                    <UserAvatar name={member.displayName} url={member.avatarUrl} />
                    <strong>{member.displayName}</strong>
                    <small>Cùng chỉnh sửa</small>
                  </span>
                ))}
              </div>
            </section>
          ))}
        <p className="muted small">
          Người nhận cần có tài khoản đã xác minh email. Lời mời luôn được lưu trong ứng dụng; email
          thông báo được gửi thêm khi dịch vụ sẵn sàng.
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
          <h3>Thành viên và lời mời đã gửi</h3>
          {outgoing.length ? (
            outgoing.map((g) => (
              <article className="timeline-member" key={g.id}>
                <UserAvatar name={g.memberLabel} url={g.memberAvatarUrl} />
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
          <h3>Không gian tham gia và lời mời nhận được</h3>
          {incoming.length ? (
            incoming.map((g) => (
              <article className="timeline-member incoming" key={g.id}>
                <UserAvatar name={g.ownerLabel} url={g.ownerAvatarUrl} />
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
          description="Quyền tham gia không gian và xem ảnh sẽ kết thúc. Những dấu mốc đã cùng tạo vẫn được giữ trong không gian."
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
