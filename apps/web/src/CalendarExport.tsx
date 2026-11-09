import { useState } from 'react';
import { Modal } from './Modal.js';
import { api } from './api.js';
import { downloadFile } from './portable-files.js';
import { calendarEvent } from '../../../packages/domain/icalendar.js';
import type { JournalEntry } from '../../../packages/domain/journal.js';
export function CalendarExport({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Thêm vào lịch điện thoại" onClose={onClose}>
      <p>
        Xuất tên và ngày của “{entry.title}”. Không kèm ghi chú, vị trí hoặc ảnh. Đây là bản sao;
        thay đổi hay thu hồi quyền trong Little Days không xóa được bản đã nhập vào lịch khác.
      </p>
      <p>
        {entry.annual
          ? 'Lặp hằng năm. Ngày 29/2 chỉ lặp vào năm có ngày này theo lịch iCalendar.'
          : 'Sự kiện cả ngày, không lặp.'}
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        className="button primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const current = await api<JournalEntry>('/journal/' + entry.id);
            if (current.deletedAt) throw Error('Dấu mốc đã bị xóa.');
            downloadFile(
              new Blob([calendarEvent(current)], { type: 'text/calendar;charset=utf-8' }),
              `little-days-${entry.id}.ics`,
            );
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Tải sự kiện (.ics)
      </button>
    </Modal>
  );
}
