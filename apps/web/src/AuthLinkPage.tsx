import { useEffect, useState } from 'react';
import { api } from './api.js';
import { LegalLinks } from './LegalLinks.js';

import type { AuthLink } from './auth-link.js';

export default function AuthLinkPage({
  link,
  onContinue,
}: {
  link: AuthLink;
  onContinue: () => void;
}) {
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    history.replaceState(null, '', location.pathname + location.search);
  }, []);
  const verify = link.purpose === 'verify-email';
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="wordmark">
          little days<span>♡</span>
        </span>
        <h1>{verify ? 'Xác minh email' : 'Đặt lại mật khẩu'}</h1>
        {done ? (
          <>
            <p className="success-message" role="status">
              {verify
                ? 'Email đã được xác minh.'
                : 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.'}
            </p>
            <button className="button primary" onClick={onContinue}>
              Tiếp tục tới tài khoản
            </button>
          </>
        ) : (
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              setError('');
              setBusy(true);
              void (async () => {
                try {
                  if (!/^[a-f0-9]{64}$/.test(link.token))
                    throw new Error('Liên kết không hợp lệ. Hãy yêu cầu liên kết mới.');
                  if (!verify && password !== confirmation)
                    throw new Error('Hai mật khẩu mới chưa khớp.');
                  await api(verify ? '/auth/verify-email' : '/auth/reset-password', {
                    method: 'POST',
                    body: JSON.stringify({ token: link.token, ...(!verify ? { password } : {}) }),
                  });
                  setPassword('');
                  setConfirmation('');
                  setDone(true);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <p className="muted">
              {verify
                ? 'Xác nhận email này để hoàn tất xác minh tài khoản của bạn.'
                : 'Chọn mật khẩu mới có ít nhất 10 ký tự. Các phiên đăng nhập cũ sẽ được đăng xuất.'}
            </p>
            {!verify && (
              <>
                <label>
                  Mật khẩu mới
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={200}
                    disabled={busy}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label>
                  Nhập lại mật khẩu mới
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={200}
                    disabled={busy}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? 'Đang xử lý…' : verify ? 'Xác minh email' : 'Lưu mật khẩu mới'}
            </button>
            <button className="text-button" type="button" disabled={busy} onClick={onContinue}>
              Về tài khoản để yêu cầu liên kết mới
            </button>
          </form>
        )}
        <div className="auth-legal">
          <LegalLinks />
        </div>
      </section>
    </main>
  );
}
