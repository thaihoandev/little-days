import sharp from 'sharp';
import { HttpException } from '@nestjs/common';
import type { MediaStore } from './storage.js';

/** Bounded, ephemeral derivatives. Call only AFTER checking current asset access. */
export class ImagePreviews {
  private cache = new Map<string, { bytes: Buffer; until: number }>();
  private pending = new Map<string, Promise<Buffer>>();
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private store: MediaStore) {}
  async get(key: string) {
    const old = this.cache.get(key);
    if (old && old.until > Date.now()) {
      this.cache.delete(key);
      this.cache.set(key, old);
      return old.bytes;
    }
    this.cache.delete(key);
    if (this.pending.has(key)) return this.pending.get(key)!;
    if (this.pending.size >= 64)
      throw new HttpException('Ảnh xem nhanh đang bận. Hãy thử lại.', 503);
    const task = this.render(key);
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
  private async render(key: string) {
    if (this.active >= 2) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      const bytes = await sharp(await this.store.read(key, 20 * 1048576), {
        limitInputPixels: 40000000,
      })
        .rotate()
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 70, effort: 2 })
        .toBuffer();
      this.cache.set(key, { bytes, until: Date.now() + 60000 });
      let size = [...this.cache.values()].reduce((sum, row) => sum + row.bytes.length, 0);
      while (this.cache.size > 64 || size > 16 * 1048576) {
        const first = this.cache.keys().next().value!;
        size -= this.cache.get(first)!.bytes.length;
        this.cache.delete(first);
      }
      return bytes;
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
