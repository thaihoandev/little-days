import { useEffect, useRef, useState } from 'react';
import type { ImportRecord } from './archive-reader.js';
import { api } from './api.js';
import { ARCHIVE_MAX_BYTES } from '../../../packages/domain/archive.js';
export function ArchiveImportCard({ actor }: { actor: string }) {
  const [records, setRecords] = useState<ImportRecord[] | null>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const worker = useRef<Worker | null>(null),
    active = useRef<AbortController | null>(null),
    generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
      active.current?.abort();
    },
    [actor],
  );
  const choose = async (file: File) => {
    const version = ++generation.current;
    worker.current?.terminate();
    setBusy(true);
    setRecords(null);
    setError('');
    setStatus('Đang kiểm tra cấu trúc và checksum trên thiết bị…');
    try {
      if (file.size > ARCHIVE_MAX_BYTES + 2 * 1048576)
        throw Error('ZIP vượt giới hạn 96 MiB nội dung.');
      const bytes = await file.arrayBuffer();
      if (generation.current !== version) return;
      const current = new Worker(new URL('./archive-import.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = current;
      current.onmessage = (event: MessageEvent<{ records?: ImportRecord[]; error?: string }>) => {
        current.terminate();
        if (generation.current !== version) return;
        worker.current = null;
        setBusy(false);
        if (event.data.error) {
          setError(event.data.error);
          setStatus('');
        } else {
          setRecords(event.data.records!);
          setStatus('Đã kiểm tra. Chưa gửi dữ liệu lên máy chủ.');
        }
      };
      current.onerror = () => {
        current.terminate();
        if (generation.current === version) {
          worker.current = null;
          setBusy(false);
          setError('Không đọc được ZIP. Hãy thử lại bằng gói gốc từ Little Days.');
        }
      };
      current.postMessage(bytes, [bytes]);
    } catch (e) {
      if (generation.current === version) {
        setError((e as Error).message);
        setStatus('');
        setBusy(false);
      }
    }
  };
  const restore = async () => {
    if (!records) return;
    setBusy(true);
    setError('');
    const version = generation.current,
      controller = new AbortController();
    active.current = controller;
    let completed = 0;
    try {
      for (const record of records) {
        controller.signal.throwIfAborted();
        setStatus(`Đang khôi phục ${completed + 1}/${records.length}…`);
        const form = new FormData();
        form.append('actor', actor);
        form.append('record', JSON.stringify(record.input));
        for (const file of record.files)
          form.append(
            'files',
            new Blob([file.data], {
              type: file.path.endsWith('.mp3') ? 'audio/mpeg' : 'image/webp',
            }),
            file.path,
          );
        await api('/account/archive/import', {
          method: 'POST',
          headers: { 'X-Archive-Actor': actor },
          body: form,
          signal: controller.signal,
        });
        completed++;
      }
      if (generation.current === version) {
        setStatus(
          `Đã khôi phục ${completed} bản ghi riêng tư. Mở lại Album hoặc Dòng thời gian để xem.`,
        );
        setRecords(null);
        window.dispatchEvent(new Event('focus'));
      }
    } catch (e) {
      if (generation.current === version) {
        if (!controller.signal.aborted)
          setError(
            `Đã nhập ${completed}/${records.length}. ${(e as Error).message} Thử lại cùng ZIP sẽ giữ kết quả đã nhập.`,
          );
        else
          setStatus(
            'Đã dừng. Bản ghi máy chủ đã nhận có thể vẫn hoàn tất; thử lại cùng ZIP để đối soát.',
          );
      }
    } finally {
      window.dispatchEvent(new CustomEvent('little-days:archive-imported', { detail: actor }));
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <section className="portable-card">
      <h3>Khôi phục dữ liệu từ ZIP</h3>
      <p>
        Chọn ZIP gốc từ “Mang kỉ niệm theo mình”. Tạo bản sao riêng, không ghi đè sổ hiện có hoặc
        khôi phục quyền chia sẻ. Dữ liệu đã nhập từng phần được giữ khi có lỗi.
      </p>
      <label className="button quiet archive-import-file">
        Chọn tệp ZIP
        <input
          aria-label="Chọn ZIP khôi phục"
          type="file"
          accept=".zip,application/zip"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void choose(file);
          }}
        />
      </label>
      {records && (
        <>
          <p>
            {records.filter((r) => r.input.kind === 'album').length} sổ ·{' '}
            {records.filter((r) => r.input.kind === 'journal').length} dấu mốc ·{' '}
            {records.reduce((n, r) => n + r.files.length, 0)} tệp
          </p>
          <button
            className="button primary"
            disabled={busy || !records.length}
            onClick={() => void restore()}
          >
            Khôi phục vào tài khoản này
          </button>
        </>
      )}
      {busy && (
        <button
          className="button quiet"
          onClick={() => {
            generation.current++;
            worker.current?.terminate();
            worker.current = null;
            active.current?.abort();
            setBusy(false);
            setStatus('Đã dừng yêu cầu trên thiết bị.');
          }}
        >
          Dừng khôi phục
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
