import { lazy, Suspense, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import type { MilestoneLocation } from '../../../packages/domain/journal.js';
const MemoryMap = lazy(() => import('./MemoryMap.js'));
export function LocationFields({
  value,
  onChange,
  disabled,
}: {
  value?: MilestoneLocation | null;
  onChange: (value: MilestoneLocation | null) => void;
  disabled: boolean;
}) {
  const [map, setMap] = useState(false),
    [error, setError] = useState(''),
    [locating, setLocating] = useState(false),
    [label, setLabel] = useState(value?.label || ''),
    [latitude, setLatitude] = useState(value ? String(value.latitude) : ''),
    [longitude, setLongitude] = useState(value ? String(value.longitude) : '');
  const coordinates = (lat: string, lng: string, name = label) => {
    setLatitude(lat);
    setLongitude(lng);
    onChange(
      lat.trim() && lng.trim() && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
        ? { label: name, latitude: Number(lat), longitude: Number(lng) }
        : null,
    );
  };
  const pick = (point: MilestoneLocation) =>
    coordinates(String(point.latitude), String(point.longitude));
  const required = !!(label || latitude || longitude);
  return (
    <fieldset className="location-fields" disabled={disabled}>
      <legend>
        <MapPin size={15} />
        Địa điểm <small>Không bắt buộc</small>
      </legend>
      <label>
        Tên địa điểm
        <input
          aria-label="Tên địa điểm"
          value={label}
          maxLength={200}
          placeholder="Quán cà phê, nơi hẹn đầu…"
          onChange={(e) => {
            setLabel(e.target.value);
            if (value) onChange({ ...value, label: e.target.value });
          }}
        />
      </label>
      <div className="location-coordinates">
        <label>
          Vĩ độ
          <input
            aria-label="Vĩ độ"
            type="number"
            step="any"
            min={-85}
            max={85}
            value={latitude}
            required={required}
            onChange={(e) => coordinates(e.target.value, longitude)}
          />
        </label>
        <label>
          Kinh độ
          <input
            aria-label="Kinh độ"
            type="number"
            step="any"
            min={-180}
            max={180}
            value={longitude}
            required={required}
            onChange={(e) => coordinates(latitude, e.target.value)}
          />
        </label>
      </div>
      <div className="row">
        <button type="button" className="button quiet" onClick={() => setMap((v) => !v)}>
          <MapPin size={15} />
          {map ? 'Đóng bản đồ' : 'Ghim trên bản đồ'}
        </button>
        <button
          type="button"
          className="button quiet"
          disabled={disabled || locating}
          onClick={() => {
            setError('');
            if (!navigator.geolocation) {
              setError('Thiết bị không hỗ trợ lấy vị trí. Hãy nhập tọa độ hoặc ghim trên bản đồ.');
              return;
            }
            setLocating(true);
            navigator.geolocation.getCurrentPosition(
              (p) => {
                pick({ label, latitude: p.coords.latitude, longitude: p.coords.longitude });
                setLocating(false);
                setMap(false);
              },
              () => {
                setError('Chưa lấy được vị trí. Bạn vẫn có thể chọn thủ công.');
                setLocating(false);
              },
              { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
            );
          }}
        >
          <Navigation size={15} />
          {locating ? 'Đang lấy vị trí…' : 'Vị trí hiện tại'}
        </button>
        {required && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onChange(null);
              setLatitude('');
              setLongitude('');
              setLabel('');
              setMap(false);
            }}
          >
            Bỏ địa điểm
          </button>
        )}
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {map && (
        <>
          <p className="muted small">
            Bấm vào bản đồ để ghim. Nền bản đồ được tải từ OpenStreetMap khi bạn mở phần này.
          </p>
          <Suspense fallback={<p>Đang mở bản đồ…</p>}>
            <MemoryMap selected={value} onPick={pick} />
          </Suspense>
        </>
      )}
    </fieldset>
  );
}
