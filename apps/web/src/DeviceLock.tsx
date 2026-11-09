import { createContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PublicUser } from './AccountSettings.js';
import { Fingerprint, LockKeyhole } from 'lucide-react';
import { api } from './api.js';
import {
  checkPasscode,
  createPasscode,
  enrollDevice,
  readPasscode,
  unlockDevice,
  writePasscode,
  deviceUnlockAvailable,
} from './device-passcode.js';

export const SessionBootstrapContext = createContext<{ session: PublicUser; at: number } | null>(
  null,
);
const lockIdentity = (value: ReturnType<typeof readPasscode>) =>
  JSON.stringify([
    value?.actor,
    value?.salt,
    value?.verifier,
    value?.credential?.id,
    value?.credential?.key,
  ]);
export function DeviceLock({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrap] = useState<{ session: PublicUser; at: number } | null>(null);
  const [actor, setActor] = useState(''),
    [ready, setReady] = useState(false),
    [locked, setLocked] = useState(false),
    [pin, setPin] = useState(''),
    [password, setPassword] = useState(''),
    [reset, setReset] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [hasDevice, setHasDevice] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    activity = useRef(Date.now()),
    current = useRef(''),
    lockedState = useRef(false),
    configIdentity = useRef('');
  const configure = (id: string) => {
    current.current = id;
    setActor(id);
    setPin('');
    setPassword('');
    setError('');
    setReset(false);
    try {
      const config = readPasscode(id);
      configIdentity.current = lockIdentity(config);
      setLocked(!!config);
      setHasDevice(!!config?.credential);
    } catch (e) {
      configIdentity.current = 'invalid';
      setLocked(true);
      setError((e as Error).message);
    }
    setReady(true);
  };
  useEffect(() => {
    let alive = true;
    void api<PublicUser>('/session')
      .then((s) => {
        if (alive) {
          setBootstrap({ session: s, at: Date.now() });
          configure(s.id);
        }
      })
      .catch(() => {
        if (alive) setError('Chưa kết nối được. Thử mở lại ứng dụng.');
      });
    const account = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id !== current.current) {
        setBootstrap(null);
        configure(id);
      }
    };
    const changed = (event: Event) => {
      if (
        event instanceof StorageEvent &&
        event.key !== 'little-days:device-lock:' + current.current
      )
        return;
      if (current.current) {
        try {
          if (lockIdentity(readPasscode(current.current)) === configIdentity.current) return;
        } catch {}
        configure(current.current);
      }
    };
    window.addEventListener('little-days:actor', account);
    window.addEventListener('little-days:passcode', changed);
    window.addEventListener('storage', changed);
    return () => {
      alive = false;
      window.removeEventListener('little-days:actor', account);
      window.removeEventListener('little-days:passcode', changed);
      window.removeEventListener('storage', changed);
    };
  }, []);
  useEffect(() => {
    if (!actor) return;
    const lock = () => {
      if (lockedState.current) return;
      try {
        if (!readPasscode(actor)) return;
      } catch {}
      document.documentElement.dataset.deviceLocked = 'true';
      lockedState.current = true;
      setLocked(true);
      setPin('');
      setPassword('');
    };
    const touch = () => {
      if (!lockedState.current && Date.now() - activity.current >= 120000) lock();
      activity.current = Date.now();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') lock();
    };
    const timer = window.setInterval(() => {
      if (!lockedState.current && Date.now() - activity.current >= 120000) lock();
    }, 10000);
    const pageShow = (e: PageTransitionEvent) => {
      if (e.persisted) lock();
    };
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('keydown', touch);
    window.addEventListener('input', touch);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pageshow', pageShow);
    window.addEventListener('pagehide', lock);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      window.removeEventListener('input', touch);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pageshow', pageShow);
      window.removeEventListener('pagehide', lock);
    };
  }, [actor]);
  useLayoutEffect(() => {
    lockedState.current = locked;
    if (locked) {
      document.documentElement.dataset.deviceLocked = 'true';
      document.querySelectorAll<HTMLMediaElement>('audio,video').forEach((media) => media.pause());
      if (dialog.current && !dialog.current.open) dialog.current.showModal();
    } else {
      delete document.documentElement.dataset.deviceLocked;
      dialog.current?.close();
      activity.current = Date.now();
    }
    return () => {
      delete document.documentElement.dataset.deviceLocked;
    };
  }, [locked]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const id = actor;
    try {
      await fn();
      if (current.current === id) {
        let configured = true;
        try {
          configured = !!readPasscode(id);
        } catch {}
        setLocked(document.visibilityState === 'hidden' && configured);
        setPin('');
        setPassword('');
        setReset(false);
        activity.current = Date.now();
      }
    } catch (e) {
      setError((e as Error).message);
      setPin('');
    } finally {
      setBusy(false);
    }
  };
  if (!ready)
    return (
      <main className="loading-screen">
        <LockKeyhole />
        <p role="status">{error || 'Đang mở Little Days…'}</p>
        {error && (
          <button className="button primary" onClick={() => location.reload()}>
            Thử lại
          </button>
        )}
      </main>
    );
  return (
    <SessionBootstrapContext.Provider value={bootstrap}>
      <div className="device-protected-app" inert={locked} aria-hidden={locked || undefined}>
        {children}
      </div>
      {locked && (
        <dialog
          ref={dialog}
          className="device-lock-dialog"
          aria-label="Mở khóa Little Days"
          onKeyDown={(e) => e.stopPropagation()}
          onCancel={(e) => e.preventDefault()}
        >
          <LockKeyhole size={35} />
          <span className="eyebrow">MỘT GÓC RIÊNG CỦA BẠN</span>
          <h1>Mở lại những ngày nhỏ</h1>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (reset) {
                  await api('/auth/confirm-password', {
                    method: 'POST',
                    body: JSON.stringify({ password, actor }),
                  });
                  writePasscode(actor, null);
                } else await checkPasscode(actor, pin);
              });
            }}
          >
            {reset ? (
              <label>
                Mật khẩu tài khoản
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={200}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </label>
            ) : (
              <label>
                Mã PIN 4 số
                <input
                  aria-label="Mã PIN mở khóa"
                  className="device-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  disabled={busy}
                />
              </label>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? 'Đang xác minh…' : reset ? 'Đặt lại khóa trên thiết bị' : 'Mở khóa'}
            </button>
          </form>
          {!reset && hasDevice && (
            <button
              className="button quiet"
              disabled={busy}
              onClick={() => void run(() => unlockDevice(actor))}
            >
              <Fingerprint size={19} />
              Mở khóa thiết bị
            </button>
          )}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setReset(!reset);
              setError('');
              setPassword('');
              setPin('');
            }}
          >
            {reset ? 'Dùng mã PIN' : 'Quên mã PIN?'}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <small>
            Khóa hiển thị trên thiết bị này. Dữ liệu vẫn được bảo vệ bằng tài khoản Little Days.
          </small>
        </dialog>
      )}
    </SessionBootstrapContext.Provider>
  );
}

export function PasscodeSettings({ actor }: { actor: string }) {
  const [enabled, setEnabled] = useState(() => {
      try {
        return !!readPasscode(actor);
      } catch {
        return true;
      }
    }),
    [pin, setPin] = useState(''),
    [confirm, setConfirm] = useState(''),
    [current, setCurrent] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const changed = () => {
      try {
        setEnabled(!!readPasscode(actor));
      } catch {
        setEnabled(true);
      }
      setPin('');
      setConfirm('');
      setCurrent('');
    };
    window.addEventListener('little-days:passcode', changed);
    return () => window.removeEventListener('little-days:passcode', changed);
  }, [actor]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setPin('');
      setConfirm('');
      setCurrent('');
      setEnabled(!!readPasscode(actor));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="portable-card passcode-settings">
      <h3>
        <LockKeyhole size={19} />
        Khóa ứng dụng trên thiết bị
      </h3>
      <p>
        PIN 4 số · khóa khi chuyển app hoặc sau 2 phút không hoạt động. Mã khóa chỉ dùng trên trình
        duyệt này.
      </p>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (enabled) {
              await checkPasscode(actor, current);
              writePasscode(actor, null);
            } else {
              if (pin !== confirm) throw Error('Hai mã PIN chưa khớp.');
              writePasscode(actor, await createPasscode(actor, pin));
            }
          });
        }}
      >
        {enabled ? (
          <label>
            PIN hiện tại
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              required
              autoComplete="off"
              value={current}
              onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))}
            />
          </label>
        ) : (
          <>
            <label>
              PIN mới
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                required
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <label>
              Nhập lại PIN
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                required
                autoComplete="off"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              />
            </label>
          </>
        )}
        <button className="button quiet" disabled={busy}>
          {enabled ? 'Tắt khóa PIN' : 'Bật khóa PIN'}
        </button>
      </form>
      {enabled && deviceUnlockAvailable() && (
        <button
          className="button quiet"
          disabled={busy}
          onClick={() => void run(() => enrollDevice(actor))}
        >
          <Fingerprint size={18} />
          Thêm mở khóa thiết bị
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
