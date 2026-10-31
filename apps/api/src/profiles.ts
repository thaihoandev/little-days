import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { Repository } from './database.js';
import type { MediaStore } from './storage.js';
import { ResourcePolicy } from './resource-policy.js';
import { AccountDeletion, UPLOAD_TIMEOUT_MS } from './account-deletion.js';
import type { TimelineSharing } from './timeline-sharing.js';
import { profileView, type StoredProfile } from './profile-view.js';
import { logEvent } from './observability.js';

export class ProfileService {
  constructor(
    private db: Repository,
    private store: MediaStore,
    private resources: ResourcePolicy,
    private deletion: AccountDeletion,
    private sharing: TimelineSharing,
  ) {}
  private async account(owner: string) {
    const account = (
      await this.db.list<{ email: string; deletingAt?: string }>('account', owner)
    )[0];
    if (!account || account.deletingAt || (await this.deletion.blocked(owner)))
      throw new UnauthorizedException('Đăng nhập để cập nhật hồ sơ.');
    return account;
  }
  private async write(owner: string, expected: number, next: StoredProfile) {
    await this.sharing.lock(owner);
    await this.account(owner);
    const saved =
      expected === -1
        ? await this.db.insert('profile', owner, owner, next)
        : await this.db.compareAndSwap('profile', owner, owner, expected, next);
    if (!saved)
      throw new ConflictException(
        'Hồ sơ vừa thay đổi. Tải lại trước khi lưu; nội dung đang nhập được giữ.',
      );
  }
  async save(owner: string, body: unknown) {
    const input = z
        .object({
          displayName: z.string().trim().min(1).max(60),
          expectedRevision: z.number().int().min(-1),
        })
        .parse(body),
      op = await this.deletion.begin(owner);
    try {
      return await this.db.transaction(async () => {
        const current = await this.db.get<StoredProfile>('profile', owner);
        await this.write(owner, input.expectedRevision, {
          ...current,
          displayName: input.displayName,
          revision: input.expectedRevision + 1,
        });
        return profileView(this.db, owner);
      });
    } finally {
      await this.deletion.end(op);
    }
  }
  async upload(owner: string, file: Express.Multer.File | undefined, body: unknown) {
    const account = await this.account(owner),
      { expectedRevision } = z
        .object({ expectedRevision: z.coerce.number().int().min(-1) })
        .parse(body);
    if (!file || file.size > 20 * 1048576)
      throw new BadRequestException('Chọn ảnh JPEG, PNG hoặc WebP tối đa 20 MB.');
    let bytes: Buffer;
    try {
      const source = sharp(file.buffer, { limitInputPixels: 40000000 });
      const metadata = await source.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format || '')) throw new Error();
      bytes = await source
        .rotate()
        .resize(256, 256, { fit: 'cover', position: 'attention' })
        .webp({ quality: 80, effort: 2 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'Ảnh đại diện không hợp lệ. Dùng JPEG, PNG hoặc WebP tối đa 40 megapixel.',
      );
    }
    const id = randomUUID(),
      key = 'uploads/' + id + '.webp',
      op = await this.deletion.begin(owner, key);
    let committed = false;
    try {
      await this.resources.reserve(owner, key, bytes.length);
      await this.store.put(key, bytes, 'image/webp', AbortSignal.timeout(UPLOAD_TIMEOUT_MS));
      let old: StoredProfile['avatar'];
      const view = await this.db.transaction(async () => {
        await this.sharing.lock(owner);
        await this.account(owner);
        const current = await this.db.get<StoredProfile>('profile', owner);
        old = current?.avatar;
        if (old) await this.deletion.track(op, ['uploads/' + old.id + '.webp']);
        await this.write(owner, expectedRevision, {
          displayName: current?.displayName || account.email.split('@')[0],
          avatar: {
            id,
            name: 'Ảnh đại diện',
            url: `/api/profiles/${owner}/avatar?v=${id}`,
            width: 256,
            height: 256,
            bytes: bytes.length,
          },
          revision: expectedRevision + 1,
        });
        return profileView(this.db, owner);
      });
      committed = true;
      if (old)
        await this.resources
          .remove('uploads/' + old.id + '.webp')
          .catch(() => logEvent('profile_media_cleanup_deferred'));
      return view;
    } catch (error) {
      if (!committed)
        await this.resources.remove(key).catch(() => logEvent('profile_media_cleanup_deferred'));
      throw error;
    } finally {
      await this.deletion.end(op);
    }
  }
  async avatar(actor: string, owner: string) {
    await this.sharing.profileAccess(actor, owner);
    const profile = await this.db.get<StoredProfile>('profile', owner);
    if (!profile?.avatar) throw new NotFoundException('Chưa có ảnh đại diện.');
    return 'uploads/' + profile.avatar.id + '.webp';
  }
}
