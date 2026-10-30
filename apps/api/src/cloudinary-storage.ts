import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';
import {
  ObjectNotFoundError,
  readLimited,
  validateObjectKey,
  type MediaStore,
  type StoredObject,
} from './storage.js';

export type CloudinaryOptions = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder?: string;
  apiBaseUrl?: string;
};
export function cloudinaryObject(key: string, folder = 'little-days') {
  validateObjectKey(key);
  const match = key.match(/\.(webp|jpg|mp4|mp3)$/);
  if (!match)
    throw new Error('Cloudinary chỉ lưu ảnh WebP/JPEG, video MP4 và nhạc MP3 của ứng dụng.');
  if (match[1] === 'jpg' && !/^journal\/[a-f0-9-]{36}\.jpg$/i.test(key))
    throw new Error('JPEG chỉ dùng cho ảnh dấu mốc của ứng dụng.');
  const prefix = folder ? `${validateObjectKey(folder.replace(/\/$/, ''))}/` : '';
  const publicId = prefix + key.slice(0, -match[0].length);
  if (publicId.length > 255) throw new Error('Cloudinary public ID vượt 255 ký tự.');
  return {
    publicId,
    format: match[1],
    resourceType: ['webp', 'jpg'].includes(match[1]) ? ('image' as const) : ('video' as const),
  };
}
export class CloudinaryMediaStore implements MediaStore {
  readonly kind = 'cloudinary' as const;
  private agents = new Set<HttpAgent | HttpsAgent>();
  private readyUntil = 0;
  private common: UploadApiOptions;
  constructor(private options: CloudinaryOptions) {
    const missing = [
      ['CLOUDINARY_CLOUD_NAME', options.cloudName],
      ['CLOUDINARY_API_KEY', options.apiKey],
      ['CLOUDINARY_API_SECRET', options.apiSecret],
    ]
      .filter(([, value]) => !value || /^(replace[-_]?me|your[-_]|change[-_]?me)/i.test(value))
      .map(([name]) => name);
    if (missing.length)
      throw new Error(
        `Điền ${missing.join(', ')} trong .env để dùng Cloudinary. Hoặc đặt STORAGE_DRIVER=local để chạy không cần cloud.`,
      );
    if (!/^[a-zA-Z0-9_-]+$/.test(options.cloudName))
      throw new Error('CLOUDINARY_CLOUD_NAME không hợp lệ.');
    const endpoint = new URL(options.apiBaseUrl || 'https://api.cloudinary.com');
    if (
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      !(
        endpoint.protocol === 'https:' ||
        (endpoint.protocol === 'http:' &&
          ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))
      )
    )
      throw new Error('Cloudinary endpoint phải dùng HTTPS (HTTP chỉ dành cho fixture localhost).');
    cloudinaryObject('uploads/check.webp', options.folder);
    this.common = {
      cloud_name: options.cloudName,
      api_key: options.apiKey,
      api_secret: options.apiSecret,
      upload_prefix: endpoint.href.replace(/\/$/, ''),
      secure: true,
      signature_algorithm: 'sha256',
      timeout: 60000,
    };
  }
  async ready() {
    if (Date.now() < this.readyUntil) return;
    try {
      await cloudinary.api.ping(this.common);
      this.readyUntil = Date.now() + 60000;
    } catch {
      throw new Error(
        'Không kết nối được Cloudinary. Kiểm tra CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY và CLOUDINARY_API_SECRET trong .env.',
      );
    }
  }
  private async upload(key: string, input: Readable, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const object = cloudinaryObject(key, this.options.folder);
    const agent = String(this.common.upload_prefix).startsWith('http:')
      ? new HttpAgent({ keepAlive: false })
      : new HttpsAgent({ keepAlive: false });
    this.agents.add(agent);
    const options: UploadApiOptions = {
      ...this.common,
      agent,
      resource_type: object.resourceType,
      public_id: object.publicId,
      type: 'authenticated',
      overwrite: false,
      unique_filename: false,
      use_filename: false,
      chunk_size: 6 * 1024 * 1024,
    };
    let abort: () => void = () => {};
    try {
      let stream!: ReturnType<typeof cloudinary.uploader.upload_stream>;
      const result = new Promise<UploadApiResponse>((resolve, reject) => {
        const callback = (error: unknown, response?: UploadApiResponse) => {
          if (error || !response) {
            reject(
              new Error(
                'Cloudinary không nhận được file. Kiểm tra cấu hình, định dạng và hạn mức tài khoản.',
              ),
            );
            return;
          }
          if (
            response.public_id !== object.publicId ||
            response.resource_type !== object.resourceType ||
            response.type !== 'authenticated'
          ) {
            reject(new Error('Cloudinary trả asset không khớp chế độ riêng tư hoặc public ID.'));
            return;
          }
          resolve(response);
        };
        stream =
          object.resourceType === 'video'
            ? cloudinary.uploader.upload_chunked_stream(options, callback)
            : cloudinary.uploader.upload_stream(options, callback);
        abort = () => {
          const error =
            signal?.reason instanceof Error
              ? signal.reason
              : new Error('Đã hủy upload Cloudinary.');
          agent.destroy();
          input.destroy(error);
          stream.destroy(error);
          reject(error);
        };
        signal?.addEventListener('abort', abort, { once: true });
      });
      // Await both completion signals: writing the multipart body alone is not upload success.
      await Promise.all([pipeline(input, stream), result]);
      signal?.throwIfAborted();
    } finally {
      signal?.removeEventListener('abort', abort);
      agent.destroy();
      this.agents.delete(agent);
      input.destroy();
    }
  }
  async put(key: string, bytes: Buffer, _type: string, signal?: AbortSignal) {
    await this.upload(key, Readable.from([bytes]), signal);
  }
  async putFile(key: string, source: string, _type: string, signal?: AbortSignal) {
    cloudinaryObject(key, this.options.folder);
    signal?.throwIfAborted();
    await this.upload(key, createReadStream(source), signal);
  }
  async get(key: string): Promise<StoredObject> {
    const object = cloudinaryObject(key, this.options.folder);
    const url = cloudinary.utils.private_download_url(object.publicId, object.format, {
      ...this.common,
      resource_type: object.resourceType,
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      attachment: false,
    });
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    } catch {
      throw new Error('Không tải được file riêng tư từ Cloudinary.');
    }
    if (response.status === 404) {
      await response.body?.cancel();
      throw new ObjectNotFoundError();
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error('Cloudinary từ chối tải file. Kiểm tra quyền và cấu hình tài khoản.');
    }
    const length = response.headers.get('content-length');
    return {
      stream: Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
      size: length !== null && /^\d+$/.test(length) ? Number(length) : undefined,
      contentType: response.headers.get('content-type') || undefined,
    };
  }
  async read(key: string, maxBytes?: number) {
    return readLimited(await this.get(key), maxBytes);
  }
  async remove(key: string) {
    const object = cloudinaryObject(key, this.options.folder);
    try {
      const result = await cloudinary.uploader.destroy(object.publicId, {
        ...this.common,
        resource_type: object.resourceType,
        type: 'authenticated',
        invalidate: true,
      });
      if (!['ok', 'not found'].includes(result.result))
        throw new Error('Unexpected deletion response');
    } catch {
      throw new Error('Không xóa được file Cloudinary. Kiểm tra kết nối và quyền tài khoản.');
    }
  }
  close() {
    for (const agent of this.agents) agent.destroy();
    this.agents.clear();
  }
}
