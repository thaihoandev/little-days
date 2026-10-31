import { ApiError } from './api.js';

export type UploadProgress = {
  phase: 'prepare' | 'upload' | 'save';
  loaded: number;
  total: number;
};
let preparationQueue: Promise<unknown> = Promise.resolve();
/** Decode at most one large image at a time, while other requests can upload concurrently. */
export function prepareImage(file: File, maxEdge = 1600): Promise<File> {
  const task = preparationQueue
    .catch(() => {})
    .then(async () => {
      if (file.size > 20 * 1048576) throw new Error('Chọn ảnh tối đa 20 MB.');
      if (
        file.size <= 128 * 1024 ||
        file.size > 20 * 1048576 ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        !globalThis.createImageBitmap
      )
        return file;
      let image: ImageBitmap | undefined;
      try {
        image = await createImageBitmap(file);
        if (image.width * image.height > 40000000) throw new Error('Ảnh vượt quá 40 megapixel.');
        const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
        let blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/webp', 0.84),
        );
        if (blob && blob.size > 700 * 1024 && maxEdge > 1280) {
          const smaller = Math.min(1, 1280 / Math.max(image.width, image.height));
          canvas.width = Math.max(1, Math.round(image.width * smaller));
          canvas.height = Math.max(1, Math.round(image.height * smaller));
          canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
          blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/webp', 0.76),
          );
        }
        canvas.width = canvas.height = 1;
        return blob && blob.size < file.size * 0.92
          ? new File([blob], file.name, { type: blob.type, lastModified: file.lastModified })
          : file;
      } catch (error) {
        if (image && image.width * image.height > 40000000) throw error;
        return file;
      } finally {
        image?.close();
      }
    });
  preparationQueue = task;
  return task;
}
export async function uploadImage<T>(
  path: string,
  source: File,
  progress?: (value: UploadProgress) => void,
  fields: Record<string, string> = {},
  maxEdge = 1600,
): Promise<T> {
  progress?.({ phase: 'prepare', loaded: 0, total: source.size });
  const file = await prepareImage(source, maxEdge),
    body = new FormData();
  body.append('file', file);
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api' + path);
    request.withCredentials = true;
    request.timeout = 180000;
    request.upload.onprogress = (event) =>
      progress?.({
        phase: event.lengthComputable && event.loaded === event.total ? 'save' : 'upload',
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : file.size,
      });
    request.onerror = () =>
      reject(
        new Error('Kết nối bị gián đoạn. Tải lại thư viện để kiểm tra ảnh trước khi thử lại.'),
      );
    request.ontimeout = () =>
      reject(
        new Error('Máy chủ phản hồi quá lâu. Tải lại thư viện để kiểm tra ảnh trước khi thử lại.'),
      );
    request.onload = () => {
      let data: any;
      try {
        data = JSON.parse(request.responseText);
      } catch {
        reject(new Error('Chưa nhận được kết quả tải ảnh. Hãy tải lại thư viện.'));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        reject(
          new ApiError(
            request.status,
            Array.isArray(data.message)
              ? data.message.join(', ')
              : data.message || 'Chưa tải được ảnh.',
          ),
        );
        return;
      }
      resolve(data as T);
    };
    request.send(body);
  });
}
export async function uploadBatch<T extends { revision: number }>(
  files: File[],
  send: (file: File, index: number) => Promise<T>,
) {
  const results: { file: File; result?: T; error?: Error }[] = new Array(files.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, files.length) }, async () => {
      while (cursor < files.length) {
        const index = cursor++;
        try {
          results[index] = { file: files[index], result: await send(files[index], index) };
        } catch (error) {
          results[index] = { file: files[index], error: error as Error };
        }
      }
    }),
  );
  return {
    results,
    latest: results
      .map((r) => r.result)
      .filter((r): r is T => !!r)
      .sort((a, b) => b.revision - a.revision)[0],
  };
}
