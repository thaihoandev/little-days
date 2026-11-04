import { useEffect, useState } from 'react';
import { Music2, Upload, LoaderCircle } from 'lucide-react';
import {
  type Album,
  type AlbumContent,
  type AlbumPresentation,
  type AudioAsset,
  defaultPresentation,
} from '../../../packages/domain/index.js';
import { musicCatalog } from '../../../packages/domain/music.js';
import { api } from './api.js';

export function PresentationSettings({
  album,
  onChange,
  designExperienceEnabled = false,
}: {
  album: Album;
  designExperienceEnabled?: boolean;
  onChange: (patch: Partial<AlbumContent>) => void;
}) {
  const p = album.presentation || defaultPresentation;
  const [tracks, setTracks] = useState<AudioAsset[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const update = (patch: Partial<AlbumPresentation>) =>
    onChange({ presentation: { ...p, ...patch } });
  useEffect(() => {
    const controller = new AbortController();
    api<AudioAsset[]>(`/albums/${album.id}/audio`, { signal: controller.signal })
      .then(setTracks)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [album.id]);
  return (
    <section className="presentation-settings" aria-label="Thiết kế bản chia sẻ">
      <span className="eyebrow">KHI NGƯỜI THƯƠNG MỞ LINK</span>
      <h4>Không chỉ là một trang giấy</h4>
      <label>
        Loại thiết kế
        <select
          aria-label="Loại thiết kế của album"
          value={album.documentKind || 'album'}
          onChange={(e) => onChange({ documentKind: e.target.value as 'album' | 'invitation' })}
        >
          <option value="album">Sổ kỉ niệm</option>
          <option value="invitation">Thiệp mời</option>
        </select>
      </label>
      <p className="small muted">
        Đổi loại giữ nguyên mọi trang. Chọn mẫu thiệp ở Trang sổ hoặc khi tạo mới; sửa ảnh và lời
        mời ngay trên trang.
      </p>
      {designExperienceEnabled && (
        <label>
          Cách đọc
          <select
            aria-label="Cách đọc bản chia sẻ"
            value={p.readingMode || 'book'}
            onChange={(e) => update({ readingMode: e.target.value as 'book' | 'scroll' })}
          >
            <option value="book">Lật từng trang</option>
            <option value="scroll">Cuộn dọc liên tục</option>
          </select>
          <small>Đổi cách đọc giữ nguyên nội dung. Mỗi trang là một phần của thiệp dài.</small>
        </label>
      )}
      {p.readingMode !== 'scroll' && (
        <>
          <label>
            Gáy sổ
            <select
              aria-label="Gáy sổ khi chia sẻ"
              value={p.binding}
              onChange={(e) => update({ binding: e.target.value as AlbumPresentation['binding'] })}
            >
              <option value="stitched">Sổ khâu chỉ</option>
              <option value="spiral">Sổ gáy xoắn</option>
              <option value="linen">Sổ bìa vải</option>
            </select>
          </label>
          <label>
            Chuyển trang
            <select
              aria-label="Chuyển trang khi chia sẻ"
              value={p.transition}
              onChange={(e) =>
                update({ transition: e.target.value as AlbumPresentation['transition'] })
              }
            >
              <option value="turn">Lật trang sổ</option>
              <option value="slide">Trượt giấy</option>
              <option value="soft">Mờ nhẹ</option>
            </select>
          </label>
        </>
      )}
      <label>
        Không khí
        <select
          aria-label="Hiệu ứng bản chia sẻ"
          value={p.ambience}
          onChange={(e) => update({ ambience: e.target.value as AlbumPresentation['ambience'] })}
        >
          <option value="none">Chỉ trang giấy</option>
          <option value="petals">Cánh hoa nhẹ rơi</option>
          <option value="sparkles">Ánh sao lấp lánh</option>
          <option value="hearts">Những trái tim nhỏ</option>
        </select>
      </label>
      <label>
        <span>
          <Music2 size={15} /> Nhạc khi xem
        </span>
        <select
          aria-label="Nhạc bản chia sẻ"
          value={p.musicId === 'custom' ? p.audioId : p.musicId}
          onChange={(e) => {
            const value = e.target.value,
              track = tracks.find((t) => t.id === value);
            update(
              track
                ? { musicId: 'custom', audioId: track.id }
                : { musicId: value as AlbumPresentation['musicId'], audioId: undefined },
            );
          }}
        >
          <option value="none">Không nhạc</option>
          {musicCatalog.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          {p.musicId === 'custom' && !tracks.some((t) => t.id === p.audioId) && (
            <option value={p.audioId}>Nhạc đã chọn</option>
          )}
          {tracks.map((t, i) => (
            <option key={t.id} value={t.id}>
              Nhạc của mình {i + 1} · {Math.round(t.duration)} giây
            </option>
          ))}
        </select>
      </label>
      {loading && <small role="status">Đang tải thư viện nhạc…</small>}
      <label className="music-upload button quiet">
        {busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}{' '}
        {busy ? 'Đang xử lý nhạc…' : 'Thêm nhạc của mình'}
        <input
          aria-label="Tải nhạc bản chia sẻ"
          type="file"
          accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
          disabled={busy || loading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > 20 * 1024 * 1024) {
              setError('Nhạc tối đa 20 MB.');
              return;
            }
            setBusy(true);
            setError('');
            const body = new FormData();
            body.append('file', file);
            try {
              const track = await api<AudioAsset>(`/albums/${album.id}/audio`, {
                method: 'POST',
                body,
              });
              setTracks((old) => [...old, track]);
              // Selection stays explicit: a pending upload never overwrites intervening edits.
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <small>
        Chọn bản vừa tải trong danh sách. Chỉ dùng nhạc bạn có quyền chia sẻ. Người xem bấm bật nhạc
        để nghe.
      </small>
      {p.musicId !== 'none' && (
        <label>
          Âm lượng · {Math.round(p.volume * 100)}%
          <input
            aria-label="Âm lượng bản chia sẻ"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={p.volume}
            onChange={(e) => update({ volume: Number(e.target.value) })}
          />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
