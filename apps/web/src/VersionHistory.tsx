import { useEffect, useState, useRef } from 'react';
import type { Album, AlbumVersions } from '../../../packages/domain/index.js';
import { api } from './api.js';
import { PagePreview } from './Viewer.js';

export default function VersionHistory({
  album,
  onCheckpoint,
  onRestore,
  onClose,
}: {
  album: Album;
  onCheckpoint: (label: string) => Promise<Album>;
  onRestore: (revision: number) => Promise<Album>;
  onClose: () => void;
}) {
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    host.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => previous?.focus();
  }, []);
  const [versions, setVersions] = useState<AlbumVersions>();
  const [preview, setPreview] = useState<Album>();
  const [previewPage, setPreviewPage] = useState(0);
  const [selected, setSelected] = useState<number>();
  const [confirm, setConfirm] = useState(false);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = () => api<AlbumVersions>('/albums/' + album.id + '/versions').then(setVersions);
  useEffect(() => {
    let active = true;
    api<AlbumVersions>('/albums/' + album.id + '/versions')
      .then((data) => {
        if (active) setVersions(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [album.id]);
  useEffect(() => {
    setConfirm(false);
    setPreview(undefined);
    setPreviewPage(0);
    if (selected === undefined) return;
    let active = true;
    setLoading(true);
    api<Album>('/albums/' + album.id + '/versions/' + selected)
      .then((snapshot) => {
        if (active) setPreview(snapshot);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [album.id, selected]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        ref={host}
        className="history-modal"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.preventDefault();
            onClose();
          }
          if (event.key === 'Tab') {
            const nodes = Array.from(
              host.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]',
              ) || [],
            );
            if (event.shiftKey && document.activeElement === nodes[0]) {
              event.preventDefault();
              nodes.at(-1)?.focus();
            } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
              event.preventDefault();
              nodes[0]?.focus();
            }
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-heading"
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">NHỮNG LẦN LƯU GIỮ</span>
            <h2 id="history-heading">Lịch sử phiên bản</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Đóng lịch sử"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p className="muted small">
          Hiện tại: bản {album.revision}. Giữ tối đa {versions?.limit ?? 50} phiên bản gần nhất, gồm
          cả mốc có tên. Khôi phục tạo một bản mới và giữ bản trước đó trong lịch sử.
        </p>
        <form
          className="history-checkpoint"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await onCheckpoint(label);
              setLabel('');
              await load();
            });
          }}
        >
          <label>
            Tên mốc lưu
            <input
              maxLength={80}
              required
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              disabled={busy}
            />
          </label>
          <button className="button quiet" disabled={busy || !label.trim()}>
            Lưu mốc hiện tại
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="history-body">
          <div className="version-list" aria-label="Các phiên bản">
            {!versions && <p>Đang tải lịch sử…</p>}
            {versions?.versions.length === 0 && (
              <p className="muted">
                Chưa có phiên bản cũ. Bạn có thể tạo mốc lưu ngay hoặc quay lại sau lần chỉnh sửa
                tiếp theo.
              </p>
            )}
            {versions?.versions.map((version) => (
              <button
                className={'version-item ' + (selected === version.revision ? 'selected' : '')}
                key={version.revision}
                aria-pressed={selected === version.revision}
                disabled={busy}
                onClick={() => {
                  setError('');
                  setSelected(version.revision);
                }}
              >
                <strong>
                  Bản {version.revision} · {version.label || version.title}
                </strong>
                <span>
                  {version.pageCount} trang · {new Date(version.capturedAt).toLocaleString('vi-VN')}
                </span>
                {version.revision === album.revision && <span>Trùng bản hiện tại</span>}
              </button>
            ))}
          </div>
          <div className="version-preview">
            {loading ? (
              <p>Đang mở phiên bản…</p>
            ) : preview ? (
              <>
                <h3>{preview.title}</h3>
                <PagePreview album={preview} index={previewPage} width={230} />
                <label>
                  Trang xem trước
                  <select
                    value={previewPage}
                    onChange={(event) => setPreviewPage(Number(event.target.value))}
                  >
                    {preview.pages.map((p, index) => (
                      <option key={p.id} value={index}>
                        {index + 1}. {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted small">
                  Bản {preview.revision} · {preview.names.join(' & ')} · {preview.memories.length}{' '}
                  kỉ niệm. Bố cục, chữ và các kỉ niệm sẽ trở về bản này; thư viện ảnh hiện tại được
                  giữ lại.
                </p>
                {!confirm ? (
                  <button
                    className="button primary"
                    disabled={busy || selected === album.revision}
                    onClick={() => setConfirm(true)}
                  >
                    Khôi phục bản {selected}
                  </button>
                ) : (
                  <div className="restore-confirm" role="alert">
                    <p>
                      Khôi phục bản {selected}? Nội dung hiện tại sẽ được giữ lại trong lịch sử để
                      bạn có thể quay lại.
                    </p>
                    <div className="row">
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await onRestore(selected!);
                            onClose();
                          })
                        }
                      >
                        Xác nhận khôi phục
                      </button>
                      <button
                        className="button quiet"
                        disabled={busy}
                        onClick={() => setConfirm(false)}
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="muted">Chọn một phiên bản để xem trước trước khi khôi phục.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
