import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { JournalEntry, MilestoneLocation } from '../../../packages/domain/journal.js';

export default function MemoryMap({
  entries = [],
  selected,
  onPick,
  onOpen,
}: {
  entries?: JournalEntry[];
  selected?: MilestoneLocation | null;
  onPick?: (point: MilestoneLocation) => void;
  onOpen?: (entry: JournalEntry) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    [error, setError] = useState('');
  const pick = useRef(onPick),
    open = useRef(onOpen);
  const mapRef = useRef<L.Map | null>(null),
    pinRef = useRef<L.CircleMarker | null>(null);
  pick.current = onPick;
  open.current = onOpen;
  useEffect(() => {
    const map = L.map(host.current!, {
      scrollWheelZoom: false,
      preferCanvas: true,
      zoomAnimation: false,
      fadeAnimation: false,
    }).setView(
      selected ? [selected.latitude, selected.longitude] : [16.05, 108.2],
      selected ? 13 : 5,
    );
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      minZoom: 2,
      keepBuffer: 1,
      updateWhenIdle: true,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapRef.current = map;
    tiles.on('tileerror', () =>
      setError('Chưa tải được nền bản đồ. Bạn vẫn có thể nhập và lưu tọa độ.'),
    );
    const points: L.LatLngExpression[] = [];
    const grouped = new Map<string, JournalEntry[]>();
    for (const entry of entries)
      if (entry.location) {
        const key = entry.location.latitude.toFixed(5) + ',' + entry.location.longitude.toFixed(5);
        const group = grouped.get(key);
        if (group) group.push(entry);
        else grouped.set(key, [entry]);
      }
    for (const group of grouped.values()) {
      const entry = group[0];
      if (entry.location) {
        const point: L.LatLngExpression = [entry.location.latitude, entry.location.longitude];
        points.push(point);
        const popup = document.createElement('div'),
          title = document.createElement('strong'),
          detail = document.createElement('p'),
          button = document.createElement('button');
        title.textContent = group.length > 1 ? group.length + ' dấu mốc tại đây' : entry.title;
        detail.textContent = entry.date + ' · ' + (entry.location.label || 'Địa điểm đã ghim');
        button.type = 'button';
        button.textContent = group.length > 1 ? entry.title : 'Mở dấu mốc';
        button.className = 'button quiet';
        button.onclick = () => open.current?.(entry);
        popup.append(title, detail, button);
        for (const other of group.slice(1)) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'button quiet';
          item.textContent = other.date + ' · ' + other.title;
          item.onclick = () => open.current?.(other);
          popup.append(item);
        }
        const marker = L.circleMarker(point, {
          radius: group.length > 1 ? 13 : 9,
          color: '#fff',
          weight: 3,
          fillColor: entry.kind === 'note' ? '#778d9a' : '#a86863',
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup(popup);
        if (group.length > 1)
          marker.bindTooltip(String(group.length), {
            permanent: true,
            direction: 'center',
            className: 'map-marker-count',
          });
      }
    }
    if (selected && onPick)
      pinRef.current = L.circleMarker([selected.latitude, selected.longitude], {
        radius: 10,
        color: '#fff',
        weight: 3,
        fillColor: '#6c8052',
        fillOpacity: 1,
      }).addTo(map);
    if (!selected && points.length)
      map.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: 13, animate: false });
    map.on('click', (event) => {
      if (!pick.current) return;
      const point = {
        label: selected?.label || '',
        latitude: Number(Math.max(-85, Math.min(85, event.latlng.lat)).toFixed(6)),
        longitude: Number(event.latlng.wrap().lng.toFixed(6)),
      };
      if (pinRef.current) pinRef.current.setLatLng([point.latitude, point.longitude]);
      else
        pinRef.current = L.circleMarker([point.latitude, point.longitude], {
          radius: 10,
          color: '#fff',
          weight: 3,
          fillColor: '#6c8052',
          fillOpacity: 1,
        }).addTo(map);
      pick.current(point);
    });
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(host.current!);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      pinRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!pick.current) return;
    if (!selected) {
      pinRef.current?.remove();
      pinRef.current = null;
      return;
    }
    const timeout = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      const point: L.LatLngExpression = [selected.latitude, selected.longitude];
      if (pinRef.current) pinRef.current.setLatLng(point);
      else
        pinRef.current = L.circleMarker(point, {
          radius: 10,
          color: '#fff',
          weight: 3,
          fillColor: '#6c8052',
          fillOpacity: 1,
        }).addTo(map);
      map.panTo(point, { animate: false });
    }, 300);
    return () => clearTimeout(timeout);
  }, [selected?.latitude, selected?.longitude]);
  return (
    <div className="memory-map-wrap">
      <div
        className="memory-map"
        ref={host}
        aria-label={onPick ? 'Chọn vị trí trên bản đồ' : 'Bản đồ các dấu mốc'}
      />
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
