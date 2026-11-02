import { ConflictException, GoneException, HttpException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Repository } from './database.js';
import { AccountDeletion } from './account-deletion.js';

type Receipt = { hash: string; token: string; until: number; assetId?: string };
export type UploadCommit = <T>(assetId: string, action: () => Promise<T>) => Promise<T>;
/** A receipt and its asset metadata commit together; a stale attempt cannot publish. */
export class UploadReceipts {
  constructor(
    private db: Repository,
    private deletion: AccountDeletion,
  ) {}
  private id(actor: string, target: string, uploadId: unknown) {
    return createHash('sha256')
      .update(actor + ':' + target + ':' + z.uuid().parse(uploadId))
      .digest('hex');
  }
  async status<T>(
    actor: string,
    target: string,
    uploadId: unknown,
    hash: unknown,
    read: (assetId: string) => Promise<T | undefined>,
  ) {
    const digest = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(hash);
    const receipt = await this.db.get<Receipt>('upload-receipt', this.id(actor, target, uploadId));
    if (!receipt) return { state: 'missing' as const };
    if (receipt.hash !== digest)
      throw new ConflictException('Mã tải ảnh đã được dùng cho nội dung khác.');
    if (!receipt.assetId)
      return {
        state: receipt.until > (await this.db.now()) ? ('pending' as const) : ('missing' as const),
      };
    const result = await read(receipt.assetId);
    if (!result)
      throw new GoneException('Ảnh của lần tải này đã được xóa. Chọn ảnh lại để tạo lần tải mới.');
    return { state: 'completed' as const, result };
  }
  async run<T>(
    actor: string,
    target: string,
    uploadId: unknown,
    bytes: Buffer,
    read: (assetId: string) => Promise<T | undefined>,
    action: (commit: UploadCommit) => Promise<T>,
  ): Promise<T> {
    if (uploadId === undefined) return action(async (_, fn) => fn());
    const id = this.id(actor, target, uploadId);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const operation = await this.deletion.begin(actor);
    const lock = async () => {
      if (this.db.driver === 'postgresql')
        await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', ['upload:' + id]);
    };
    try {
      const receipt = await this.db.transaction(async () => {
        await lock();
        const existing = await this.db.get<Receipt>('upload-receipt', id);
        const now = await this.db.now();
        if (existing && existing.hash !== hash)
          throw new ConflictException('Mã tải ảnh đã được dùng cho nội dung khác.');
        if (existing?.assetId) return existing;
        if (existing && existing.until > now)
          throw new HttpException(
            { message: 'Ảnh đang được lưu. Hãy chờ rồi thử lại.', code: 'UPLOAD_PENDING' },
            409,
          );
        // Bound receipt retention without depending on an in-memory process cache.
        await this.db.query(
          'DELETE FROM records WHERE kind=? AND owner=? AND id IN (SELECT id FROM records WHERE kind=? AND owner=? AND revision<?) RETURNING id',
          [
            'upload-receipt',
            actor,
            'upload-receipt',
            actor,
            Math.floor((now - 7 * 86400000) / 1000),
          ],
        );
        const next: Receipt = { hash, token: randomUUID(), until: now + 240000 };
        await this.db.put('upload-receipt', id, actor, next, Math.floor(now / 1000));
        return next;
      });
      if (receipt.assetId) {
        const value = await read(receipt.assetId);
        if (!value)
          throw new GoneException(
            'Ảnh của lần tải này đã được xóa. Chọn ảnh lại để tạo lần tải mới.',
          );
        return value;
      }
      const commit: UploadCommit = (assetId, fn) =>
        this.db.transaction(async () => {
          await lock();
          const current = await this.db.get<Receipt>('upload-receipt', id);
          if (
            !current ||
            current.token !== receipt.token ||
            current.assetId ||
            current.until <= (await this.db.now())
          )
            throw new ConflictException('Lần tải ảnh đã hết hạn. Hãy thử lại.');
          const result = await fn();
          // A retryable metadata CAS conflict must not mark the receipt complete.
          if (result !== null)
            await this.db.put(
              'upload-receipt',
              id,
              actor,
              { ...current, assetId },
              Math.floor((await this.db.now()) / 1000),
            );
          return result;
        });
      try {
        return await action(commit);
      } catch (error) {
        await this.db
          .transaction(async () => {
            await lock();
            const current = await this.db.get<Receipt>('upload-receipt', id);
            if (current?.token === receipt.token && !current.assetId)
              await this.db.remove('upload-receipt', id);
          })
          .catch(() => {});
        throw error;
      }
    } finally {
      await this.deletion.end(operation);
    }
  }
}
