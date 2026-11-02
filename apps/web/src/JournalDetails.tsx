import { useEffect, useRef, useState } from 'react';
import { X, Send, Trash2, RotateCcw, History, MessageCircle } from 'lucide-react';
import type {
  JournalEntry,
  JournalComment,
  JournalVersion,
} from '../../../packages/domain/journal.js';
import { api } from './api.js';
import { ConfirmDialog, PhotoLightbox, useBodyScrollLock } from './Overlays.js';
import { UserAvatar } from './UserAvatar.js';
const reactions: Record<string, string> = { heart: '❤️', smile: '😊', hug: '🫶', celebrate: '🎉' };
const actions: Record<string, string> = {
  create: 'Tạo dấu mốc',
  edit: 'Sửa nội dung',
  photo: 'Thêm ảnh',
  'remove-photo': 'Gỡ ảnh',
  trash: 'Chuyển vào thùng rác',
  restore: 'Lấy lại từ thùng rác',
  'restore-version': 'Khôi phục phiên bản',
  previous: 'Nội dung trước cập nhật',
};
function useModal(onClose: () => void, busy: boolean) {
  useBodyScrollLock();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return {
    ref,
    onCancel: (e: React.SyntheticEvent) => {
      e.preventDefault();
      if (!busy) onClose();
    },
  };
}
type SocialState = {
  comments: JournalComment[];
  reactions: { emoji: string; count: number; mine: boolean }[];
};
export function JournalDetails({
  entry,
  initialTab,
  onClose,
  onRestored,
}: {
  entry: JournalEntry;
  initialTab: 'social' | 'history';
  onClose: () => void;
  onRestored: (entry: JournalEntry) => void;
}) {
  const [tab, setTab] = useState(initialTab),
    [social, setSocial] = useState<SocialState>({ comments: [], reactions: [] }),
    [versions, setVersions] = useState<JournalVersion[]>([]),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [preview, setPreview] = useState<JournalVersion | null>(null),
    [photo, setPhoto] = useState<{ photos: JournalEntry['assets']; index: number } | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const modal = useModal(onClose, busy);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    const task =
      tab === 'social'
        ? api<SocialState>('/journal/' + entry.id + '/social').then((data) => {
            if (live) setSocial(data);
          })
        : api<JournalVersion[]>('/journal/' + entry.id + '/history').then((data) => {
            if (live) setVersions(data);
          });
    task
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [entry.id, tab]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => setSocial(await api<SocialState>('/journal/' + entry.id + '/social'));
  return (
    <dialog {...modal} className="journal-community-dialog" aria-label="Câu chuyện dấu mốc">
      <header>
        <div>
          <span className="eyebrow">GIỮ LẠI CÙNG NHAU</span>
          <h2>{entry.title}</h2>
          <p>{entry.date}</p>
        </div>
        <button
          className="icon-button"
          aria-label="Đóng câu chuyện"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      <div className="community-tabs" role="group" aria-label="Chọn nội dung dấu mốc">
        <button aria-pressed={tab === 'social'} disabled={busy} onClick={() => setTab('social')}>
          <MessageCircle size={16} />
          Lời nhắn & cảm xúc
        </button>
        <button aria-pressed={tab === 'history'} disabled={busy} onClick={() => setTab('history')}>
          <History size={16} />
          Lịch sử
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Đang mở câu chuyện…</p>
      ) : tab === 'social' ? (
        <>
          <div className="memory-reactions" aria-label="Cảm xúc dấu mốc">
            {social.reactions.map((r) => (
              <button
                key={r.emoji}
                aria-label={'Cảm xúc ' + r.emoji}
                aria-pressed={r.mine}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api('/journal/' + entry.id + '/reaction', {
                      method: 'PUT',
                      body: JSON.stringify({ emoji: r.mine ? null : r.emoji }),
                    });
                    await refresh();
                  })
                }
              >
                {reactions[r.emoji]} <span>{r.count}</span>
              </button>
            ))}
          </div>
          <div className="memory-comments">
            {social.comments.length ? (
              social.comments.map((c) => (
                <article key={c.id}>
                  <UserAvatar name={c.displayName} url={c.avatarUrl} />
                  <div>
                    <header>
                      <strong>{c.displayName}</strong>
                      <time>{new Date(c.createdAt).toLocaleString('vi-VN')}</time>
                    </header>
                    <p>{c.text}</p>
                  </div>
                  {c.canDelete && (
                    <button
                      className="icon-button"
                      title="Xóa bình luận"
                      aria-label={'Xóa bình luận của ' + c.displayName}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api('/journal/' + entry.id + '/comments/' + c.id, {
                            method: 'DELETE',
                          });
                          await refresh();
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </article>
              ))
            ) : (
              <p className="muted">Để lại một lời nhắn cho kỉ niệm này nhé.</p>
            )}
          </div>
          <form
            className="memory-comment-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api('/journal/' + entry.id + '/comments', {
                  method: 'POST',
                  body: JSON.stringify({ text, requestId: requestId.current }),
                });
                setText('');
                requestId.current = crypto.randomUUID();
                await refresh();
              });
            }}
          >
            <label>
              Lời nhắn của bạn
              <textarea
                aria-label="Viết bình luận"
                maxLength={1000}
                required
                disabled={busy}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  requestId.current = crypto.randomUUID();
                }}
                placeholder="Mình vẫn nhớ hôm ấy…"
              />
            </label>
            <button className="button primary" disabled={busy || !text.trim()}>
              <Send size={16} />
              Gửi lời nhắn
            </button>
          </form>
        </>
      ) : (
        <div className="journal-version-list">
          <p className="muted">
            Giữ tối đa 20 phiên bản, gồm nội dung và ảnh. Khôi phục tạo phiên bản mới.
          </p>
          {versions.map((v) => (
            <article key={v.id}>
              <div>
                <strong>
                  {actions[v.action] || 'Cập nhật'} · #{v.snapshot.revision}
                </strong>
                <p>
                  {v.actorName} · {new Date(v.createdAt).toLocaleString('vi-VN')}
                </p>
                <span>
                  {v.snapshot.title} · {v.snapshot.assets.length} ảnh
                </span>
              </div>
              <button className="button quiet" disabled={busy} onClick={() => setPreview(v)}>
                Xem phiên bản #{v.snapshot.revision}
              </button>
            </article>
          ))}
          {preview && (
            <section className="version-preview" aria-label="Xem trước phiên bản dấu mốc">
              <h3>{preview.snapshot.title}</h3>
              <p>{preview.snapshot.note}</p>
              <div className="version-photos">
                {preview.snapshot.assets.map((a, i) => (
                  <button
                    key={a.id}
                    aria-label={'Xem ảnh phiên bản ' + (i + 1)}
                    onClick={() => setPhoto({ photos: preview.snapshot.assets, index: i })}
                  >
                    <img src={a.url} alt="Ảnh kỉ niệm" />
                  </button>
                ))}
              </div>
              <button
                className="button primary"
                disabled={busy || preview.snapshot.revision === entry.revision}
                onClick={() =>
                  void run(async () => {
                    const next = await api<JournalEntry>(
                      '/journal/' + entry.id + '/history/' + preview.id + '/restore',
                      {
                        method: 'POST',
                        body: JSON.stringify({ expectedRevision: entry.revision }),
                      },
                    );
                    onRestored(next);
                  })
                }
              >
                <RotateCcw size={16} />
                Khôi phục phiên bản #{preview.snapshot.revision}
              </button>
            </section>
          )}
        </div>
      )}
      {photo && (
        <PhotoLightbox
          {...photo}
          onIndex={(index) => setPhoto({ ...photo, index })}
          onClose={() => setPhoto(null)}
        />
      )}
    </dialog>
  );
}
export function JournalTrash({
  onClose,
  onRestored,
}: {
  onClose: () => void;
  onRestored: (entry: JournalEntry) => void;
}) {
  const [entries, setEntries] = useState<JournalEntry[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [purging, setPurging] = useState<JournalEntry | null>(null);
  const modal = useModal(onClose, busy);
  useEffect(() => {
    let live = true;
    api<JournalEntry[]>('/journal-trash')
      .then((data) => {
        if (live) setEntries(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  const run = async (entry: JournalEntry, purge = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (purge)
        await api('/journal-trash/' + entry.id, {
          method: 'DELETE',
          body: JSON.stringify({ expectedRevision: entry.revision }),
        });
      else
        onRestored(
          await api<JournalEntry>('/journal/' + entry.id + '/restore', {
            method: 'POST',
            body: JSON.stringify({ expectedRevision: entry.revision }),
          }),
        );
      setEntries((rows) => rows.filter((e) => e.id !== entry.id));
      setPurging(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog {...modal} className="journal-community-dialog" aria-label="Thùng rác dấu mốc">
      <header>
        <div>
          <span className="eyebrow">NHỮNG ĐIỀU CÓ THỂ LẤY LẠI</span>
          <h2>Thùng rác dấu mốc</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Đóng thùng rác"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      <p className="muted">
        Ảnh và nội dung vẫn được giữ, tính vào dung lượng. Chỉ chủ dòng thời gian được xóa vĩnh
        viễn.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Đang mở thùng rác…</p>
      ) : entries.length ? (
        <div className="journal-trash-list">
          {entries.map((e) => (
            <article key={e.id}>
              {e.assets[0] && <img src={e.assets[0].url} alt="Ảnh dấu mốc" />}
              <div>
                <h3>{e.title}</h3>
                <p>
                  {e.date}
                  {e.timelineLabel ? ' · Cùng ' + e.timelineLabel : ''}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label={'Lấy lại dấu mốc ' + e.title}
                title="Lấy lại dấu mốc"
                disabled={busy}
                onClick={() => void run(e)}
              >
                <RotateCcw size={17} />
              </button>
              {!e.timelineId && (
                <button
                  className="icon-button"
                  aria-label={'Xóa vĩnh viễn ' + e.title}
                  title="Xóa vĩnh viễn"
                  disabled={busy}
                  onClick={() => setPurging(e)}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="trash-empty">Không có dấu mốc nào trong thùng rác.</p>
      )}
      {purging && (
        <ConfirmDialog
          title="Xóa vĩnh viễn dấu mốc?"
          busy={busy}
          description={
            'Xóa “' +
            purging.title +
            '”, ảnh, lịch sử và bình luận. Không thể lấy lại sau thao tác này.'
          }
          confirmLabel={busy ? 'Đang xóa…' : 'Xóa vĩnh viễn'}
          onClose={() => {
            if (!busy) setPurging(null);
          }}
          onConfirm={() => void run(purging, true)}
        />
      )}
    </dialog>
  );
}
