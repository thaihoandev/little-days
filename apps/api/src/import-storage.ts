import type { StorageEngine } from 'multer';
import { MulterError } from 'multer';
import { ARCHIVE_MAX_BYTES } from '../../../packages/domain/archive.js';
/** Bound the aggregate while receiving, before buffering all multipart files. */
export function importMemoryStorage(): StorageEngine {
  const totals = new WeakMap<object, number>();
  return {
    _handleFile(req, file, callback) {
      let chunks: Buffer[] = [],
        size = 0,
        done = false;
      const fail = (error: Error) => {
        if (done) return;
        done = true;
        chunks = [];
        callback(error);
      };
      file.stream.on('error', fail);
      file.stream.on('data', (chunk: Buffer) => {
        if (done) return;
        const total = (totals.get(req) || 0) + chunk.length;
        totals.set(req, total);
        if (total > ARCHIVE_MAX_BYTES) {
          fail(new MulterError('LIMIT_FILE_SIZE'));
          return;
        }
        size += chunk.length;
        chunks.push(chunk);
      });
      file.stream.on('end', () => {
        if (done) return;
        done = true;
        callback(null, { buffer: Buffer.concat(chunks, size), size });
        chunks = [];
      });
    },
    _removeFile(_req, file, callback) {
      delete (file as Partial<Express.Multer.File>).buffer;
      callback(null);
    },
  };
}
