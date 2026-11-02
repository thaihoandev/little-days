import { useEffect, useMemo, useState } from 'react';
import { Images, Search, BookOpen, Heart, ArrowUpRight } from 'lucide-react';
import type { Album, Asset } from '../../../packages/domain/index.js';
import type { JournalEntry } from '../../../packages/domain/journal.js';
import { api } from './api.js';
import { PhotoDownload } from './PhotoDownload.js';
import { PhotoLightbox } from './Overlays.js';
export function PhotosLibrary({
  albums,
  onAlbums,
  onOpenAlbum,
}: {
  albums: Album[];
  onAlbums: () => void;
  onOpenAlbum: (album: Album) => void;
}) {
  const [entries, setEntries] = useState<JournalEntry[]>([]),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [source, setSource] = useState('all'),
    [limit, setLimit] = useState(60),
    [preview, setPreview] = useState<{ photos: Asset[]; index: number } | null>(null);
  useEffect(() => {
    let active = true;
    api<JournalEntry[]>('/journal')
      .then((rows) => {
        if (active) setEntries(rows);
      })
      .catch((e) => {
        if (active && e.status !== 404) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const items = useMemo(() => {
    const rows: { asset: Asset; context: string; kind: string; date: string; album?: Album }[] = [];
    for (const album of albums)
      for (const asset of album.assets)
        rows.push({ asset, context: album.title, kind: 'album', date: album.updatedAt, album });
    for (const entry of entries)
      for (const asset of entry.assets)
        rows.push({ asset, context: entry.title, kind: 'milestone', date: entry.date });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [albums, entries]);
  const filtered = items.filter(
    (row) =>
      (source === 'all' || row.kind === source) &&
      (!query ||
        (row.context + ' ' + row.date)
          .toLocaleLowerCase('vi')
          .includes(query.toLocaleLowerCase('vi'))),
  );
  useEffect(() => {
    setLimit(60);
    setPreview(null);
  }, [query, source]);
  return (
    <section className="memory-library" aria-label="Thư viện ảnh kỉ niệm">
      <header className="library-hero">
        <div>
          <span className="eyebrow">NHỮNG KHUNG HÌNH ĐÃ GIỮ</span>
          <h1>Ảnh đã lưu</h1>
          <p>Mỗi tấm ảnh mang theo một câu chuyện.</p>
        </div>
        <div className="library-stat">
          <Images size={22} />
          <strong>{items.length}</strong>
          <span>khung hình</span>
        </div>
      </header>
      <div className="library-toolbar">
        <label>
          <Search size={16} />
          <input
            aria-label="Tìm ảnh theo kỉ niệm"
            placeholder="Tìm theo album, dấu mốc…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Lọc nguồn ảnh"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="all">Tất cả kỉ niệm</option>
          <option value="album">Trong album</option>
          <option value="milestone">Trong dấu mốc</option>
        </select>
        <span>{filtered.length} ảnh</span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="memory-gallery">
        {filtered.slice(0, limit).map((row, i) => (
          <article
            className={
              'memory-photo-tile ' +
              ((row.asset.height || 0) > (row.asset.width || 0) ? 'portrait' : 'landscape')
            }
            key={row.kind + ':' + row.asset.id}
          >
            <button
              className="memory-photo-open"
              aria-label={'Xem ảnh trong ' + row.context + ' số ' + (i + 1)}
              onClick={() => setPreview({ photos: filtered.map((item) => item.asset), index: i })}
            >
              <img
                src={row.asset.url}
                alt={'Kỉ niệm trong ' + row.context}
                loading="lazy"
                decoding="async"
              />
              <span className="photo-open-hint">Xem khoảnh khắc</span>
            </button>
            <div className="memory-photo-caption">
              <div>
                <small>
                  {row.kind === 'album' ? <BookOpen size={11} /> : <Heart size={11} />}
                  {row.kind === 'album' ? 'TRANG SỔ' : 'DẤU MỐC'}
                </small>
                <h3>{row.context}</h3>
              </div>
              <div className="memory-photo-tools">
                <PhotoDownload url={row.asset.url} id={row.asset.id} />
                {row.album && (
                  <button
                    className="icon-button"
                    aria-label={'Mở album ' + row.context}
                    title="Mở album"
                    onClick={() => onOpenAlbum(row.album!)}
                  >
                    <ArrowUpRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="library-empty">
          <Images size={36} />
          <h2>
            {items.length ? 'Chưa tìm thấy khoảnh khắc này' : 'Chừa một chỗ cho những ngày đẹp'}
          </h2>
          <p>
            {items.length
              ? 'Thử tên kỉ niệm khác hoặc đổi bộ lọc.'
              : 'Ảnh từ album và dấu mốc sẽ xuất hiện ở đây.'}
          </p>
          {!items.length && (
            <button className="button primary" onClick={onAlbums}>
              Mở album của mình
            </button>
          )}
        </div>
      )}
      {filtered.length > limit && (
        <button className="button quiet" onClick={() => setLimit((n) => n + 60)}>
          Xem thêm ảnh
        </button>
      )}
      {preview && (
        <PhotoLightbox
          {...preview}
          onIndex={(index) => setPreview({ ...preview, index })}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}
