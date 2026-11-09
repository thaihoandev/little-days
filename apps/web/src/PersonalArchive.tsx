import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { ARCHIVE_MAX_BYTES, type PersonalArchive } from '../../../packages/domain/archive.js';
import { downloadFile, zipFiles } from './portable-files.js';
import { todayIn } from '../../../packages/domain/index.js';
export function PersonalArchiveCard({ actor }: { actor: string }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), [actor]);
  const run = async () => {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setMessage('Đang chuẩn bị dữ liệu riêng…');
    try {
      const manifest = await api<PersonalArchive>('/account/archive', {
        signal: controller.signal,
      });
      if (manifest.actor !== actor) throw Error('Tài khoản đã thay đổi. Hãy mở lại mục tài khoản.');
      const encode = (s: string) => new TextEncoder().encode(s);
      const files: { name: string; data: Uint8Array }[] = [],
        checksums: Record<string, string> = {};
      let total = 0;
      const add = async (name: string, data: Uint8Array) => {
        total += data.length;
        if (total > ARCHIVE_MAX_BYTES) throw Error('Gói dữ liệu vượt 96 MiB. Hãy tải từng ảnh/sổ.');
        checksums[name] = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data))),
        )
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        files.push({ name, data });
      };
      for (const [i, media] of manifest.media.entries()) {
        controller.signal.throwIfAborted();
        if (!/^\/api\/(albums|journal)\/[\w-]+\/(assets|audio)\/[\w-]+$/.test(media.url))
          throw Error('Đường dẫn media không hợp lệ.');
        setMessage(`Đang tải tệp ${i + 1}/${manifest.media.length}…`);
        const response = await fetch(media.url, {
          credentials: 'same-origin',
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok || !response.body)
          throw Error('Không đọc được một tệp. Quyền hoặc dữ liệu có thể vừa thay đổi.');
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size + total > ARCHIVE_MAX_BYTES) {
            await reader.cancel();
            throw Error('Gói dữ liệu vượt giới hạn bộ nhớ.');
          }
          chunks.push(part.value);
        }
        const data = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.length;
        }
        if (size !== media.bytes) throw Error('Tệp vừa thay đổi. Hãy tạo lại gói dữ liệu.');
        await add(media.path, data);
      }
      await add('little-days.json', encode(JSON.stringify(manifest, null, 2)));
      await add(
        'memories.md',
        encode(
          '# Little Days\n\n' +
            manifest.journal
              .map(
                (e) =>
                  `## ${e.date} · ${e.title}\n\n${e.note}\n\n${e.assets.map((a) => `![Ảnh](${a.url})`).join('\n')}`,
              )
              .join('\n\n') +
            '\n\n' +
            manifest.albums
              .map(
                (a) =>
                  `## ${a.title}\n\n${a.pages
                    .map(
                      (p) =>
                        `### ${p.title}\n\n${p.elements
                          .filter((e) => e.type === 'text')
                          .map((e) => e.text)
                          .join('\n\n')}`,
                    )
                    .join(
                      '\n\n',
                    )}\n\n${a.memories.map((m) => `### ${m.date} · ${m.title}\n\n${m.body}`).join('\n\n')}\n\n${a.assets.map((x) => `![Ảnh](${x.url})`).join('\n')}`,
              )
              .join('\n\n'),
        ),
      );
      await add(
        'README.txt',
        encode(
          'Little Days — gói dữ liệu cá nhân v1\nMở memories.md để đọc, little-days.json để giữ cấu trúc sổ và media/ để lấy ảnh, nhạc đang lưu. checksums.json chứa SHA-256 của các tệp nội dung.\nKhông gồm timeline chung, lời kín, lịch sử, thùng rác, phiên đăng nhập hoặc bản nháp trên thiết bị. Không phải gói backup/restore toàn hệ thống. Ảnh là phiên bản đang lưu sau tối ưu; PDF được tải riêng trong editor. Dữ liệu mẫu minh họa không được đóng gói.\nGói tải về chứa nội dung riêng tư; tự chọn nơi lưu. Chưa hỗ trợ nhập lại ZIP.',
        ),
      );
      const current = await api<PersonalArchive>('/account/archive', { signal: controller.signal });
      if (current.actor !== actor || current.fingerprint !== manifest.fingerprint)
        throw Error('Dữ liệu hoặc tài khoản vừa thay đổi. Hãy tạo lại gói.');
      controller.signal.throwIfAborted();
      files.push({ name: 'checksums.json', data: encode(JSON.stringify(checksums, null, 2)) });
      downloadFile(
        zipFiles(files),
        `little-days-${todayIn('Asia/Ho_Chi_Minh', new Date(manifest.generatedAt))}.zip`,
      );
      setMessage('Đã tạo ZIP dữ liệu cá nhân.');
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
      }
    }
  };
  return (
    <section className="portable-card">
      <h3>Mang kỉ niệm theo mình</h3>
      <p>
        Tải ZIP gồm sổ, dấu mốc riêng, ảnh và nhạc đang lưu. Không gồm không gian chung, lời kín,
        lịch sử hoặc bản nháp. Tối đa 96 MiB; chưa hỗ trợ nhập lại.
      </p>
      <p>Bản tải về chứa nội dung riêng tư và nằm ngoài quyền thu hồi của ứng dụng.</p>
      <button className="button quiet" disabled={busy} onClick={() => void run()}>
        Tải dữ liệu cá nhân (.zip)
      </button>
      {busy && (
        <button
          className="button quiet"
          onClick={() => {
            request.current?.abort();
            setMessage('Đã hủy tạo gói.');
          }}
        >
          Hủy tải
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
