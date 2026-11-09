import { z } from 'zod';
import { albumContentSchema } from '../../../packages/domain/index.js';
import { journalContentSchema } from '../../../packages/domain/journal.js';
import {
  archiveImportSchema,
  type ArchiveImportInput,
} from '../../../packages/domain/archive-import.js';
import { ARCHIVE_MAX_BYTES, ARCHIVE_MAX_RECORDS } from '../../../packages/domain/archive.js';
export type ImportRecord = {
  input: ArchiveImportInput;
  files: { path: string; data: Uint8Array<ArrayBuffer> }[];
};
const decode = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const sha = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
/** Our exporter writes ZIP STORE. Reject compression before JSZip allocates/inflates anything. */
export function inspectArchive(bytes: Uint8Array) {
  if (bytes.length > ARCHIVE_MAX_BYTES + 2 * 1048576 || bytes.length < 22)
    throw Error('Gói ZIP quá lớn hoặc không hợp lệ.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0)
    throw Error('Không hỗ trợ ZIP chia phần.');
  const count = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true),
    length = view.getUint32(end + 12, true);
  if (count > 1510 || count !== view.getUint16(end + 8, true) || offset + length !== end)
    throw Error('Mục lục ZIP không hợp lệ.');
  const paths = new Set<string>();
  let cursor = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw Error('Mục lục ZIP bị hỏng.');
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true),
      compressed = view.getUint32(cursor + 20, true),
      size = view.getUint32(cursor + 24, true),
      nameLength = view.getUint16(cursor + 28, true),
      extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true),
      local = view.getUint32(cursor + 42, true);
    if (cursor + 46 + nameLength + extra + comment > end) throw Error('Mục lục ZIP bị hỏng.');
    const name = decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (!/^[\w./-]+$/.test(name) || name.includes('..') || name.startsWith('/') || paths.has(name))
      throw Error('Đường dẫn ZIP không an toàn hoặc bị trùng.');
    paths.add(name);
    if (flags & 1 || method !== 0 || compressed !== size)
      throw Error('Chỉ nhận ZIP gốc do Little Days xuất, chưa nén lại và không đặt mật khẩu.');
    if (((view.getUint32(cursor + 38, true) >>> 16) & 0xf000) === 0xa000)
      throw Error('Không nhận liên kết trong ZIP.');
    if (
      local + 30 > offset ||
      view.getUint32(local, true) !== 0x04034b50 ||
      view.getUint16(local + 8, true) !== 0
    )
      throw Error('Tệp ZIP không hợp lệ.');
    const localName = view.getUint16(local + 26, true),
      localExtra = view.getUint16(local + 28, true);
    if (
      local + 30 + localName + localExtra + size > offset ||
      decode(bytes.slice(local + 30, local + 30 + localName)) !== name
    )
      throw Error('Tên hoặc kích thước tệp ZIP bị sai.');
    total += size;
    if (total > ARCHIVE_MAX_BYTES || size > 20 * 1048576)
      throw Error('Nội dung ZIP vượt giới hạn 96 MiB hoặc tệp vượt 20 MiB.');
    if (
      !name.endsWith('/') &&
      !['little-days.json', 'checksums.json', 'memories.md', 'README.txt'].includes(name) &&
      !/^media\/(albums|journal|audio)\/[a-f0-9-]+\/[a-f0-9-]+\.(webp|mp3)$/i.test(name)
    )
      throw Error('ZIP chứa tệp không thuộc gói Little Days.');
    cursor += 46 + nameLength + extra + comment;
  }
  if (cursor !== end || !paths.has('little-days.json') || !paths.has('checksums.json'))
    throw Error('Thiếu nội dung hoặc checksum của Little Days.');
  return paths;
}
export async function readPersonalArchive(buffer: ArrayBuffer): Promise<ImportRecord[]> {
  const bytes = new Uint8Array(buffer);
  inspectArchive(bytes);
  const JSZip = (await import('jszip')).default,
    zip = await JSZip.loadAsync(buffer, { checkCRC32: true, createFolders: false });
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [name, file] of Object.entries(zip.files))
    if (!file.dir) files.set(name, new Uint8Array(await file.async('uint8array')));
  const parse = (name: string, max: number) => {
    const file = files.get(name);
    if (!file || file.length > max) throw Error('Nội dung ' + name + ' quá lớn hoặc bị thiếu.');
    return JSON.parse(decode(file));
  };
  const sums = z
    .record(z.string(), z.string().regex(/^[a-f0-9]{64}$/))
    .parse(parse('checksums.json', 1048576));
  for (const [name, data] of files)
    if (name !== 'checksums.json' && (!sums[name] || (await sha(data)) !== sums[name]))
      throw Error('Checksum không khớp: ' + name);
  if (
    Object.keys(sums).length !== files.size - 1 ||
    Object.keys(sums).some((name) => !files.has(name) || name === 'checksums.json')
  )
    throw Error('Danh sách checksum không đầy đủ.');
  const row = z
    .object({
      id: z.uuid(),
      assets: z
        .array(z.object({ id: z.uuid(), name: z.string().min(1).max(150), url: z.string() }))
        .max(100),
    })
    .passthrough();
  const manifest = z
    .object({
      version: z.literal(1),
      actor: z.uuid(),
      albums: z.array(row).max(ARCHIVE_MAX_RECORDS),
      journal: z.array(row).max(ARCHIVE_MAX_RECORDS),
      audio: z
        .array(
          z.object({
            id: z.uuid(),
            albumId: z.uuid(),
            name: z.string().min(1).max(150),
            url: z.string(),
          }),
        )
        .max(1500),
      media: z
        .array(z.object({ path: z.string(), bytes: z.number().int().nonnegative() }))
        .max(1500),
    })
    .parse(parse('little-days.json', 8 * 1048576));
  if (
    manifest.albums.length + manifest.journal.length + manifest.audio.length >
    ARCHIVE_MAX_RECORDS
  )
    throw Error('Gói vượt giới hạn 500 bản ghi.');
  const declared = new Set<string>();
  for (const m of manifest.media) {
    if (declared.has(m.path) || files.get(m.path)?.length !== m.bytes)
      throw Error('Media bị thiếu, trùng hoặc sai kích thước.');
    declared.add(m.path);
  }
  const used = new Set<string>(),
    archiveHash = await sha(bytes),
    result: ImportRecord[] = [],
    ids = new Set<string>();
  for (const kind of ['album', 'journal'] as const)
    for (const source of kind === 'album' ? manifest.albums : manifest.journal) {
      if (ids.has(kind + source.id)) throw Error('Bản ghi nguồn bị trùng.');
      ids.add(kind + source.id);
      const assets = source.assets.map((a) => ({
        id: a.id,
        name: a.name,
        path: a.url,
        sha256: sums[a.url],
      }));
      const audio =
        kind === 'album'
          ? manifest.audio
              .filter((a) => a.albumId === source.id)
              .map((a) => ({ id: a.id, name: a.name, path: a.url, sha256: sums[a.url] }))
          : [];
      const input = archiveImportSchema.parse({
        archiveHash,
        sourceId: source.id,
        kind,
        content:
          kind === 'album' ? albumContentSchema.parse(source) : journalContentSchema.parse(source),
        assets,
        audio,
      });
      const contentFiles = [...assets, ...audio].map((m) => {
        if (!declared.has(m.path) || used.has(m.path))
          throw Error('Media không khớp cấu trúc bản ghi.');
        used.add(m.path);
        return { path: m.path, data: files.get(m.path)! };
      });
      result.push({ input, files: contentFiles });
    }
  if (
    used.size !== declared.size ||
    [...files.keys()].some((name) => name.startsWith('media/') && !used.has(name))
  )
    throw Error('Gói có media không thuộc bản ghi nào.');
  return result;
}
