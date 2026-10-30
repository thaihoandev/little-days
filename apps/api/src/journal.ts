import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { normalizePhoto } from './images.js';
import { z } from 'zod';
import {
  journalContentSchema,
  timelineHeadingSchema,
  defaultTimelineHeading,
  type TimelineHeading,
  type JournalEntry,
} from '../../../packages/domain/journal.js';
import { Repository } from './database.js';
import type { MediaStore } from './storage.js';
import { ResourcePolicy } from './resource-policy.js';
import { AccountDeletion, UPLOAD_TIMEOUT_MS } from './account-deletion.js';
import { logEvent } from './observability.js';

export class JournalService {
  constructor(
    private db: Repository,
    private store: MediaStore,
    private resources: ResourcePolicy,
    private deletion: AccountDeletion,
  ) {}
  private async guarded<T>(owner: string, action: () => Promise<T>) {
    const operation = await this.deletion.begin(owner);
    try {
      return await action();
    } finally {
      await this.deletion.end(operation);
    }
  }
  async list(owner: string) {
    return (await this.db.list<JournalEntry>('journal', owner)).sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
  }
  async heading(owner: string): Promise<TimelineHeading> {
    return (
      (await this.db.list<TimelineHeading>('timeline-heading', owner))[0] || {
        ...defaultTimelineHeading,
      }
    );
  }
  async saveHeading(owner: string, body: unknown) {
    const input = z
      .object({ expectedRevision: z.number().int().min(-1), content: timelineHeadingSchema })
      .parse(body);
    return this.guarded(owner, async () => {
      const heading = { ...input.content, revision: input.expectedRevision + 1 };
      const saved =
        input.expectedRevision === -1
          ? await this.db.insert('timeline-heading', owner, owner, heading)
          : await this.db.compareAndSwap(
              'timeline-heading',
              owner,
              owner,
              input.expectedRevision,
              heading,
            );
      if (!saved)
        throw new ConflictException(
          'Tiêu đề timeline vừa thay đổi. Nội dung đang nhập được giữ; tải lại trước khi sửa tiếp.',
        );
      return heading;
    });
  }
  async owned(owner: string, id: string) {
    if ((await this.db.owner('journal', id)) !== owner)
      throw new NotFoundException('Không tìm thấy dấu mốc.');
    const entry = await this.db.get<JournalEntry>('journal', id);
    if (!entry) throw new NotFoundException('Không tìm thấy dấu mốc.');
    return entry;
  }
  async create(owner: string, body: unknown) {
    const content = journalContentSchema.parse(body);
    return this.guarded(owner, () =>
      this.db.transaction(async () => {
        if (this.db.driver === 'postgresql')
          await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', ['journal:' + owner]);
        if ((await this.db.list('journal', owner)).length >= 500)
          throw new BadRequestException('Tối đa 500 dấu mốc và ghi chú.');
        const now = new Date().toISOString(),
          entry: JournalEntry = {
            ...content,
            id: randomUUID(),
            revision: 0,
            assets: [],
            createdAt: now,
            updatedAt: now,
          };
        await this.db.insert('journal', entry.id, owner, entry);
        return entry;
      }),
    );
  }
  async save(owner: string, id: string, body: unknown) {
    return this.guarded(owner, async () => {
      const input = z
        .object({ expectedRevision: z.number().int().nonnegative(), content: journalContentSchema })
        .parse(body);
      const current = await this.owned(owner, id),
        entry = {
          ...current,
          ...input.content,
          revision: input.expectedRevision + 1,
          updatedAt: new Date().toISOString(),
        };
      if (!(await this.db.compareAndSwap('journal', id, owner, input.expectedRevision, entry)))
        throw new ConflictException(
          'Dấu mốc vừa thay đổi. Tải lại trước khi lưu; nội dung bạn đang nhập vẫn được giữ.',
        );
      return entry;
    });
  }
  async remove(owner: string, id: string, body: unknown) {
    const { expectedRevision } = z
        .object({ expectedRevision: z.number().int().nonnegative() })
        .parse(body),
      entry = await this.owned(owner, id);
    const operation = await this.deletion.begin(owner);
    try {
      await this.deletion.track(
        operation,
        entry.assets.map((a) => 'journal/' + a.id + '.jpg'),
      );
      const removed = await this.db.query(
        "DELETE FROM records WHERE kind='journal' AND id=? AND owner=? AND revision=? RETURNING id",
        [id, owner, expectedRevision],
      );
      if (!removed.length)
        throw new ConflictException('Dấu mốc vừa thay đổi. Tải lại trước khi xóa.');
      const results = await Promise.allSettled(
        entry.assets.map((a) => this.resources.remove('journal/' + a.id + '.jpg')),
      );
      return { ok: true, cleanupPending: results.some((r) => r.status === 'rejected') };
    } finally {
      await this.deletion.end(operation);
    }
  }
  async upload(owner: string, id: string, file: Express.Multer.File | undefined) {
    await this.owned(owner, id);
    if (!file || file.size > 20 * 1048576)
      throw new BadRequestException('Chọn ảnh JPEG/PNG/WebP tối đa 20 MB.');
    let result: Awaited<ReturnType<typeof normalizePhoto>>;
    try {
      result = await normalizePhoto(file.buffer, 'jpeg');
    } catch {
      throw new BadRequestException(
        'Ảnh không hợp lệ; chỉ hỗ trợ JPEG/PNG/WebP tối đa 40 megapixel.',
      );
    }
    const assetId = randomUUID(),
      key = 'journal/' + assetId + '.jpg',
      operation = await this.deletion.begin(owner, key);
    try {
      await this.resources.reserve(owner, key, result.data.length);
      await this.store.put(key, result.data, 'image/jpeg', AbortSignal.timeout(UPLOAD_TIMEOUT_MS));
      for (let i = 0; i < 5; i++) {
        const current = await this.owned(owner, id);
        if (current.assets.length >= 6) throw new BadRequestException('Mỗi dấu mốc tối đa 6 ảnh.');
        const entry = {
          ...current,
          revision: current.revision + 1,
          updatedAt: new Date().toISOString(),
          assets: [
            ...current.assets,
            {
              id: assetId,
              name: file.originalname.slice(0, 150),
              width: result.info.width,
              height: result.info.height,
              bytes: result.data.length,
              url: `/api/journal/${id}/assets/${assetId}`,
            },
          ],
        };
        if (await this.db.compareAndSwap('journal', id, owner, current.revision, entry))
          return entry;
      }
      throw new ConflictException('Dấu mốc đang thay đổi. Vui lòng tải ảnh lại.');
    } catch (error) {
      await this.resources.remove(key).catch(() => logEvent('journal_media_cleanup_deferred'));
      throw error;
    } finally {
      await this.deletion.end(operation);
    }
  }
  async removeAsset(owner: string, id: string, assetId: string, body: unknown) {
    return this.guarded(owner, async () => {
      const { expectedRevision } = z
          .object({ expectedRevision: z.number().int().nonnegative() })
          .parse(body),
        current = await this.owned(owner, id);
      if (!current.assets.some((a) => a.id === assetId))
        throw new NotFoundException('Không tìm thấy ảnh.');
      const entry = {
        ...current,
        revision: current.revision + 1,
        assets: current.assets.filter((a) => a.id !== assetId),
        updatedAt: new Date().toISOString(),
      };
      if (!(await this.db.compareAndSwap('journal', id, owner, expectedRevision, entry)))
        throw new ConflictException('Dấu mốc vừa thay đổi. Vui lòng tải lại.');
      await this.resources
        .remove('journal/' + assetId + '.jpg')
        .catch(() => logEvent('journal_media_cleanup_deferred'));
      return entry;
    });
  }
}
