export type RemovalProgress = { phase: 'download' | 'processing'; loaded: number; total: number };
export function startBackgroundRemoval(image: Blob, onProgress: (value: RemovalProgress) => void) {
  if (
    !globalThis.Worker ||
    !globalThis.WebAssembly ||
    !globalThis.OffscreenCanvas ||
    !globalThis.createImageBitmap
  )
    throw new Error(
      'Trình duyệt chưa hỗ trợ tách nền. Hãy dùng phiên bản Chrome, Edge hoặc Safari mới.',
    );
  const worker = new Worker(new URL('./background-removal.worker.ts', import.meta.url), {
    type: 'module',
  });
  let cancel!: () => void;
  const promise = new Promise<Blob>((resolve, reject) => {
    let finished = false;
    const finish = (result?: Blob, error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const timeout = setTimeout(
      () =>
        finish(undefined, new Error('Tách nền mất quá lâu. Thử ảnh nhỏ hơn hoặc thiết bị khác.')),
      180000,
    );
    cancel = () => finish(undefined, new DOMException('Đã hủy tách nền.', 'AbortError'));
    worker.onerror = () =>
      finish(
        undefined,
        new Error('Không khởi động được bộ tách nền. Hãy tải lại trang hoặc dùng trình duyệt mới.'),
      );
    worker.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'progress') onProgress(data);
      if (data.type === 'done') finish(data.result);
      if (data.type === 'error') finish(undefined, new Error(data.message));
    };
    worker.postMessage({
      image,
      publicPath: new URL('/background-removal/1.7.0/', location.origin).href,
    });
  });
  return { promise, cancel: () => cancel() };
}

/** A small canvas pass trims transparent margins and bakes optional styling into the private copy. */
export async function decorateCutout(blob: Blob, outline: boolean, shadow: boolean) {
  const bitmap = await createImageBitmap(blob);
  try {
    const source = new OffscreenCanvas(bitmap.width, bitmap.height),
      ctx = source.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let left = bitmap.width,
      top = bitmap.height,
      right = -1,
      bottom = -1;
    for (let y = 0; y < bitmap.height; y++)
      for (let x = 0; x < bitmap.width; x++)
        if (data[(y * bitmap.width + x) * 4 + 3] > 8) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
    if (right < left || bottom < top)
      throw new Error('Chưa nhận ra chủ thể trong ảnh. Thử một ảnh có chủ thể rõ hơn.');
    const width = right - left + 1,
      height = bottom - top + 1,
      border = outline ? 5 : 0,
      pad = border + (shadow ? 24 : 3);
    const mask = new OffscreenCanvas(width + pad * 2, height + pad * 2),
      maskContext = mask.getContext('2d')!;
    if (outline) {
      for (let i = 0; i < 24; i++) {
        const angle = (i * Math.PI) / 12;
        maskContext.drawImage(
          source,
          left,
          top,
          width,
          height,
          pad + Math.cos(angle) * border,
          pad + Math.sin(angle) * border,
          width,
          height,
        );
      }
      maskContext.globalCompositeOperation = 'source-in';
      maskContext.fillStyle = '#ffffff';
      maskContext.fillRect(0, 0, mask.width, mask.height);
    } else maskContext.drawImage(source, left, top, width, height, pad, pad, width, height);
    const output = new OffscreenCanvas(mask.width, mask.height),
      out = output.getContext('2d')!;
    if (shadow) {
      out.shadowColor = '#30251f66';
      out.shadowBlur = 10;
      out.shadowOffsetY = 5;
    }
    out.drawImage(mask, 0, 0);
    out.shadowColor = 'transparent';
    out.shadowBlur = 0;
    out.shadowOffsetY = 0;
    out.drawImage(source, left, top, width, height, pad, pad, width, height);
    return await output.convertToBlob({ type: 'image/png' });
  } finally {
    bitmap.close();
  }
}
