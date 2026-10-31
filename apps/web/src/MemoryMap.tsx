import { useEffect, useId, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { JournalEntry, MilestoneLocation } from '../../../packages/domain/journal.js';

export default function MemoryMap({
  entries = [],
  selected,
  onPick,
  onOpen,
  disabled = false,
}: {
  entries?: JournalEntry[];
  selected?: MilestoneLocation | null;
  onPick?: (point: MilestoneLocation) => void;
  onOpen?: (entry: JournalEntry) => void;
  disabled?: boolean;
}) {
  const helpId = useId();
  const host = useRef<HTMLDivElement>(null),
    mapRef = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null),
    pin = useRef<L.CircleMarker | null>(null);
  const fitted = useRef(''),
    callbacks = useRef({ onPick, onOpen, disabled });
  callbacks.current = { onPick, onOpen, disabled };
  const [error, setError] = useState(''),
    [zoom, setZoom] = useState(5);
  const markerSignature = entries.map((entry) => entry.id + ':' + entry.revision).join('|');
  const fit = () => {
    const points = entries
      .filter((e) => e.location)
      .map((e) => [e.location!.latitude, e.location!.longitude] as L.LatLngTuple);
    if (points.length)
      mapRef.current?.fitBounds(L.latLngBounds(points), {
        padding: [45, 45],
        maxZoom: 13,
        animate: false,
      });
    else if (selected)
      mapRef.current?.setView([selected.latitude, selected.longitude], 13, { animate: false });
    else mapRef.current?.setView([16.05, 108.2], 5, { animate: false });
  };
  useEffect(() => {
    const map = L.map(host.current!, {
      scrollWheelZoom: true,
      keyboard: true,
      zoomControl: false,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).setView([16.05, 108.2], 5);
    mapRef.current = map;
    markers.current = L.layerGroup().addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      minZoom: 2,
      maxZoom: 19,
      keepBuffer: 1,
      updateWhenIdle: true,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    })
      .on('tileerror', () => setError('Chưa tải được nền bản đồ. Các dấu mốc đã lưu vẫn được giữ.'))
      .addTo(map);
    map.on('zoomend', () => setZoom(map.getZoom()));
    map.on('click', (event) => {
      if (callbacks.current.disabled) return;
      callbacks.current.onPick?.({
        label: '',
        latitude: Number(Math.max(-85, Math.min(85, event.latlng.lat)).toFixed(6)),
        longitude: Number(event.latlng.wrap().lng.toFixed(6)),
      });
    });
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(host.current!);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markers.current = null;
      pin.current = null;
      fitted.current = '';
    };
  }, []);
  useEffect(() => {
    const layer = markers.current;
    if (!layer) return;
    layer.clearLayers();
    const grouped = new Map<string, JournalEntry[]>();
    for (const entry of entries)
      if (entry.location) {
        const key = entry.location.latitude.toFixed(5) + ',' + entry.location.longitude.toFixed(5);
        grouped.set(key, [...(grouped.get(key) || []), entry]);
      }
    for (const group of grouped.values()) {
      const entry = group[0],
        photo = group.flatMap((e) => e.assets).find((a) => a.url.startsWith('/api/'));
      const icon = document.createElement('div');
      icon.className = 'memory-pin-face' + (photo ? ' has-photo' : '');
      if (photo) {
        const image = document.createElement('img');
        image.loading = 'lazy';
        image.src = photo.url;
        image.alt = '';
        image.decoding = 'async';
        image.onerror = () => {
          image.remove();
          icon.classList.remove('has-photo');
        };
        icon.append(image);
      }
      const dot = document.createElement('span');
      dot.className = 'memory-pin-dot';
      dot.textContent = '♥';
      icon.append(dot);
      if (group.length > 1) {
        const count = document.createElement('span');
        count.className = 'map-marker-count';
        count.textContent = String(group.length);
        icon.append(count);
      }
      const popup = document.createElement('div');
      for (const item of group) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'map-memory-row';
        const thumbnail = item.assets.find((a) => a.url.startsWith('/api/'));
        if (thumbnail) {
          const img = document.createElement('img');
          img.loading = 'lazy';
          img.src = thumbnail.url;
          img.alt = '';
          img.onerror = () => img.remove();
          row.append(img);
        }
        const content = document.createElement('span'),
          title = document.createElement('strong'),
          detail = document.createElement('small');
        title.textContent = item.title;
        detail.textContent = item.date + ' · ' + (item.location?.label || 'Địa điểm đã ghim');
        content.append(title, detail);
        row.append(content);
        row.onclick = () => callbacks.current.onOpen?.(item);
        popup.append(row);
      }
      L.marker([entry.location!.latitude, entry.location!.longitude], {
        icon: L.divIcon({
          html: icon,
          className: 'memory-photo-pin',
          iconSize: [48, 56],
          iconAnchor: [24, 54],
          popupAnchor: [0, -48],
        }),
        title: group.length > 1 ? group.length + ' dấu mốc tại đây' : entry.title,
        alt: entry.title,
        keyboard: true,
        riseOnHover: true,
      })
        .addTo(layer)
        .bindPopup(popup);
    }
    const signature = [...grouped.keys()].sort().join('|');
    if (fitted.current !== signature) {
      fit();
      fitted.current = signature;
    }
  }, [markerSignature]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pin.current?.remove();
    pin.current = null;
    if (!selected) return;
    if (onPick)
      pin.current = L.circleMarker([selected.latitude, selected.longitude], {
        radius: 10,
        color: '#fff',
        weight: 3,
        fillColor: '#6c8052',
        fillOpacity: 1,
      }).addTo(map);
    map.setView([selected.latitude, selected.longitude], Math.max(map.getZoom(), 13), {
      animate: false,
    });
  }, [selected?.latitude, selected?.longitude, !!onPick]);
  return (
    <div className="memory-map-wrap">
      <div className="map-tools" role="group" aria-label="Điều khiển bản đồ">
        <button
          type="button"
          className="icon-button"
          aria-label="Phóng to bản đồ"
          title="Phóng to (+)"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <Plus size={16} />
        </button>
        <output aria-label="Mức thu phóng">{zoom}</output>
        <button
          type="button"
          className="icon-button"
          aria-label="Thu nhỏ bản đồ"
          title="Thu nhỏ (−)"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Xem toàn bộ vị trí"
          title="Xem toàn bộ vị trí"
          onClick={fit}
        >
          <LocateFixed size={16} />
        </button>
      </div>
      <div
        className="memory-map"
        ref={host}
        tabIndex={0}
        role="region"
        aria-label={onPick ? 'Chọn vị trí trên bản đồ' : 'Bản đồ các dấu mốc'}
        aria-describedby={helpId}
      />
      <p className="map-keyboard-help" id={helpId}>
        Cuộn chuột để zoom · Chọn bản đồ rồi dùng + / − và phím mũi tên
      </p>
      {error && (
        <p className="small map-error" role="status">
          {error}
        </p>
      )}
      <a
        className="map-report"
        href="https://www.openstreetmap.org/fixthemap"
        target="_blank"
        rel="noopener"
      >
        Báo lỗi bản đồ
      </a>
    </div>
  );
}
