import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useBodyScrollLock } from './Overlays.js';
type SourceInfo = {
  license: string;
  copyright: string;
  sourceUrl: string;
  archiveUrl: string | null;
  revision: string | null;
  development: boolean;
};
let cached: Promise<SourceInfo> | undefined;
const load = () =>
  (cached ||= fetch('/legal-info.json', { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error('Source metadata unavailable');
    return r.json();
  }));
export function LegalLinks() {
  const [info, setInfo] = useState<SourceInfo | null>(null),
    [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    load()
      .then((value) => {
        if (active) setInfo(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <span className="legal-links">
        <button type="button" onClick={() => setOpen(true)}>
          Giấy phép
        </button>
        <span aria-hidden="true">·</span>
        <a
          href={info?.sourceUrl || 'https://github.com/thaihoandev/little-days'}
          target="_blank"
          rel="noopener noreferrer"
        >
          Mã nguồn{info?.revision ? ' · ' + info.revision.slice(0, 7) : ''}
        </a>
      </span>
      {open && <LegalDialog info={info} onClose={() => setOpen(false)} />}
    </>
  );
}
function LegalDialog({ info, onClose }: { info: SourceInfo | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useBodyScrollLock();
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="legal-dialog"
      aria-label="Giấy phép Little Days"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>Giấy phép Little Days</h2>
        <button className="icon-button" autoFocus aria-label="Đóng giấy phép" onClick={onClose}>
          <X />
        </button>
      </header>
      <p>© 2026 thaihoandev và các tác giả đóng góp.</p>
      <p>
        Mã nguồn Little Days dùng <strong>AGPL-3.0</strong>, kèm ngoại lệ liên kết Remotion. Bạn
        được sử dụng, sửa đổi và phân phối theo giấy phép; bản sửa đổi cung cấp qua mạng phải đáp
        ứng nghĩa vụ cung cấp mã nguồn tương ứng. Phần mềm không kèm bảo hành.
      </p>
      <p>
        Ảnh, ghi chú và nhạc riêng của bạn không tự động trở thành nội dung công khai theo giấy phép
        mã nguồn. Thư viện, font và Remotion giữ điều khoản riêng.
      </p>
      {info?.development && (
        <p className="notice">
          Đây là bản phát triển. Liên kết dự án hiện không xác nhận đúng phiên bản đang chạy.
        </p>
      )}
      <ul>
        <li>
          <a href="/legal/AGPL-3.0-only.txt" target="_blank" rel="noopener noreferrer">
            Đọc toàn văn AGPL-3.0
          </a>
        </li>
        <li>
          <a href="/legal/REMOTION-EXCEPTION.md" target="_blank" rel="noopener noreferrer">
            Ngoại lệ liên kết Remotion
          </a>
        </li>
        <li>
          <a href="/legal/THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener noreferrer">
            Thông báo thư viện và font
          </a>
        </li>
        <li>
          <a
            href={info?.sourceUrl || 'https://github.com/thaihoandev/little-days'}
            target="_blank"
            rel="noopener noreferrer"
          >
            Xem mã nguồn{info?.revision ? ' phiên bản ' + info.revision.slice(0, 7) : ' dự án'}
          </a>
        </li>
        {info?.archiveUrl && (
          <li>
            <a href={info.archiveUrl}>Tải mã nguồn đúng phiên bản</a>
          </li>
        )}
      </ul>
    </dialog>
  );
}
