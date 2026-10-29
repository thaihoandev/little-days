import { useEffect, useState } from 'react';
import { api, ApiError } from './api.js';

type Status = { status: 'waiting' | 'deleting' | 'retrying' | 'completed'; remainingFiles: number };
export function readDeletionReceipt() {
  try {
    const value = sessionStorage.getItem('scrapbook-deletion-receipt');
    return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}
export default function AccountDeletionStatus({
  receipt,
  onDismiss,
}: {
  receipt: string;
  onDismiss: () => void;
}) {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState(false);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setStatus(undefined);
    setError(false);
    setMissing(false);
    const load = async () => {
      let finished = false;
      try {
        const result = await api<Status>('/auth/deletion-status', {
          method: 'POST',
          body: JSON.stringify({ receipt }),
        });
        if (!active) return;
        setStatus(result);
        setError(false);
        finished = result.status === 'completed';
      } catch (cause) {
        if (!active) return;
        setError(true);
        finished = cause instanceof ApiError && cause.status === 404;
        setMissing(finished);
      }
      if (active && !finished) timer = setTimeout(() => void load(), 10000);
    };
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [receipt]);
  const complete = status?.status === 'completed';
  return (
    <section className="deletion-status" aria-live="polite" aria-label="Trạng thái xóa tài khoản">
      <strong>
        {complete
          ? 'Đã xóa tài khoản và dữ liệu trên ứng dụng'
          : 'Đã tiếp nhận yêu cầu xóa tài khoản'}
      </strong>
      <p>
        {missing
          ? 'Không tìm thấy mã theo dõi yêu cầu trên máy chủ này.'
          : error
            ? 'Chưa kiểm tra được tiến độ. Yêu cầu vẫn được lưu và xử lý trên máy chủ.'
            : status?.status === 'retrying'
              ? 'Việc dọn dữ liệu đang gián đoạn. Hệ thống sẽ tự thử lại.'
              : complete
                ? 'Ảnh, nhạc, video và dữ liệu tài khoản đang được ứng dụng quản lý đã được dọn.'
                : 'Bạn đã được đăng xuất. Hệ thống đang dừng các tác vụ và dọn dữ liệu riêng tư.'}
      </p>
      {(complete || missing) && (
        <button className="text-button" onClick={onDismiss}>
          Đóng thông báo xóa
        </button>
      )}
    </section>
  );
}
