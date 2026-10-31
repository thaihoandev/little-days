import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, Trash2 } from 'lucide-react';
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
  const [error, setError] = useState(''),
    [locating, setLocating] = useState(false),
    [label, setLabel] = useState(value?.label || '');
  const active = useRef(true),
    latest = useRef({ label, disabled, onChange });
  const nameInput = useRef<HTMLInputElement>(null);
  latest.current = { label, disabled, onChange };
  useEffect(() => {
    nameInput.current?.setCustomValidity(
      label.trim() && !value ? 'Chọn địa điểm trên bản đồ hoặc dùng vị trí hiện tại.' : '',
    );
  }, [label, value]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const pick = (point: MilestoneLocation) => {
    if (!latest.current.disabled)
      latest.current.onChange({ ...point, label: latest.current.label });
  };
  return (
    <fieldset className="location-fields" disabled={disabled}>
      <legend>
        <MapPin size={15} />
        Địa điểm <small>Không bắt buộc</small>
      </legend>
      <label>
        Tên địa điểm
        <input
          ref={nameInput}
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
      <div className="location-pick-status">
        <p role="status">
          {value
            ? 'Đã ghim địa điểm · Chạm bản đồ để đổi vị trí'
            : 'Chạm bản đồ để chọn nơi lưu kỉ niệm'}
        </p>
        <button
          type="button"
          className="icon-button"
          aria-label="Vị trí hiện tại"
          title={locating ? 'Đang lấy vị trí…' : 'Dùng vị trí hiện tại'}
          disabled={disabled || locating}
          onClick={() => {
            setError('');
            if (!navigator.geolocation) {
              setError('Thiết bị không hỗ trợ lấy vị trí. Bạn có thể chạm bản đồ để chọn.');
              return;
            }
            setLocating(true);
            navigator.geolocation.getCurrentPosition(
              (p) => {
                if (!active.current) return;
                pick({
                  label: '',
                  latitude: Math.max(-85, Math.min(85, p.coords.latitude)),
                  longitude: p.coords.longitude,
                });
                setLocating(false);
              },
              () => {
                if (active.current) {
                  setError('Chưa lấy được vị trí. Bạn vẫn có thể chọn trên bản đồ.');
                  setLocating(false);
                }
              },
              { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
            );
          }}
        >
          <Navigation size={17} className={locating ? 'spin' : undefined} />
        </button>
        {value && (
          <button
            type="button"
            className="icon-button"
            aria-label="Bỏ địa điểm"
            title="Bỏ địa điểm"
            onClick={() => {
              onChange(null);
              setLabel('');
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      <Suspense fallback={<p>Đang mở bản đồ…</p>}>
        <MemoryMap selected={value} onPick={pick} disabled={disabled} />
      </Suspense>
    </fieldset>
  );
}
