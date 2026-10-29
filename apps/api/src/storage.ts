import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { CloudinaryMediaStore } from './cloudinary-storage.js';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Không tìm thấy file.');
  }
}
export type StoredObject = { stream: Readable; size?: number; contentType?: string };
export interface MediaStore {
  readonly kind: 'local' | 's3' | 'cloudinary';
  put(key: string, bytes: Buffer, contentType: string, signal?: AbortSignal): Promise<void>;
  putFile(key: string, source: string, contentType: string, signal?: AbortSignal): Promise<void>;
  get(key: string): Promise<StoredObject>;
  read(key: string, maxBytes?: number): Promise<Buffer>;
  remove(key: string): Promise<void>;
  ready(): Promise<void>;
  close(): void;
}
export function validateObjectKey(key: string): string {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,350}$/.test(key) ||
    key.split('/').some((p) => !p || p === '.' || p === '..')
  )
    throw new Error('Object key không hợp lệ.');
  return key;
}
export async function readLimited(object: StoredObject, maxBytes = 32 * 1024 * 1024) {
  if (object.size !== undefined && object.size > maxBytes) {
    object.stream.destroy();
    throw new Error('File vượt giới hạn đọc.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of object.stream) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      object.stream.destroy();
      throw new Error('File vượt giới hạn đọc.');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size);
}
export class LocalMediaStore implements MediaStore {
  readonly kind = 'local' as const;
  constructor(private root: string) {
    this.root = path.resolve(root);
  }
  private location(key: string) {
    const target = path.resolve(this.root, validateObjectKey(key));
    if (!target.startsWith(this.root + path.sep))
      throw new Error('Object nằm ngoài thư mục dữ liệu.');
    return target;
  }
  async ready() {
    await mkdir(this.root, { recursive: true });
  }
  async put(key: string, bytes: Buffer, _type: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const target = this.location(key),
      temp = `${target}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await writeFile(temp, bytes, { flag: 'wx', signal });
      signal?.throwIfAborted();
      await rename(temp, target);
    } finally {
      await rm(temp, { force: true });
    }
  }
  async putFile(key: string, source: string, type: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const { copyFile } = await import('node:fs/promises');
    const target = this.location(key),
      temp = `${target}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await copyFile(source, temp);
      signal?.throwIfAborted();
      await rename(temp, target);
    } finally {
      await rm(temp, { force: true });
    }
  }
  async get(key: string): Promise<StoredObject> {
    const location = this.location(key);
    try {
      const info = await stat(location);
      if (!info.isFile()) throw new ObjectNotFoundError();
      return { stream: createReadStream(location), size: info.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ObjectNotFoundError();
      throw error;
    }
  }
  async read(key: string, maxBytes?: number) {
    return readLimited(await this.get(key), maxBytes);
  }
  async remove(key: string) {
    await rm(this.location(key), { force: true });
  }
  close() {}
}

export type S3Options = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  prefix?: string;
};
export class S3MediaStore implements MediaStore {
  readonly kind = 's3' as const;
  private client: S3Client;
  private prefix: string;
  constructor(private options: S3Options) {
    if (!options.bucket || !options.accessKeyId || !options.secretAccessKey)
      throw new Error('Cấu hình S3 thiếu bucket hoặc access keys.');
    this.prefix = options.prefix ? `${validateObjectKey(options.prefix.replace(/\/$/, ''))}/` : '';
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle ?? false,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      maxAttempts: 3,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  private key(key: string) {
    return this.prefix + validateObjectKey(key);
  }
  async ready() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
  }
  async put(key: string, bytes: Buffer, contentType: string, signal?: AbortSignal) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: this.key(key),
        Body: bytes,
        ContentType: contentType,
        ContentLength: bytes.length,
      }),
      { abortSignal: signal },
    );
  }
  async putFile(key: string, source: string, contentType: string, signal?: AbortSignal) {
    const info = await stat(source);
    const stream = createReadStream(source);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: this.key(key),
          Body: stream,
          ContentType: contentType,
          ContentLength: info.size,
        }),
        { abortSignal: signal },
      );
    } finally {
      stream.destroy();
    }
  }
  async get(key: string): Promise<StoredObject> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: this.key(key) }),
      );
      if (!response.Body) throw new ObjectNotFoundError();
      return {
        stream: response.Body as Readable,
        size: response.ContentLength,
        contentType: response.ContentType,
      };
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode === 404)
        throw new ObjectNotFoundError();
      throw error;
    }
  }
  async read(key: string, maxBytes?: number) {
    return readLimited(await this.get(key), maxBytes);
  }
  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: this.key(key) }),
    );
  }
  close() {
    this.client.destroy();
  }
}
export function createMediaStore(dataDir: string): MediaStore {
  const driver = process.env.STORAGE_DRIVER || 'local';
  if (driver === 'local') return new LocalMediaStore(dataDir);
  if (driver === 'cloudinary')
    return new CloudinaryMediaStore({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      apiKey: process.env.CLOUDINARY_API_KEY || '',
      apiSecret: process.env.CLOUDINARY_API_SECRET || '',
      folder: process.env.CLOUDINARY_FOLDER || 'little-days',
      apiBaseUrl: process.env.CLOUDINARY_API_BASE_URL || undefined,
    });
  if (driver !== 's3') throw new Error('STORAGE_DRIVER phải là local, cloudinary hoặc s3.');
  return new S3MediaStore({
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    prefix: process.env.S3_PREFIX || 'little-days',
  });
}
