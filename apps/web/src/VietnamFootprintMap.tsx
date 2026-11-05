import { provincePath } from '../../../packages/domain/vietnam-geometry.js';
import { useId, useMemo, useState, useRef, useEffect } from 'react';
import {
  Check,
  ChevronRight,
  Download,
  Heart,
  MapPin,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  VIETNAM_PROVINCES,
  PASTEL_PALETTE,
  regionNames,
  type ProvinceInfo,
  type VietnamRegion,
  groupFootprintsByProvince,
} from '../../../packages/domain/vietnam-provinces.js';
import type { JournalEntry } from '../../../packages/domain/journal.js';
import { thumbnailUrl } from './thumbnail.js';

export function VietnamFootprintMap({
  entries,
  onOpenEntry,
  onAddAtProvince,
}: {
  entries: JournalEntry[];
  onOpenEntry?: (entry: JournalEntry) => void;
  onAddAtProvince?: (province: ProvinceInfo) => void;
}) {
  const [selectedRegion, setSelectedRegion] = useState<VietnamRegion | 'all'>('all');
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const svgId = useId();
  const inspector = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (inspector.current) inspector.current.scrollTop = 0;
  }, [selectedProvinceId]);

  // Map provinceId -> array of journal entries
  const footprints = useMemo(() => groupFootprintsByProvince(entries), [entries]);

  const visitedCount = useMemo(() => {
    let count = 0;
    for (const p of VIETNAM_PROVINCES) {
      if ((footprints.get(p.id) || []).length > 0) count++;
    }
    return count;
  }, [footprints]);

  const percentage = Math.round((visitedCount / VIETNAM_PROVINCES.length) * 100);

  const selectedProvince = useMemo(
    () => VIETNAM_PROVINCES.find((p) => p.id === selectedProvinceId) || null,
    [selectedProvinceId],
  );

  const selectedEntries = useMemo(
    () => (selectedProvince ? footprints.get(selectedProvince.id) || [] : []),
    [selectedProvince, footprints],
  );

  // Filtered list of provinces for the list/cards view
  const filteredProvinces = useMemo(() => {
    return VIETNAM_PROVINCES.filter((p) => {
      if (selectedRegion !== 'all' && p.region !== selectedRegion) return false;
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(query);
        const matchAlias = p.aliases.some((a) => a.toLowerCase().includes(query));
        if (!matchName && !matchAlias) return false;
      }
      return true;
    });
  }, [selectedRegion, search]);

  // Export the SVG map as a downloadable PNG
  const handleExportMap = async () => {
    try {
      setExporting(true);
      const svgElement = document.getElementById(svgId);
      if (!svgElement) return;

      const snapshot = svgElement.cloneNode(true) as SVGSVGElement;
      snapshot.setAttribute('width', '420');
      snapshot.setAttribute('height', '930');
      const xml = new XMLSerializer().serializeToString(snapshot);
      const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onerror = () => {
        URL.revokeObjectURL(blobURL);
        setExporting(false);
      };
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 1100;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(blobURL);
          setExporting(false);
          return;
        }

        // Draw background
        ctx.fillStyle = '#f9f6f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header Title
        ctx.fillStyle = '#403b32';
        ctx.font = 'bold 28px serif';
        ctx.textAlign = 'center';
        ctx.fillText('Bản đồ dấu chân đôi mình', 400, 50);

        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#6e695d';
        ctx.fillText(`Đã đi qua ${visitedCount}/34 tỉnh thành Việt Nam (${percentage}%)`, 400, 80);

        // Draw Map SVG
        const scale = Math.min(700 / image.width, 920 / image.height);
        ctx.drawImage(
          image,
          (800 - image.width * scale) / 2,
          100,
          image.width * scale,
          image.height * scale,
        );

        // Watermark Footer
        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#9c9586';
        ctx.fillText('Little Days ♡ Giữ lại một chút thương', 400, 1060);
        ctx.font = '10px sans-serif';
        ctx.fillText('geoBoundaries • nhóm tỉnh 2025 • ranh giới và đảo minh họa', 400, 1083);

        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `dau-chan-viet-nam-${visitedCount}-tinh.png`;
        link.href = pngUrl;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobURL);
        setExporting(false);
      };
      image.src = blobURL;
    } catch {
      setExporting(false);
    }
  };

  return (
    <div className="vietnam-footprint-container">
      {/* Top Banner Stats */}
      <section className="footprint-stats-card">
        <div className="footprint-stats-header">
          <div>
            <span className="eyebrow">DẤU CHÂN VIỆT NAM</span>
            <h3>
              Đã cùng nhau đi qua <strong>{visitedCount}</strong> / 34 tỉnh thành
            </h3>
            <p>
              {visitedCount === 0
                ? 'Hãy gắn địa điểm cho các mốc kỉ niệm để bắt đầu phủ kín bản đồ nhé ♡'
                : `Hai bạn đã cùng nhau đánh dấu ${percentage}% dải đất hình chữ S!`}
            </p>
          </div>
          <button
            type="button"
            className="button quiet tiny-action export-map-btn"
            disabled={exporting}
            onClick={() => void handleExportMap()}
            title="Tải ảnh bản đồ dấu chân để chia sẻ"
          >
            <Download size={15} />
            {exporting ? 'Đang xuất…' : 'Lưu ảnh bản đồ'}
          </button>
        </div>

        {/* Pastel Progress Bar */}
        <div
          className="footprint-progress-bar"
          role="progressbar"
          aria-valuenow={visitedCount}
          aria-valuemin={0}
          aria-valuemax={VIETNAM_PROVINCES.length}
        >
          <div className="footprint-progress-fill" style={{ width: `${percentage}%` }} />
        </div>
      </section>

      {/* Main Grid: Interactive Map + Province Browser */}
      <div className="footprint-layout">
        {/* Left Column: S-shaped SVG Map */}
        <div className="footprint-map-card">
          <div className="footprint-map-meta">
            <span>34 tỉnh, thành phố</span>
            <small>Chạm vào một tỉnh để xem kỉ niệm</small>
          </div>

          <div className="footprint-svg-wrapper">
            <svg
              id={svgId}
              viewBox="0 0 420 930"
              className="vietnam-svg-map"
              xmlns="http://www.w3.org/2000/svg"
            >
              {VIETNAM_PROVINCES.map((prov, index) => (
                <path
                  key={prov.id}
                  d={provincePath(prov.id)}
                  fillRule="evenodd"
                  fill={
                    footprints.has(prov.id)
                      ? PASTEL_PALETTE[index % PASTEL_PALETTE.length]
                      : '#e6decb'
                  }
                  stroke={selectedProvinceId === prov.id ? '#465a39' : '#fffdf7'}
                  strokeWidth={selectedProvinceId === prov.id ? 2 : 0.7}
                  role="button"
                  tabIndex={0}
                  aria-label={prov.name}
                  aria-pressed={selectedProvinceId === prov.id}
                  onClick={() => setSelectedProvinceId(prov.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedProvinceId(prov.id);
                    }
                  }}
                >
                  <title>{prov.name}</title>
                </path>
              ))}
              {selectedProvinceId && (
                <path
                  d={provincePath(selectedProvinceId)}
                  fill="none"
                  stroke="#415a35"
                  strokeWidth="2.5"
                  pointerEvents="none"
                  aria-hidden="true"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {[
                { id: 'da-nang', name: 'Q.đ. Hoàng Sa', parent: 'Đà Nẵng', x: 335, y: 330 },
                { id: 'khanh-hoa', name: 'Q.đ. Trường Sa', parent: 'Khánh Hòa', x: 335, y: 650 },
              ].map((island) => (
                <g
                  key={island.name}
                  role="button"
                  tabIndex={0}
                  aria-label={island.name + ' · ' + island.parent}
                  onClick={() => setSelectedProvinceId(island.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedProvinceId(island.id);
                    }
                  }}
                  transform={'translate(' + island.x + ',' + island.y + ')'}
                  style={{ cursor: 'pointer' }}
                >
                  <rect x="-48" y="-16" width="96" height="114" fill="transparent" />
                  <path
                    d="M0 0l8 -5 4 9-7 6z M25 15l7 -3 6 9-9 3z M-14 30l9 -4 2 8-7 4z M14 43l7 -4 4 8-8 5z"
                    fill={footprints.has(island.id) ? '#b8cb9c' : '#d7ceb9'}
                    stroke={selectedProvinceId === island.id ? '#415a35' : '#a39b84'}
                    strokeWidth={selectedProvinceId === island.id ? 3 : 1}
                  />
                  <text x="6" y="72" textAnchor="middle" fontSize="13" fill="#445137">
                    {island.name}
                  </text>
                  <text x="6" y="88" textAnchor="middle" fontSize="10" fill="#75725f">
                    {island.parent} · minh họa
                  </text>
                </g>
              ))}
            </svg>
            <small>
              Đơn vị cấp tỉnh theo sắp xếp 2025; hình học và đảo minh họa dùng tham khảo.
            </small>
          </div>
        </div>

        {/* Right Column: Province Inspector & Browser */}
        <div className="footprint-sidebar" ref={inspector}>
          {/* Active Province Inspector Drawer */}
          {selectedProvince && (
            <div className="footprint-inspector-card">
              <header className="inspector-header">
                <div>
                  <span className="inspector-region">{regionNames[selectedProvince.region]}</span>
                  <h4>{selectedProvince.name}</h4>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Đóng chi tiết tỉnh"
                  onClick={() => setSelectedProvinceId(null)}
                >
                  <X size={16} />
                </button>
              </header>

              <div className="inspector-body">
                {selectedEntries.length > 0 ? (
                  <>
                    <p className="inspector-count">
                      <Sparkles size={15} />
                      Đã lưu <strong>{selectedEntries.length}</strong> kỉ niệm tại đây
                    </p>
                    <div className="inspector-entries-list">
                      {selectedEntries.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="inspector-entry-row"
                          onClick={() => onOpenEntry?.(e)}
                        >
                          {e.assets?.[0]?.url && (
                            <img
                              src={thumbnailUrl(e.assets[0].url)}
                              alt={e.title}
                              className="inspector-thumb"
                            />
                          )}
                          <div className="inspector-entry-text">
                            <strong>{e.title}</strong>
                            <small>{e.date}</small>
                          </div>
                          <ChevronRight size={14} className="muted" />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="inspector-empty">
                    <MapPin size={24} className="muted" />
                    <p>Hai bạn chưa lưu kỉ niệm nào tại {selectedProvince.name}.</p>
                  </div>
                )}

                <button
                  type="button"
                  className="button primary full add-at-prov-btn"
                  onClick={() => onAddAtProvince?.(selectedProvince)}
                >
                  <Plus size={16} />
                  Thêm kỉ niệm tại {selectedProvince.name}
                </button>
              </div>
            </div>
          )}

          {/* Region Tabs & Search */}
          <div className="footprint-browser-card">
            <div className="footprint-search-box">
              <Search size={15} />
              <input
                type="search"
                placeholder="Tìm tỉnh thành (Hà Nội, Đà Lạt, Sa Pa, Phú Quốc…)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="icon-button" onClick={() => setSearch('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Region Filter Buttons */}
            <div className="footprint-region-pills">
              <button
                type="button"
                className={`pill ${selectedRegion === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedRegion('all')}
              >
                Tất cả ({VIETNAM_PROVINCES.length})
              </button>
              {(Object.keys(regionNames) as VietnamRegion[]).map((reg) => (
                <button
                  key={reg}
                  type="button"
                  className={`pill ${selectedRegion === reg ? 'active' : ''}`}
                  onClick={() => setSelectedRegion(reg)}
                >
                  {regionNames[reg]}
                </button>
              ))}
            </div>

            {/* Province List Cards */}
            <div className="footprint-province-grid">
              {filteredProvinces.map((prov, index) => {
                const count = (footprints.get(prov.id) || []).length;
                const isVisited = count > 0;
                const isSelected = selectedProvinceId === prov.id;
                const pastel = PASTEL_PALETTE[index % PASTEL_PALETTE.length];

                return (
                  <button
                    key={prov.id}
                    type="button"
                    className={`prov-badge-card ${isVisited ? 'visited' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedProvinceId(prov.id)}
                    style={isVisited ? { borderLeftColor: pastel } : undefined}
                  >
                    <div className="prov-badge-info">
                      <strong>{prov.name}</strong>
                      <small>{isVisited ? `${count} kỉ niệm` : 'Chưa ghé thăm'}</small>
                    </div>
                    {isVisited ? (
                      <span className="prov-visited-tag" style={{ background: pastel }}>
                        <Heart size={11} fill="#3d372c" />
                      </span>
                    ) : (
                      <span className="prov-dot" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
