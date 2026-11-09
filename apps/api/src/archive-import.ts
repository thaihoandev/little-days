import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import { archiveImportSchema } from '../../../packages/domain/archive-import.js';
import { ARCHIVE_MAX_BYTES } from '../../../packages/domain/archive.js';
import {
  albumContentSchema,
  type Album,
  type Asset,
  type AudioAsset,
} from '../../../packages/domain/index.js';
import { privateSpaceId } from './journal-privacy.js';
import { Repository } from './database.js';
import { AccountDeletion, UPLOAD_TIMEOUT_MS } from './account-deletion.js';
import { ResourcePolicy } from './resource-policy.js';
import type { MediaStore } from './storage.js';
import { normalizePhoto } from './images.js';
import { normalizeAudio, MAX_AUDIO_BYTES } from './audio.js';
import { JournalService } from './journal.js';
type Claim = {
  revision: number;
  attempt: string;
  until: number;
  signature: string;
  targetId: string;
  kind: 'album' | 'journal';
  completed?: boolean;
};
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export class ArchiveImporter {
  constructor(
    private db: Repository,
    private deletion: AccountDeletion,
    private resources: ResourcePolicy,
    private store: MediaStore,
    private journal: JournalService,
  ) {}
  private async lock(actor: string, id: string) {
    if (this.db.driver === 'postgresql')
      for (const key of ['owner-operation:' + actor, 'archive-import:' + id])
        await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [key]);
  }
  async restore(actor: string, body: unknown, files: Express.Multer.File[]) {
    const account = (await this.db.list<{ deletingAt?: string }>('account', actor))[0];
    if (!account || account.deletingAt)
      throw new UnauthorizedException('Đăng nhập tài khoản trước khi khôi phục ZIP.');
    const input = archiveImportSchema.parse(body),
      media = [...input.assets, ...input.audio];
    if (
      files.length !== media.length ||
      files.reduce((total, f) => total + f.size, 0) > ARCHIVE_MAX_BYTES
    )
      throw new BadRequestException('Thiếu tệp hoặc bản ghi vượt 96 MiB.');
    const byPath = new Map(files.map((f) => [f.originalname, f]));
    if (byPath.size !== files.length) throw new BadRequestException('Tệp bị trùng.');
    for (const item of media) {
      const f = byPath.get(item.path);
      if (!f || f.size > 20 * 1048576 || hash(f.buffer) !== item.sha256)
        throw new BadRequestException('Tệp không khớp checksum: ' + item.path);
    }
    if (input.kind === 'album') {
      const ids = new Set(input.assets.map((a) => a.id));
      for (const id of [
        ...input.content.pages.flatMap((p) =>
          p.elements.filter((e) => e.type === 'image').map((e) => e.assetId),
        ),
        ...input.content.memories.map((m) => m.assetId),
      ])
        if (id && !/^demo-[123]$/.test(id) && !ids.has(id))
          throw new BadRequestException('Sổ tham chiếu ảnh không có trong gói.');
      if (
        input.content.presentation?.musicId === 'custom' &&
        !input.audio.some((a) => a.id === input.content.presentation?.audioId)
      )
        throw new BadRequestException('Sổ thiếu nhạc riêng.');
    }
    const id = hash(actor + ':' + input.archiveHash + ':' + input.kind + ':' + input.sourceId),
      signature = hash(JSON.stringify(input)),
      attempt = randomUUID(),
      targetId = randomUUID();
    const operation = await this.deletion.begin(actor),
      created: string[] = [];
    let claim: Claim | undefined,
      claimed = false;
    const read = async (c: Claim) => {
      const result = await this.db.owned<Album>('' + c.kind, c.targetId, actor);
      if (!result || ('deletedAt' in result && result.deletedAt))
        throw new GoneException('Bản sao đã nhập trước đó đã bị xóa. Không tự tạo lại.');
      return { id: c.targetId, kind: c.kind, reused: true };
    };
    try {
      claim = await this.db.transaction(async () => {
        await this.lock(actor, id);
        const old = await this.db.owned<Claim>('archive-import-receipt', id, actor),
          now = await this.db.now();
        if (old && old.signature !== signature)
          throw new ConflictException('Gói nhập cùng mã nhưng nội dung đã đổi.');
        if (old?.completed) return old;
        if (old && old.until > now)
          throw new ConflictException('Bản ghi đang được nhập. Chờ một chút rồi thử lại.');
        if (!old && (await this.db.list('archive-import-receipt', actor)).length >= 1000)
          throw new BadRequestException('Đã đạt giới hạn lịch sử nhập dữ liệu.');
        const next: Claim = {
          revision: (old?.revision ?? -1) + 1,
          attempt,
          until: now + 240000,
          signature,
          targetId,
          kind: input.kind,
        };
        if (old) {
          if (
            !(await this.db.compareAndSwap('archive-import-receipt', id, actor, old.revision, next))
          )
            throw new ConflictException();
        } else if (!(await this.db.insert('archive-import-receipt', id, actor, next)))
          throw new ConflictException();
        claimed = true;
        return next;
      });
      if (claim.completed) return await read(claim);
      const deadline = Date.now() + 180000,
        assets: Asset[] = [],
        audio: AudioAsset[] = [],
        mapping = new Map<string, string>();
      const put = async (key: string, bytes: Buffer, type: string) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0)
          throw new BadRequestException('Lần nhập hết thời gian. Thử lại để tiếp tục.');
        await this.deletion.track(operation, [key]);
        created.push(key);
        await this.resources.reserve(actor, key, bytes.length);
        await this.store.put(
          key,
          bytes,
          type,
          AbortSignal.timeout(Math.min(UPLOAD_TIMEOUT_MS, remaining)),
        );
      };
      for (const item of input.assets) {
        const newId = randomUUID(),
          file = byPath.get(item.path)!;
        if (Date.now() >= deadline) throw new BadRequestException('Lần nhập hết thời gian.');
        let normalized: Awaited<ReturnType<typeof normalizePhoto>>;
        try {
          normalized = await normalizePhoto(file.buffer, input.kind === 'album' ? 'webp' : 'jpeg');
        } catch {
          throw new BadRequestException('Ảnh trong ZIP không hợp lệ hoặc vượt 40 megapixel.');
        }
        const key = input.kind === 'album' ? `uploads/${newId}.webp` : `journal/${newId}.jpg`;
        await put(key, normalized.data, input.kind === 'album' ? 'image/webp' : 'image/jpeg');
        mapping.set(item.id, newId);
        assets.push({
          id: newId,
          name: item.name,
          width: normalized.info.width,
          height: normalized.info.height,
          bytes: normalized.data.length,
          url: `/api/${input.kind === 'album' ? 'albums' : 'journal'}/${targetId}/assets/${newId}`,
        });
      }
      for (const item of input.audio) {
        const f = byPath.get(item.path)!;
        if (f.size > MAX_AUDIO_BYTES) throw new BadRequestException('Nhạc quá lớn.');
        if (Date.now() >= deadline) throw new BadRequestException('Lần nhập hết thời gian.');
        let normalized: Awaited<ReturnType<typeof normalizeAudio>>;
        try {
          normalized = await normalizeAudio(f.buffer);
        } catch {
          throw new BadRequestException('Nhạc trong ZIP không hợp lệ.');
        }
        const newId = randomUUID();
        await put(`audio/${newId}.mp3`, normalized.bytes, 'audio/mpeg');
        mapping.set(item.id, newId);
        audio.push({
          id: newId,
          albumId: targetId,
          name: item.name,
          duration: normalized.duration,
          bytes: normalized.bytes.length,
          waveform: normalized.waveform,
          url: `/api/albums/${targetId}/audio/${newId}`,
        });
      }
      await this.db.transaction(async () => {
        await this.lock(actor, id);
        const current = await this.db.owned<Claim>('archive-import-receipt', id, actor),
          now = await this.db.now();
        if (
          !current ||
          current.attempt !== attempt ||
          current.completed ||
          current.until <= now ||
          (await this.deletion.blocked(actor))
        )
          throw new ConflictException('Lần nhập đã hết hiệu lực.');
        const active = await this.db.query(
          'SELECT id FROM owner_operations WHERE id=? AND expires_at>?',
          [operation, now],
        );
        if (!active.length) throw new ConflictException('Lần nhập đã hết hạn.');
        if (input.kind === 'album') {
          if ((await this.db.list('album', actor)).length >= 30)
            throw new BadRequestException('Tối đa 30 album.');
          const content = albumContentSchema.parse(input.content);
          for (const p of content.pages)
            for (const e of p.elements)
              if (e.type === 'image' && e.assetId && mapping.has(e.assetId))
                e.assetId = mapping.get(e.assetId)!;
          for (const m of content.memories)
            if (m.assetId && mapping.has(m.assetId)) m.assetId = mapping.get(m.assetId)!;
          if (content.presentation?.musicId === 'custom') {
            content.presentation.audioId = mapping.get(content.presentation.audioId!)!;
            const track = audio.find((a) => a.id === content.presentation!.audioId)!;
            if (
              (content.presentation.audioStart ?? 0) >= track.duration ||
              (content.presentation.audioEnd ?? track.duration) > track.duration + 0.05
            )
              throw new BadRequestException('Đoạn nhạc vượt thời lượng.');
          }
          const stamp = new Date(now).toISOString();
          const album: Album = {
            ...content,
            id: targetId,
            assets,
            schemaVersion: 1,
            revision: 0,
            createdAt: stamp,
            updatedAt: stamp,
          };
          if (!(await this.db.insert('album', targetId, actor, album)))
            throw new ConflictException();
          for (const a of audio)
            if (!(await this.db.insert('audio', a.id, actor, a))) throw new ConflictException();
        } else {
          const content = input.content;
          if (content.plan)
            content.plan = {
              ...content.plan,
              checklist: content.plan.checklist.map((t) => ({
                ...t,
                assigneeId: t.assigneeId === actor ? actor : null,
              })),
            };
          await this.journal.create(
            actor,
            { ...content, timelineId: privateSpaceId(actor) },
            { id: targetId, assets, restoredPlan: content.plan ? true : undefined },
          );
        }
        if (
          !(await this.db.compareAndSwap('archive-import-receipt', id, actor, current.revision, {
            ...current,
            revision: current.revision + 1,
            completed: true,
          }))
        )
          throw new ConflictException();
      });
      return { id: targetId, kind: input.kind, reused: false };
    } catch (error) {
      let safe = false;
      try {
        const saved = await this.db.owned<Claim>('archive-import-receipt', id, actor);
        if (saved?.completed && saved.attempt === attempt) return await read(saved);
        safe = true;
      } catch {
        /* A commit outcome is unknown: retain media for later cleanup. */
      }
      if (safe && claimed) {
        for (const key of created) await this.resources.remove(key).catch(() => {});
        await this.db
          .transaction(async () => {
            await this.lock(actor, id);
            const current = await this.db.owned<Claim>('archive-import-receipt', id, actor);
            if (current?.attempt === attempt && !current.completed)
              await this.db.remove('archive-import-receipt', id);
          })
          .catch(() => {});
      }
      throw error;
    } finally {
      await this.deletion.end(operation);
    }
  }
}
