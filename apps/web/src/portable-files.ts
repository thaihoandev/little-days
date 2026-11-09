const encode = (s: string) => new TextEncoder().encode(s);
export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
/** ZIP STORE: bounded input, UTF-8 paths, CRCs; no compression work on the UI thread. */
export function zipFiles(files: { name: string; data: Uint8Array }[]): Blob {
  const parts: Uint8Array<ArrayBuffer>[] = [],
    central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const file of files) {
    if (!/^[\w./-]+$/.test(file.name) || file.name.includes('..') || file.name.startsWith('/'))
      throw Error('Tên tệp lưu trữ không hợp lệ.');
    const name = encode(file.name),
      crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length),
      l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, file.data.length, true);
    l.setUint32(22, file.data.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const record = new Uint8Array(46 + name.length),
      c = new DataView(record.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, file.data.length, true);
    c.setUint32(24, file.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    record.set(name, 46);
    parts.push(local, new Uint8Array(file.data));
    central.push(record);
    offset += local.length + file.data.length;
  }
  const size = central.reduce((n, a) => n + a.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
/** A page-at-a-time image PDF keeps the same canvas/font/crop rendering as PNG. */
export async function imagePdf(
  pages: { jpeg: Uint8Array; width: number; height: number }[],
): Promise<Blob> {
  if (!pages.length || pages.length > 20) throw Error('PDF hỗ trợ 1–20 trang.');
  const chunks: Uint8Array<ArrayBuffer>[] = [],
    offsets = [0];
  let length = 0;
  const push = (b: Uint8Array) => {
    chunks.push(new Uint8Array(b));
    length += b.length;
  };
  const object = (id: number, text: string, data?: Uint8Array) => {
    offsets[id] = length;
    push(encode(`${id} 0 obj\n${text}`));
    if (data) {
      push(encode('\nstream\n'));
      push(data);
      push(encode('\nendstream'));
    }
    push(encode('\nendobj\n'));
  };
  push(encode('%PDF-1.4\n% Little Days\n'));
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(
    2,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`,
  );
  pages.forEach((page, i) => {
    const id = 3 + i * 3,
      content = encode('q\n720 0 0 900 0 0 cm\n/Photo Do\nQ');
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 720 900] /Resources << /XObject << /Photo ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`,
    );
    object(
      id + 1,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`,
      page.jpeg,
    );
    object(id + 2, `<< /Length ${content.length} >>`, content);
  });
  const xref = length;
  push(
    encode(
      `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
        .join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  );
  return new Blob(chunks, { type: 'application/pdf' });
}
