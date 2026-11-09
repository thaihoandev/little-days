import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import {
  albumContentSchema,
  type Album,
  type Asset,
  type AudioAsset,
} from '../../../packages/domain/index.js';
import { journalContentSchema, type JournalEntry } from '../../../packages/domain/journal.js';
import {
  ARCHIVE_MAX_BYTES,
  ARCHIVE_MAX_RECORDS,
  type PersonalArchive,
  type ArchiveMedia,
} from '../../../packages/domain/archive.js';
import type { Repository } from './database.js';
import { sharedJournalSql } from './journal-privacy.js';
export async function personalArchive(db: Repository, actor: string): Promise<PersonalArchive> {
  return db.maintenanceTransaction(async () => {
    const deleted =
      db.driver === 'postgresql'
        ? "r.payload::jsonb->>'deletedAt'"
        : "json_extract(r.payload,'$.deletedAt')";
    const selected = `r.owner=? AND (r.kind IN ('album','audio') OR (r.kind='journal' AND NOT ${sharedJournalSql(db.driver)} AND ${deleted} IS NULL))`;
    const length =
      db.driver === 'postgresql' ? 'octet_length(r.payload)' : 'length(CAST(r.payload AS BLOB))';
    const counts = await db.query(
      `SELECT COUNT(*) AS count,COALESCE(SUM(${length}),0) AS bytes FROM records r WHERE ${selected}`,
      [actor],
    );
    if (Number(counts[0].count) > ARCHIVE_MAX_RECORDS)
      throw new BadRequestException(
        'Gói lưu trữ hỗ trợ tối đa 500 sổ, dấu mốc và bản nhạc. Hãy tải ảnh/sổ riêng khi thư viện lớn hơn.',
      );
    if (Number(counts[0].bytes) > 8 * 1024 * 1024)
      throw new BadRequestException('Nội dung chữ vượt 8 MiB. Hãy tải từng sổ riêng.');
    // Enforce the raw-byte limit in SQL before loading/deserializing any document.
    const records = await db.query(
      `SELECT r.kind,r.payload FROM records r WHERE ${selected} ORDER BY r.kind,r.id LIMIT ${ARCHIVE_MAX_RECORDS + 1}`,
      [actor],
    );
    const list = <T>(kind: string) =>
      records.filter((r) => r.kind === kind).map((r) => JSON.parse(String(r.payload)) as T);
    const media: ArchiveMedia[] = [];
    const assets = (rows: Asset[], kind: 'albums' | 'journal', id: string) =>
      rows.map((a) => {
        const file = `media/${kind}/${id}/${a.id}.webp`;
        media.push({ path: file, url: `/api/${kind}/${id}/assets/${a.id}`, bytes: a.bytes });
        return {
          id: a.id,
          name: a.name,
          width: a.width,
          height: a.height,
          bytes: a.bytes,
          url: file,
        };
      });
    const albums = list<Album>('album')
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((a) => ({
        ...albumContentSchema.parse(a),
        id: a.id,
        revision: a.revision,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        schemaVersion: 1 as const,
        assets: assets(a.assets, 'albums', a.id),
      }));
    const journal: JournalEntry[] = [];
    for (const e of list<JournalEntry>('journal').sort((a, b) => a.id.localeCompare(b.id))) {
      journal.push({
        ...journalContentSchema.parse(e),
        id: e.id,
        revision: e.revision,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        visibility: 'private',
        assets: assets(e.assets, 'journal', e.id),
      });
    }
    const audio = list<AudioAsset>('audio')
      .filter((a) => albums.some((album) => album.id === a.albumId))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((a) => {
        const file = `media/audio/${a.albumId}/${a.id}.mp3`;
        media.push({ path: file, url: `/api/albums/${a.albumId}/audio/${a.id}`, bytes: a.bytes });
        return {
          id: a.id,
          albumId: a.albumId,
          name: a.name,
          duration: a.duration,
          bytes: a.bytes,
          url: file,
        };
      });
    if (media.length > 1500 || media.reduce((sum, a) => sum + a.bytes, 0) > ARCHIVE_MAX_BYTES)
      throw new BadRequestException(
        'Gói lưu trữ vượt 96 MiB hoặc 1.500 tệp. Hãy tải từng ảnh/sổ để tránh đầy bộ nhớ thiết bị.',
      );
    const snapshot = { version: 1 as const, actor, albums, journal, audio, media };
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 8 * 1024 * 1024)
      throw new BadRequestException('Nội dung chữ vượt 8 MiB. Hãy tải từng sổ riêng.');
    return {
      ...snapshot,
      generatedAt: new Date(await db.now()).toISOString(),
      fingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
    };
  }, true);
}
