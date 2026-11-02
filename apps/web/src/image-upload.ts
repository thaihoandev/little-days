import { api, ApiError } from './api.js';

export type UploadProgress = {
  phase: 'prepare' | 'upload' | 'save';
  loaded: number;
  total: number;
};
let preparationQueue: Promise<unknown> = Promise.resolve();
let receiptSupport = false;
export function configureUploads(enabled: boolean) {
  receiptSupport = enabled;
}
const preparedFiles = new WeakMap<File, Map<number, Promise<File>>>();
const memoryReceipts = new Map<string, { id: string; until: number }>();
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
  let prepared = preparedFiles.get(source);
  if (!prepared) {
    prepared = new Map();
    preparedFiles.set(source, prepared);
  }
  if (!prepared.has(maxEdge)) prepared.set(maxEdge, prepareImage(source, maxEdge));
  const file = await prepared.get(maxEdge)!,
    body = new FormData();
  body.append('file', file);
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  const reliable = receiptSupport && /^\/(albums|journal)\/[0-9a-f-]+\/assets$/.test(path);
  let receiptKey = '',
    uploadId = '',
    digestHex = '',
    reused = false;
  if (reliable) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    digestHex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const identity = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify([source.name, source.size, source.lastModified])),
    );
    const identityHex = Array.from(new Uint8Array(identity), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    receiptKey = 'little-days-upload:' + path + ':' + digestHex + ':' + identityHex;
    try {
      const old = JSON.parse(sessionStorage.getItem(receiptKey) || 'null');
      uploadId = old && old.until > Date.now() ? old.id : '';
    } catch {
      /* A retry within this call still uses one token when storage is blocked. */
    }
    const cached = memoryReceipts.get(receiptKey);
    reused = !!uploadId || !!(cached && cached.until > Date.now());
    uploadId ||= cached && cached.until > Date.now() ? cached.id : crypto.randomUUID();
    for (const [key, value] of memoryReceipts)
      if (value.until < Date.now()) memoryReceipts.delete(key);
    memoryReceipts.set(receiptKey, { id: uploadId, until: Date.now() + 86400000 });
    try {
      sessionStorage.setItem(
        receiptKey,
        JSON.stringify({ id: uploadId, until: Date.now() + 86400000 }),
      );
    } catch {}
  }
  const send = () =>
    new Promise<T>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', '/api' + path);
      request.withCredentials = true;
      request.timeout = 180000;
      if (uploadId) request.setRequestHeader('X-Upload-Id', uploadId);
      request.upload.onprogress = (event) =>
        progress?.({
          phase: event.lengthComputable && event.loaded === event.total ? 'save' : 'upload',
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : file.size,
        });
      request.onerror = () =>
        reject(new ApiError(0, 'Kết nối bị gián đoạn. Bạn có thể thử lại ảnh chưa tải xong.'));
      request.ontimeout = () =>
        reject(new ApiError(0, 'Máy chủ phản hồi quá lâu. Bạn có thể thử lại ảnh chưa tải xong.'));
      request.onload = () => {
        let data: any;
        try {
          data = JSON.parse(request.responseText);
        } catch {
          reject(
            new ApiError(
              request.status >= 500 ? request.status : 0,
              'Chưa nhận được kết quả tải ảnh. Hãy thử lại.',
            ),
          );
          return;
        }
        if (request.status < 200 || request.status >= 300) {
          reject(
            new ApiError(
              request.status,
              Array.isArray(data.message)
                ? data.message.join(', ')
                : data.message || 'Chưa tải được ảnh.',
              data.code,
            ),
          );
          return;
        }
        resolve(data as T);
      };
      request.send(body);
    });
  for (let attempt = 0; ; attempt++) {
    try {
      let result: T;
      if (reliable && (attempt > 0 || reused)) {
        const status = await api<{ state: 'missing' | 'pending' | 'completed'; result?: T }>(
          path.replace(/\/assets$/, '/uploads/') + uploadId + '?sha256=' + digestHex,
          { signal: AbortSignal.timeout(20000) },
        );
        if (status.state === 'pending')
          throw new ApiError(
            409,
            'Ảnh vẫn đang được lưu. Hãy thử lại sau ít giây.',
            'UPLOAD_PENDING',
          );
        result = status.state === 'completed' ? status.result! : await send();
      } else result = await send();
      if (receiptKey)
        try {
          sessionStorage.removeItem(receiptKey);
        } catch {}
      memoryReceipts.delete(receiptKey);
      preparedFiles.delete(source);
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        memoryReceipts.delete(receiptKey);
        try {
          sessionStorage.removeItem(receiptKey);
        } catch {}
      }
      const transient =
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === 'TimeoutError') ||
        (error instanceof ApiError &&
          (error.status === 0 ||
            [500, 502, 503, 504].includes(error.status) ||
            error.code === 'UPLOAD_PENDING'));
      if (!reliable || !transient || attempt >= 3) throw error;
      progress?.({ phase: 'save', loaded: file.size, total: file.size });
      await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 1000 * 2 ** attempt)));
    }
  }
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
