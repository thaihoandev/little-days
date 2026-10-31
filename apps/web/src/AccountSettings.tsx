import { useState } from 'react';
import { LoaderCircle, Lock, LogOut } from 'lucide-react';
import { api } from './api.js';
import { UsagePanel } from './UsagePanel.js';
import { ProfileSettings, type ProfileView } from './ProfileSettings.js';

export type PublicUser = {
  id: string;
  email: string | null;
  emailVerified?: boolean;
  displayName?: string;
  avatarUrl?: string;
  profileRevision?: number;
};
export default function AccountSettings({
  user,
  onChange,
  initialMode = 'register',
  onProfileChange,
}: {
  user: PublicUser | null;
  onChange: (message?: string, receipt?: string) => void;
  initialMode?: 'register' | 'login';
  onProfileChange?: (value: ProfileView) => void;
}) {
  const [deleting, setDeleting] = useState(false),
    [deletePassword, setDeletePassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [acknowledged, setAcknowledged] = useState(false);
  const [mode, setMode] = useState<'register' | 'login' | 'forgot'>(initialMode);
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState(''),
    [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [changing, setChanging] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (user?.email)
    return (
      <div className="form-stack account-settings">
        {typeof user.profileRevision === 'number' && (
          <ProfileSettings
            value={{
              displayName: user.displayName || user.email.split('@')[0],
              avatarUrl: user.avatarUrl,
              profileRevision: user.profileRevision,
            }}
            onChange={(value) => onProfileChange?.(value)}
          />
        )}
        <UsagePanel />
        <p>
          <strong>{user.email}</strong>
        </p>
        <p className={'verification-status ' + (user.emailVerified ? 'verified' : '')}>
          {user.emailVerified ? 'Email đã xác minh' : 'Email chưa xác minh'}
        </p>
        {!user.emailVerified && (
          <button
            className="button quiet"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await api<{ message: string }>('/auth/request-verification', {
                  method: 'POST',
                });
                setMessage(result.message);
              })
            }
          >
            Gửi lại email xác minh
          </button>
        )}
        <p className="muted small">
          Album chỉ hiển thị với tài khoản của bạn, trừ khi bạn chủ động tạo link chia sẻ.
        </p>
        <button
          className="button quiet"
          disabled={busy}
          onClick={() => {
            setChanging((value) => !value);
            setError('');
            setMessage('');
          }}
        >
          Đổi mật khẩu
        </button>
        {changing && (
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                if (password !== confirmPassword) throw new Error('Hai mật khẩu mới chưa khớp.');
                const result = await api<{ message: string }>('/auth/change-password', {
                  method: 'POST',
                  body: JSON.stringify({ currentPassword, newPassword: password }),
                });
                setCurrentPassword('');
                setPassword('');
                setConfirmPassword('');
                setChanging(false);
                setMessage(result.message);
              });
            }}
          >
            <label>
              Mật khẩu hiện tại
              <input
                type="password"
                autoComplete="current-password"
                required
                minLength={10}
                maxLength={200}
                value={currentPassword}
                disabled={busy}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              Mật khẩu mới
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={200}
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              Nhập lại mật khẩu mới
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={200}
                value={confirmPassword}
                disabled={busy}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Lưu mật khẩu mới
            </button>
            <p className="muted small">Sau khi đổi, các phiên đăng nhập khác cần đăng nhập lại.</p>
          </form>
        )}
        <button
          className="button quiet"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api('/auth/logout', { method: 'POST' });
              try {
                for (const key of Object.keys(localStorage))
                  if (key.startsWith('scrapbook-draft:' + user.id + ':'))
                    localStorage.removeItem(key);
              } catch {
                /* Logout still succeeds when device storage is unavailable. */
              }
              onChange();
            })
          }
        >
          <LogOut size={17} />
          Đăng xuất
        </button>
        <div className="delete-account-section">
          <button
            className="button danger"
            disabled={busy}
            onClick={() => {
              setDeleting((value) => !value);
              setChanging(false);
              setError('');
              setMessage('');
            }}
          >
            Xóa tài khoản
          </button>
          {deleting && (
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  if (!acknowledged || confirmation !== 'XÓA TÀI KHOẢN')
                    throw new Error('Hãy xác nhận trước khi xóa.');
                  const result = await api<{ receipt: string; message: string }>('/auth/account', {
                    method: 'DELETE',
                    body: JSON.stringify({ password: deletePassword, confirmation }),
                  });
                  try {
                    for (const key of Object.keys(localStorage))
                      if (key.startsWith('scrapbook-draft:' + user.id + ':'))
                        localStorage.removeItem(key);
                  } catch {
                    /* Server deletion remains active if browser storage is unavailable. */
                  }
                  setDeletePassword('');
                  onChange(result.message, result.receipt);
                });
              }}
            >
              <h3>Xóa tài khoản vĩnh viễn</h3>
              <p>
                Album, kỉ niệm, mẫu riêng, ảnh, nhạc và video của tài khoản sẽ bị xóa. Link chia sẻ
                và mọi phiên đăng nhập được thu hồi; video đang xuất sẽ bị hủy. Thao tác không thể
                hoàn tác.
              </p>
              <p className="muted small">
                Các bản sao lưu do người vận hành đã tạo trước đó cần được xử lý riêng theo thời hạn
                lưu trữ.
              </p>
              <label>
                Mật khẩu để xóa tài khoản
                <input
                  type="password"
                  autoComplete="current-password"
                  minLength={10}
                  maxLength={200}
                  required
                  value={deletePassword}
                  disabled={busy}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
              </label>
              <label>
                Nhập XÓA TÀI KHOẢN để xác nhận
                <input
                  value={confirmation}
                  maxLength={40}
                  required
                  disabled={busy}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  required
                  checked={acknowledged}
                  disabled={busy}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                Tôi hiểu dữ liệu sẽ bị xóa vĩnh viễn
              </label>
              <button
                className="button danger"
                disabled={busy || !acknowledged || confirmation !== 'XÓA TÀI KHOẢN'}
              >
                Xác nhận xóa tài khoản vĩnh viễn
              </button>
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                Giữ lại tài khoản
              </button>
            </form>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}
      </div>
    );
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          if (mode === 'forgot') {
            const result = await api<{ message: string }>('/auth/request-reset', {
              method: 'POST',
              body: JSON.stringify({ email }),
            });
            setMessage(result.message);
            return;
          }
          const result = await api<{ verificationEmailSent?: boolean }>('/auth/' + mode, {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          onChange(
            mode === 'register'
              ? result.verificationEmailSent === false
                ? 'Tài khoản đã tạo. Email xác minh chưa gửi được; bạn có thể gửi lại trong Tài khoản.'
                : 'Đã tạo tài khoản. Hãy kiểm tra email để xác minh.'
              : undefined,
          );
        });
      }}
    >
      <div className="segmented">
        <button
          type="button"
          disabled={busy}
          className={mode === 'register' ? 'active' : ''}
          onClick={() => {
            setMode('register');
            setError('');
            setMessage('');
          }}
        >
          Đăng ký
        </button>
        <button
          type="button"
          disabled={busy}
          className={mode === 'login' ? 'active' : ''}
          onClick={() => {
            setMode('login');
            setError('');
            setMessage('');
          }}
        >
          Đăng nhập
        </button>
      </div>
      {mode === 'forgot' ? (
        <p>Nhập email tài khoản để nhận liên kết đặt lại mật khẩu.</p>
      ) : (
        <p className="muted small">
          Đăng ký giữ các album đang có trong phiên khách. Đăng nhập sẽ mở thư viện của tài khoản
          bạn chọn.
        </p>
      )}
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          required
          maxLength={200}
          value={email}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {mode !== 'forgot' && (
        <label>
          Mật khẩu
          <input
            type="password"
            required
            minLength={10}
            maxLength={200}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholder="Tối thiểu 10 ký tự"
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      <button className="button primary full" disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={17} /> : <Lock size={16} />}{' '}
        {mode === 'register'
          ? 'Tạo tài khoản'
          : mode === 'login'
            ? 'Đăng nhập'
            : 'Gửi link đặt lại mật khẩu'}
      </button>
      {mode === 'login' && (
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={() => {
            setMode('forgot');
            setPassword('');
            setMessage('');
            setError('');
          }}
        >
          Quên mật khẩu?
        </button>
      )}
      {mode === 'register' && (
        <p className="muted small">Sau khi đăng ký, kiểm tra hộp thư để xác minh email của bạn.</p>
      )}
    </form>
  );
}
