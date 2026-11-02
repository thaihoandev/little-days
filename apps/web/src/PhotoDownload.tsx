import { useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
export function PhotoDownload({ url, id }: { url: string; id: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <span className="photo-download">
      <button
        type="button"
        className="icon-button"
        aria-label="Tải ảnh xuống"
        title={error || 'Tải ảnh xuống'}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            if (!url.startsWith('/api/')) throw new Error('Ảnh này chưa hỗ trợ tải xuống.');
            const response = await fetch(url, {
              credentials: 'same-origin',
              signal: AbortSignal.timeout(60000),
            });
            if (!response.ok) throw new Error('Chưa tải được ảnh. Hãy thử lại khi có kết nối.');
            const blob = await response.blob(),
              extension = (
                { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<
                  string,
                  string
                >
              )[blob.type];
            if (!extension || !blob.size) throw new Error('Máy chủ chưa trả về ảnh hợp lệ.');
            const target = URL.createObjectURL(blob),
              link = document.createElement('a');
            link.href = target;
            link.download =
              'little-days-' + id.replace(/[^a-z0-9-]/gi, '').slice(0, 60) + '.' + extension;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(target), 1000);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}
      </button>
      {error && (
        <span className="download-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
