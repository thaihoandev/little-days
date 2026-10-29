import { useEffect, useState } from 'react';
import { api } from './api.js';
type Usage = {
  storageBytes: number;
  exportsLast24h: number;
  videoSecondsLast24h: number;
  limits: { storageBytes: number; exportsPerDay: number; videoSecondsPerDay: number };
  videoRetentionDays: number;
};
export function UsagePanel() {
  const [usage, setUsage] = useState<Usage>();
  const [error, setError] = useState(false);
  const load = () => {
    setError(false);
    void api<Usage>('/usage')
      .then(setUsage)
      .catch(() => setError(true));
  };
  useEffect(load, []);
  return (
    <section className="usage-panel" aria-label="Hạn mức tài khoản">
      <strong>Hạn mức media và video</strong>
      {usage && (
        <>
          <p>
            {(usage.storageBytes / 1048576).toFixed(1)} /{' '}
            {Math.round(usage.limits.storageBytes / 1048576)} MB
          </p>
          <progress
            aria-label="Dung lượng đã dùng"
            value={usage.storageBytes}
            max={usage.limits.storageBytes}
          />
          <p>
            {usage.exportsLast24h} / {usage.limits.exportsPerDay} lượt xuất ·{' '}
            {usage.videoSecondsLast24h} / {usage.limits.videoSecondsPerDay} giây video trong 24 giờ
          </p>
          {usage.videoRetentionDays > 0 && (
            <p className="muted small">
              Video được lưu {usage.videoRetentionDays} ngày. Album và ảnh vẫn được giữ để xuất lại.
            </p>
          )}
        </>
      )}
      {error && <p role="alert">Chưa tải được hạn mức.</p>}
      <button className="text-button" type="button" onClick={load}>
        Cập nhật hạn mức
      </button>
    </section>
  );
}
