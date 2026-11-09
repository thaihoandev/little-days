import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { Heart, Copy, QrCode } from 'lucide-react';
import type { PublicUser } from './AccountSettings.js';
export function PairingCard({ verified }: { verified: boolean }) {
  const [qr, setQr] = useState(''),
    [link, setLink] = useState(''),
    [expires, setExpires] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!expires) return;
    const timer = setTimeout(
      () => {
        setQr('');
        setLink('');
        setError('Mã đã hết hạn. Tạo mã mới để tiếp tục.');
      },
      Math.max(0, new Date(expires).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expires]);
  return (
    <section className="pairing-card" aria-label="Mã QR kết đôi">
      <QrCode />
      <strong>Một lần quét, cùng một không gian</strong>
      <p>
        Mã có hiệu lực 15 phút và dành cho một người. Người nhận đăng nhập, xác minh email và chủ
        động chấp nhận.
      </p>
      {qr && <img src={qr} alt="Mã QR mở lời mời kết đôi" />}
      {expires && qr && (
        <small>
          Hết hạn lúc{' '}
          {new Date(expires).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </small>
      )}
      <div className="pairing-actions">
        <button
          className="button primary"
          disabled={!verified || busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const value = await api<{ token: string; expiresAt: string }>('/timeline-pair', {
                method: 'POST',
              });
              const url = location.origin + '/#pair=' + value.token;
              setLink(url);
              setExpires(value.expiresAt);
              const QR = await import('qrcode');
              setQr(
                await QR.toDataURL(url, {
                  width: 480,
                  margin: 3,
                  errorCorrectionLevel: 'M',
                  color: { dark: '#38212b', light: '#ffffff' },
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Đang tạo mã…' : qr ? 'Tạo mã mới' : 'Tạo mã QR kết đôi'}
        </button>
        {link && (
          <>
            <button
              className="button quiet"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setError('Chưa sao chép được. Bạn có thể quét mã trực tiếp.');
                }
              }}
            >
              <Copy size={16} />
              {copied ? 'Đã sao chép' : 'Sao chép liên kết'}
            </button>
            <button
              className="button quiet"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api('/timeline-pair', { method: 'DELETE' });
                  setQr('');
                  setLink('');
                  setExpires('');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Thu hồi mã
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
export function PairingAccept({
  token,
  user,
  onLogin,
  onDone,
  onRefresh,
}: {
  token: string;
  user: PublicUser | null;
  onLogin: () => void;
  onDone: () => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [preview, setPreview] = useState<{ displayName: string; own: boolean } | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  useEffect(() => {
    if (user?.emailVerified) return;
    let alive = true,
      pending = false,
      again = false;
    const sync = async () => {
      if (document.visibilityState !== 'visible') return;
      if (pending) {
        again = true;
        return;
      }
      pending = true;
      try {
        do {
          again = false;
          await refresh.current();
        } while (alive && again);
      } finally {
        pending = false;
      }
    };
    const focus = () => {
      void sync().catch(() => {});
    };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      alive = false;
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [user?.emailVerified]);
  useEffect(() => {
    let alive = true;
    void api<{ displayName: string; own: boolean }>('/timeline-pair/preview', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then((v) => {
        if (alive) setPreview(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  return (
    <section className="pairing-accept-page">
      <Heart />
      <span className="eyebrow">LỜI MỜI CÙNG GIỮ LẠI</span>
      <h2>{preview ? preview.displayName + ' mời bạn kết đôi' : 'Đang mở lời mời…'}</h2>
      <p>
        Cùng thêm dấu mốc, ảnh và kế hoạch trong một không gian. Sổ và không gian riêng của bạn vẫn
        riêng tư.
      </p>
      {!user?.emailVerified ? (
        <button className="button primary" onClick={onLogin}>
          Đăng nhập / xác minh email
        </button>
      ) : (
        <button
          className="button primary"
          disabled={!preview || preview.own || busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await api('/timeline-pair/accept', {
                method: 'POST',
                body: JSON.stringify({ token }),
              });
              onDone();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {preview?.own ? 'Đây là mã của bạn' : busy ? 'Đang kết đôi…' : 'Chấp nhận và cùng viết'}
        </button>
      )}
      <button className="button quiet" onClick={onDone}>
        Về Little Days
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
