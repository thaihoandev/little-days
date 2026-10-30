import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  albumContentSchema,
  createAlbumContent,
  type Album,
  type Asset,
} from '../../../packages/domain/index.js';
import {
  journalAlbumSchema,
  sourceKey,
  buildJournalPages,
  type JournalSource,
  type JournalAlbumEntry,
} from '../../../packages/domain/journal-album.js';
import type { JournalEntry } from '../../../packages/domain/journal.js';
import { builtInTemplates } from '../../../packages/domain/templates.js';
import { Repository } from './database.js';
import { type MediaStore, readLimited } from './storage.js';
import { AccountDeletion } from './account-deletion.js';
import { ResourcePolicy } from './resource-policy.js';
import { normalizePhoto } from './images.js';
import { logEvent } from './observability.js';

type Claim = { attempt: string; fingerprint: string; expires: number; albumId?: string };
type Snapshot = { source: JournalSource; entry: JournalAlbumEntry; keys: Map<string, string> };
export class JournalAlbumService {
  constructor(
    private db: Repository,
    private store: MediaStore,
    private resources: ResourcePolicy,
    private deletion: AccountDeletion,
  ) {}
  private async ownerLock(owner: string) {
    if (this.db.driver === 'postgresql')
      await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [
        'owner-operation:' + owner,
      ]);
  }
  private async snapshot(owner: string, source: JournalSource, lock = false): Promise<Snapshot> {
    const kind = source.kind === 'journal' ? 'journal' : 'album';
    const row = (
      await this.db.query(
        'SELECT owner,payload,revision FROM records WHERE kind=? AND id=?' +
          (lock && this.db.driver === 'postgresql' ? ' FOR SHARE' : ''),
        [kind, source.id],
      )
    )[0];
    if (!row || row.owner !== owner) throw new NotFoundException('Không tìm thấy dấu mốc đã chọn.');
    if (Number(row.revision) !== source.expectedRevision)
      throw new ConflictException(
        'Một dấu mốc vừa thay đổi. Hãy tải lại timeline trước khi tạo sổ.',
      );
    const payload = JSON.parse(String(row.payload)) as JournalEntry & Album;
    let entry: JournalAlbumEntry;
    if (source.kind === 'journal')
      entry = {
        id: sourceKey(source),
        title: payload.title,
        date: payload.date,
        note: payload.note,
        assets: payload.assets,
      };
    else if (source.kind === 'album-start')
      entry = {
        id: sourceKey(source),
        title: 'Ngày bắt đầu · ' + payload.names.join(' & '),
        date: payload.startDate,
        note: 'Câu chuyện của hai đứa bắt đầu từ đây.',
        assets: payload.assets.slice(0, 1),
      };
    else {
      const memory = payload.memories.find((m) => m.id === source.memoryId);
      if (!memory) throw new NotFoundException('Không tìm thấy kỉ niệm đã chọn.');
      entry = {
        id: sourceKey(source),
        title: memory.title,
        date: memory.date,
        note: memory.body,
        assets: payload.assets.filter((a) => a.id === memory.assetId),
      };
    }
    return {
      source,
      entry,
      keys: new Map(
        entry.assets.map((a) => [
          a.id,
          (source.kind === 'journal' ? 'journal/' : 'uploads/') +
            a.id +
            (source.kind === 'journal' ? '.jpg' : '.webp'),
        ]),
      ),
    };
  }
  private async read(key: string, timeout: number) {
    const signal = AbortSignal.timeout(Math.max(1, Math.min(timeout, 45000)));
    const pending = this.store.get(key);
    pending
      .then((object) => {
        if (signal.aborted) object.stream.destroy();
      })
      .catch(() => {});
    const object = await Promise.race([
      pending,
      new Promise<never>((_, reject) =>
        signal.addEventListener(
          'abort',
          () => reject(new ServiceUnavailableException('Tải ảnh quá lâu. Vui lòng thử lại.')),
          { once: true },
        ),
      ),
    ]);
    const abort = () => object.stream.destroy(new Error('Photo read timed out'));
    signal.addEventListener('abort', abort, { once: true });
    try {
      return await readLimited(object, 20 * 1048576);
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
  async create(owner: string, body: unknown) {
    const input = journalAlbumSchema.parse(body);
    const canonical = {
      ...input,
      sources: [...input.sources].sort((a, b) => sourceKey(a).localeCompare(sourceKey(b))),
    };
    const fingerprint = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    const attempt = randomUUID();
    const operation = await this.deletion.begin(owner);
    const created: string[] = [];
    let claimed = false,
      published = false,
      targetAlbumId: string | undefined;
    try {
      const previous = await this.db.transaction(async () => {
        await this.ownerLock(owner);
        const requestOwner = await this.db.owner('journal-album-request', input.requestId);
        if (requestOwner && requestOwner !== owner) throw new NotFoundException();
        const previous = await this.db.get<Claim>('journal-album-request', input.requestId);
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new ConflictException(
              'Yêu cầu này đã dùng với lựa chọn khác. Hãy mở lại hộp tạo sổ.',
            );
          if (previous.albumId) {
            const album = await this.db.get<Album>('album', previous.albumId);
            if (album && (await this.db.owner('album', album.id)) === owner) return album;
            throw new ConflictException('Album của yêu cầu này đã bị xóa. Hãy mở lại hộp tạo sổ.');
          }
          if (previous.expires > (await this.db.now()))
            throw new ConflictException('Sổ đang được tạo. Đợi một chút rồi thử lại.');
        }
        if ((await this.db.list('album', owner)).length >= 30)
          throw new BadRequestException('Tối đa 30 album.');
        await this.db.put('journal-album-request', input.requestId, owner, {
          attempt,
          fingerprint,
          expires: (await this.db.now()) + 240000,
        } satisfies Claim);
        claimed = true;
      });
      if (previous) return previous;
      const snapshots: Snapshot[] = [];
      for (const source of input.sources) snapshots.push(await this.snapshot(owner, source));
      try {
        buildJournalPages(
          snapshots.map((s) => s.entry),
          input.templateId,
        );
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      const files = new Map<string, Asset>();
      for (const s of snapshots) for (const a of s.entry.assets) files.set(s.keys.get(a.id)!, a);
      if (files.size > 100)
        throw new BadRequestException('Album tối đa 100 ảnh. Hãy chọn ít dấu mốc hơn.');
      const albumId = randomUUID(),
        assets: Asset[] = [],
        mapping = new Map<string, Asset>(),
        deadline = Date.now() + 180000;
      targetAlbumId = albumId;
      for (const [sourceKey, asset] of files) {
        const remaining = deadline - Date.now();
        if (remaining <= 0)
          throw new ServiceUnavailableException(
            'Ảnh cần xử lý quá lâu. Hãy chọn ít dấu mốc hơn rồi thử lại.',
          );
        const bytes = await this.read(sourceKey, remaining);
        const normalized = await normalizePhoto(bytes, 'webp');
        if (Date.now() >= deadline)
          throw new ServiceUnavailableException('Tạo sổ quá lâu. Vui lòng thử lại.');
        const id = randomUUID(),
          key = 'uploads/' + id + '.webp';
        await this.deletion.track(operation, [key]);
        created.push(key);
        await this.resources.reserve(owner, key, normalized.data.length);
        await this.store.put(
          key,
          normalized.data,
          'image/webp',
          AbortSignal.timeout(Math.max(1, Math.min(45000, deadline - Date.now()))),
        );
        const copied = {
          id,
          name: asset.name,
          width: normalized.info.width,
          height: normalized.info.height,
          bytes: normalized.data.length,
          url: `/api/albums/${albumId}/assets/${id}`,
        };
        assets.push(copied);
        mapping.set(sourceKey, copied);
      }
      const copiedEntries = snapshots.map((s) => ({
        ...s.entry,
        assets: s.entry.assets.map((a) => mapping.get(s.keys.get(a.id)!)!),
      }));
      const base = createAlbumContent(),
        now = new Date().toISOString();
      const memories = copiedEntries.flatMap((entry) => {
        const chunks: string[] = [];
        let offset = 0;
        while (offset < entry.note.length) {
          let end = Math.min(offset + 2900, entry.note.length);
          if (/[\uD800-\uDBFF]/.test(entry.note[end - 1])) end--;
          chunks.push(entry.note.slice(offset, end));
          offset = end;
        }
        return (chunks.length ? chunks : ['']).map((body, i) => ({
          id: randomUUID(),
          title: (entry.title + (i ? ' · ghi chú tiếp' : '')).slice(0, 160),
          date: entry.date,
          body,
          featured: false,
          assetId: entry.assets[0]?.id || null,
        }));
      });
      const content = albumContentSchema.parse({
        ...base,
        title: input.title,
        names: input.names,
        timezone: input.timezone,
        theme: builtInTemplates.find((t) => t.id === input.templateId)!.theme,
        startDate: copiedEntries.map((e) => e.date).sort()[0],
        pages: buildJournalPages(copiedEntries, input.templateId),
        memories,
      });
      const album: Album = {
        ...content,
        id: albumId,
        schemaVersion: 1,
        revision: 0,
        assets,
        createdAt: now,
        updatedAt: now,
      };
      await this.db.transaction(async () => {
        await this.ownerLock(owner);
        const claim = await this.db.get<Claim>('journal-album-request', input.requestId);
        if (!claim || claim.attempt !== attempt || claim.expires <= (await this.db.now()))
          throw new ConflictException('Yêu cầu tạo sổ đã hết hạn. Vui lòng thử lại.');
        if (await this.deletion.blocked(owner))
          throw new ConflictException('Tài khoản đang được xóa.');
        if ((await this.db.list('album', owner)).length >= 30)
          throw new BadRequestException('Tối đa 30 album.');
        for (const source of [...input.sources].sort((a, b) =>
          sourceKey(a).localeCompare(sourceKey(b)),
        ))
          await this.snapshot(owner, source, true);
        await this.db.insert('album', album.id, owner, album);
        await this.db.put('journal-album-request', input.requestId, owner, {
          ...claim,
          albumId: album.id,
        });
      });
      published = true;
      return album;
    } catch (error) {
      let cleanupSafe = true;
      if (targetAlbumId) {
        try {
          if ((await this.db.owner('album', targetAlbumId)) === owner) {
            const saved = await this.db.get<Album>('album', targetAlbumId);
            if (saved) {
              published = true;
              return saved;
            }
          }
        } catch {
          cleanupSafe = false;
          logEvent('journal_album_commit_uncertain');
        }
      }
      if (!published && cleanupSafe) {
        for (const key of created)
          await this.resources.remove(key).catch(() => logEvent('journal_album_cleanup_deferred'));
        if (claimed)
          await this.db.transaction(async () => {
            await this.ownerLock(owner);
            const claim = await this.db.get<Claim>('journal-album-request', input.requestId);
            if (claim?.attempt === attempt && !claim.albumId)
              await this.db.remove('journal-album-request', input.requestId);
          });
      }
      throw error;
    } finally {
      await this.deletion.end(operation);
    }
  }
}
