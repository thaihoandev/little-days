import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { normalizePhoto } from './images.js';
import { z } from 'zod';
import {
  journalContentSchema,
  timelineHeadingSchema,
  defaultTimelineHeading,
  type TimelineHeading,
  type JournalEntry,
  type JournalVersion,
} from '../../../packages/domain/journal.js';
import { Repository } from './database.js';
import type { MediaStore } from './storage.js';
import { ResourcePolicy } from './resource-policy.js';
import { AccountDeletion, UPLOAD_TIMEOUT_MS } from './account-deletion.js';
import { logEvent } from './observability.js';
import { TimelineSharing } from './timeline-sharing.js';
import { profileView } from './profile-view.js';
import { UploadReceipts, type UploadCommit } from './upload-receipts.js';

export class JournalService {
  readonly sharing: TimelineSharing;
  constructor(
    private db: Repository,
    private store: MediaStore,
    private resources: ResourcePolicy,
    private deletion: AccountDeletion,
  ) {
    this.sharing = new TimelineSharing(db, deletion);
  }
  private async ownerOf(actor: string, id: string) {
    const owner = await this.db.owner('journal', id);
    if (!owner) throw new NotFoundException('Không tìm thấy dấu mốc.');
    await this.sharing.access(actor, owner);
    return owner;
  }
  private async present(actor: string, owner: string, entry: JournalEntry): Promise<JournalEntry> {
    if (actor === owner) return entry;
    const grant = (await this.sharing.access(actor, owner))!;
    const profile = await profileView(this.db, owner, grant.ownerLabel);
    return {
      ...entry,
      timelineId: owner,
      timelineLabel: profile.displayName,
      timelineAvatarUrl: profile.avatarUrl,
      calendarVisible: grant.showOnCalendar,
    };
  }
  private async withTimeline<T>(actor: string, owner: string, action: () => Promise<T>) {
    const operations: string[] = [];
    try {
      for (const id of [...new Set([actor, owner])].sort())
        operations.push(await this.deletion.begin(id));
      return await this.db.transaction(async () => {
        await this.sharing.lock(owner, actor);
        await this.sharing.access(actor, owner);
        return action();
      });
    } finally {
      for (const operation of operations.reverse()) await this.deletion.end(operation);
    }
  }
  private async guarded<T>(owner: string, action: () => Promise<T>) {
    const operation = await this.deletion.begin(owner);
    try {
      return await action();
    } finally {
      await this.deletion.end(operation);
    }
  }
  async list(owner: string) {
    const entries = (await this.db.list<JournalEntry>('journal', owner)).filter(
      (e) => !e.deletedAt,
    );
    const { grants } = await this.sharing.state(owner);
    for (const grant of grants.filter((g) => g.memberId === owner && g.state === 'active')) {
      await this.sharing.access(owner, grant.timelineOwner);
      entries.push(
        ...(await this.db.list<JournalEntry>('journal', grant.timelineOwner))
          .filter((e) => !e.deletedAt)
          .map((entry) => ({
            ...entry,
            timelineId: grant.timelineOwner,
            timelineLabel: grant.ownerLabel,
            timelineAvatarUrl: grant.ownerAvatarUrl,
            calendarVisible: grant.showOnCalendar,
          })),
      );
    }
    return entries.sort(
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
  async owned(actor: string, id: string) {
    await this.ownerOf(actor, id);
    const entry = await this.db.get<JournalEntry>('journal', id);
    if (!entry || entry.deletedAt) throw new NotFoundException('Không tìm thấy dấu mốc.');
    return entry;
  }
  async read(actor: string, id: string) {
    const owner = await this.ownerOf(actor, id);
    return this.present(actor, owner, await this.owned(actor, id));
  }
  async create(actor: string, body: unknown) {
    const content = journalContentSchema.parse(body);
    const { timelineId } = z.object({ timelineId: z.uuid().optional() }).parse(body);
    const owner = timelineId || actor;
    return this.withTimeline(actor, owner, () =>
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
        await this.checkpoint(owner, actor, entry, 'create');
        return this.present(actor, owner, entry);
      }),
    );
  }
  async save(actor: string, id: string, body: unknown) {
    const owner = await this.ownerOf(actor, id);
    return this.withTimeline(actor, owner, async () => {
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
      await this.checkpoint(owner, owner, current, 'previous');
      if (!(await this.db.compareAndSwap('journal', id, owner, input.expectedRevision, entry)))
        throw new ConflictException(
          'Dấu mốc vừa thay đổi. Tải lại trước khi lưu; nội dung bạn đang nhập vẫn được giữ.',
        );
      await this.checkpoint(owner, actor, entry, 'edit');
      return this.present(actor, owner, entry);
    });
  }
  async remove(actor: string, id: string, body: unknown) {
    return this.withEntry(actor, id, false, async (entry, owner) => {
      const { expectedRevision } = z
        .object({ expectedRevision: z.number().int().nonnegative() })
        .parse(body);
      if (entry.revision !== expectedRevision)
        throw new ConflictException('Dấu mốc vừa thay đổi. Tải lại trước khi xóa.');
      await this.checkpoint(owner, owner, entry, 'previous');
      const next = {
        ...entry,
        revision: entry.revision + 1,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!(await this.db.compareAndSwap('journal', id, owner, expectedRevision, next)))
        throw new ConflictException('Dấu mốc vừa thay đổi.');
      await this.checkpoint(owner, actor, next, 'trash');
      return { ok: true, cleanupPending: false };
    });
  }
  async purge(actor: string, id: string, body: unknown) {
    const owner = await this.ownerOf(actor, id);
    if (actor !== owner) throw new ForbiddenException('Chỉ chủ dòng thời gian được xóa vĩnh viễn.');
    const { expectedRevision } = z
      .object({ expectedRevision: z.number().int().nonnegative() })
      .parse(body);
    const operation = await this.deletion.begin(owner);
    try {
      const entry = await this.withTimeline(actor, owner, async () => {
        const entry = await this.db.get<JournalEntry>('journal', id);
        if (!entry?.deletedAt) throw new BadRequestException('Chuyển dấu mốc vào thùng rác trước.');
        if (entry.revision !== expectedRevision)
          throw new ConflictException('Dấu mốc vừa thay đổi. Tải lại trước khi xóa.');
        const versions = await this.versions(owner, id);
        entry.assets = [
          ...new Map(
            [...entry.assets, ...versions.flatMap((v) => v.snapshot.assets)].map((a) => [a.id, a]),
          ).values(),
        ];
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
        for (const version of versions) await this.db.remove('journal-version', version.id);
        for (const kind of ['journal-comment', 'journal-reaction'])
          await this.db.query('DELETE FROM records WHERE kind=? AND id LIKE ? RETURNING id', [
            kind,
            id + ':%',
          ]);
        return entry;
      });
      const results = await Promise.allSettled(
        entry.assets.map((a) => this.resources.remove('journal/' + a.id + '.jpg')),
      );
      return { ok: true, cleanupPending: results.some((r) => r.status === 'rejected') };
    } finally {
      await this.deletion.end(operation);
    }
  }
  async upload(
    actor: string,
    id: string,
    file: Express.Multer.File | undefined,
    uploadId?: unknown,
  ) {
    await this.owned(actor, id);
    if (!file) throw new BadRequestException('Chọn một ảnh.');
    return new UploadReceipts(this.db, this.deletion).run(
      actor,
      'journal:' + id,
      uploadId,
      file.buffer,
      async (assetId) => {
        const owner = await this.ownerOf(actor, id),
          entry = await this.owned(actor, id);
        return entry.assets.some((a) => a.id === assetId)
          ? this.present(actor, owner, entry)
          : undefined;
      },
      (commit) => this.uploadPhoto(actor, id, file, commit),
    );
  }
  private async uploadPhoto(
    actor: string,
    id: string,
    file: Express.Multer.File,
    commit: UploadCommit,
  ) {
    const started = performance.now();
    const owner = await this.ownerOf(actor, id);
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
    const prepared = performance.now();
    try {
      await this.resources.reserve(owner, key, result.data.length);
      await this.store.put(key, result.data, 'image/jpeg', AbortSignal.timeout(UPLOAD_TIMEOUT_MS));
      const stored = performance.now();
      for (let i = 0; i < 5; i++) {
        const current = await this.owned(actor, id);
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
        const saved = await this.withTimeline(actor, owner, () =>
          commit(assetId, async () => {
            if ((await this.owned(actor, id)).revision !== current.revision) return null;
            await this.checkpoint(owner, owner, current, 'previous');
            if (!(await this.db.compareAndSwap('journal', id, owner, current.revision, entry)))
              return null;
            await this.checkpoint(owner, actor, entry, 'photo');
            return this.present(actor, owner, entry);
          }),
        );
        if (saved) {
          logEvent('image_upload_completed', {
            source: 'milestone',
            bytesReceived: file.size,
            bytesStored: result.data.length,
            prepareMs: Math.round(prepared - started),
            storageMs: Math.round(stored - prepared),
            metadataMs: Math.round(performance.now() - stored),
          });
          return saved;
        }
      }
      throw new ConflictException('Dấu mốc đang thay đổi. Vui lòng tải ảnh lại.');
    } catch (error) {
      try {
        const current = await this.db.get<JournalEntry>('journal', id);
        if (!current?.assets.some((a) => a.id === assetId)) await this.resources.remove(key);
      } catch {
        logEvent('journal_media_cleanup_deferred');
      }
      throw error;
    } finally {
      await this.deletion.end(operation);
    }
  }
  async removeAsset(actor: string, id: string, assetId: string, body: unknown) {
    const owner = await this.ownerOf(actor, id);
    return this.guarded(owner, async () => {
      const saved = await this.withTimeline(actor, owner, async () => {
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
        await this.checkpoint(owner, owner, current, 'previous');
        if (!(await this.db.compareAndSwap('journal', id, owner, expectedRevision, entry)))
          throw new ConflictException('Dấu mốc vừa thay đổi. Vui lòng tải lại.');
        await this.checkpoint(owner, actor, entry, 'remove-photo');
        return this.present(actor, owner, entry);
      });
      return saved;
    });
  }
  async withEntry<T>(
    actor: string,
    id: string,
    trashed: boolean,
    action: (entry: JournalEntry, owner: string) => Promise<T>,
  ) {
    const owner = await this.ownerOf(actor, id);
    return this.withTimeline(actor, owner, async () => {
      const entry = await this.db.get<JournalEntry>('journal', id);
      if (!entry || (!trashed && entry.deletedAt))
        throw new NotFoundException('Không tìm thấy dấu mốc.');
      return action(entry, owner);
    });
  }
  private async versions(owner: string, id: string) {
    return (
      await this.db.query('SELECT payload FROM records WHERE kind=? AND owner=? AND id LIKE ?', [
        'journal-version',
        owner,
        id + ':%',
      ])
    )
      .map((row) => JSON.parse(String(row.payload)) as JournalVersion)
      .sort((a, b) => b.snapshot.revision - a.snapshot.revision);
  }
  private async checkpoint(owner: string, actorId: string, snapshot: JournalEntry, action: string) {
    const versions = await this.versions(owner, snapshot.id);
    if (versions.some((v) => v.snapshot.revision === snapshot.revision)) return;
    const version: JournalVersion = {
      id: snapshot.id + ':' + randomUUID(),
      entryId: snapshot.id,
      actorId,
      action,
      createdAt: new Date().toISOString(),
      snapshot,
    };
    await this.db.insert('journal-version', version.id, owner, version);
    for (const old of [version, ...versions].slice(20))
      await this.db.remove('journal-version', old.id);
  }
  async history(actor: string, id: string) {
    return this.withEntry(actor, id, true, async (_, owner) =>
      Promise.all(
        (await this.versions(owner, id)).map(async (v) => ({
          ...v,
          actorName: (await this.authorView(actor, v.actorId)).displayName,
          snapshot: {
            ...v.snapshot,
            assets: v.snapshot.assets.map((a) => ({
              ...a,
              url: `/api/journal-history/${v.id}/assets/${a.id}`,
            })),
          },
        })),
      ),
    );
  }
  async authorView(actor: string, subject: string) {
    try {
      await this.sharing.profileAccess(actor, subject);
      return profileView(this.db, subject, 'Thành viên');
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      return { displayName: 'Thành viên trước đây', avatarUrl: undefined };
    }
  }
  async trash(actor: string) {
    const owners = [
      actor,
      ...(await this.sharing.state(actor)).grants
        .filter((g) => g.state === 'active' && g.memberId === actor)
        .map((g) => g.timelineOwner),
    ];
    const rows: JournalEntry[] = [];
    for (const owner of owners) {
      await this.sharing.access(actor, owner);
      for (const entry of await this.db.list<JournalEntry>('journal', owner))
        if (entry.deletedAt)
          rows.push({
            ...(await this.present(actor, owner, entry)),
            assets: entry.assets.map((a) => ({
              ...a,
              url: `/api/journal-trash/${entry.id}/assets/${a.id}`,
            })),
          });
    }
    return rows.sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
  }
  async restore(actor: string, id: string, body: unknown, versionId?: string) {
    return this.withEntry(actor, id, true, async (current, owner) => {
      const { expectedRevision } = z
        .object({ expectedRevision: z.number().int().nonnegative() })
        .parse(body);
      if (current.revision !== expectedRevision)
        throw new ConflictException('Dấu mốc vừa thay đổi. Tải lại trước khi khôi phục.');
      if (!versionId && !current.deletedAt)
        throw new BadRequestException('Dấu mốc không ở trong thùng rác.');
      const version = versionId
        ? (await this.versions(owner, id)).find((v) => v.id === versionId)
        : undefined;
      if (versionId && !version) throw new NotFoundException('Phiên bản không còn được giữ.');
      await this.checkpoint(owner, owner, current, 'previous');
      const next: JournalEntry = {
        ...(version?.snapshot || current),
        deletedAt: undefined,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
        assets: (version?.snapshot || current).assets.map((a) => ({
          ...a,
          url: `/api/journal/${id}/assets/${a.id}`,
        })),
      };
      if (!(await this.db.compareAndSwap('journal', id, owner, expectedRevision, next)))
        throw new ConflictException('Dấu mốc vừa thay đổi.');
      await this.checkpoint(owner, actor, next, versionId ? 'restore-version' : 'restore');
      return this.present(actor, owner, next);
    });
  }
  async archivedAsset(actor: string, id: string, assetId: string, history: boolean) {
    if (history) {
      const version = await this.db.get<JournalVersion>('journal-version', id);
      if (!version) throw new NotFoundException();
      return this.withEntry(actor, version.entryId, true, async () => {
        if (!version.snapshot.assets.some((a) => a.id === assetId)) throw new NotFoundException();
        return 'journal/' + assetId + '.jpg';
      });
    }
    return this.withEntry(actor, id, true, async (entry) => {
      if (!entry.deletedAt || !entry.assets.some((a) => a.id === assetId))
        throw new NotFoundException();
      return 'journal/' + assetId + '.jpg';
    });
  }
}
