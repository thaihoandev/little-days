import { createHash } from 'node:crypto';
import path from 'node:path';
import type { MediaStore } from './storage.js';
export function storageIdentity(store: MediaStore, dataDir: string) {
  const env = process.env;
  return createHash('sha256')
    .update(
      JSON.stringify(
        store.kind === 'local'
          ? { kind: store.kind, root: path.resolve(dataDir) }
          : store.kind === 'cloudinary'
            ? {
                kind: store.kind,
                cloud: env.CLOUDINARY_CLOUD_NAME,
                folder: env.CLOUDINARY_FOLDER || 'little-days',
                endpoint: env.CLOUDINARY_API_BASE_URL,
              }
            : {
                kind: store.kind,
                bucket: env.S3_BUCKET,
                prefix: env.S3_PREFIX || 'little-days',
                endpoint: env.S3_ENDPOINT,
              },
      ),
    )
    .digest('hex');
}
