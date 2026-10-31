import { useState, type FormEvent } from 'react';
import { api } from './api.js';
import { uploadImage } from './image-upload.js';
import { UserAvatar } from './UserAvatar.js';
export type ProfileView = { displayName: string; avatarUrl?: string; profileRevision: number };
export function ProfileSettings({
  value,
  onChange,
}: {
  value: ProfileView;
  onChange: (value: ProfileView) => void;
}) {
  const [name, setName] = useState(value.displayName),
    [revision, setRevision] = useState(value.profileRevision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const accept = (next: ProfileView) => {
    setRevision(next.profileRevision);
    onChange(next);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      accept(
        await api<ProfileView>('/profile', {
          method: 'PATCH',
          body: JSON.stringify({ displayName: name, expectedRevision: revision }),
        }),
      );
      setMessage('Đã lưu tên hiển thị.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="profile-settings" aria-label="Hồ sơ cá nhân">
      <div className="profile-identity">
        <UserAvatar name={value.displayName} url={value.avatarUrl} />
        <div>
          <h3>{value.displayName}</h3>
          <label className="button quiet profile-avatar-upload">
            Đổi ảnh đại diện
            <input
              type="file"
              aria-label="Đổi ảnh đại diện"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                setError('');
                setMessage('Đang chuẩn bị ảnh đại diện…');
                try {
                  accept(
                    await uploadImage<ProfileView>(
                      '/profile/avatar',
                      file,
                      (p) =>
                        setMessage(
                          p.phase === 'prepare'
                            ? 'Đang tối ưu ảnh…'
                            : p.phase === 'save'
                              ? 'Đang lưu ảnh đại diện…'
                              : `Đang tải ảnh ${Math.round((p.loaded / Math.max(1, p.total)) * 100)}%`,
                        ),
                      { expectedRevision: String(revision) },
                      512,
                    ),
                  );
                  setMessage('Đã cập nhật ảnh đại diện.');
                } catch (error) {
                  setMessage('');
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
      </div>
      <form onSubmit={(e) => void save(e)}>
        <label>
          Tên hiển thị
          <input
            aria-label="Tên hiển thị"
            value={name}
            maxLength={60}
            required
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="button primary" disabled={busy}>
          Lưu hồ sơ
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="small muted">
          {message}
        </p>
      )}
    </section>
  );
}
