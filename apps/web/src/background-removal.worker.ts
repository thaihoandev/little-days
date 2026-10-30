import { removeBackground } from '@imgly/background-removal';
const downloads = new Map<string, number>();
globalThis.onmessage = async (event: MessageEvent<{ image: Blob; publicPath: string }>) => {
  try {
    const bitmap = await createImageBitmap(event.data.image);
    const factor = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * factor)),
      Math.max(1, Math.round(bitmap.height * factor)),
    );
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const input = await canvas.convertToBlob({ type: 'image/png' });
    const result = await removeBackground(input, {
      model: 'isnet_quint8',
      device: 'cpu',
      proxyToWorker: false,
      publicPath: event.data.publicPath,
      fetchArgs: { cache: 'force-cache' },
      output: { format: 'image/png', quality: 1 },
      progress: (key, current, total) => {
        if (key.startsWith('fetch:')) {
          downloads.set(key, current);
          globalThis.postMessage({
            type: 'progress',
            phase: 'download',
            loaded: [...downloads.values()].reduce((a, b) => a + b, 0),
            total: 56194294,
          });
        } else
          globalThis.postMessage({ type: 'progress', phase: 'processing', loaded: current, total });
      },
    });
    globalThis.postMessage({ type: 'done', result });
  } catch (error) {
    if (import.meta.env.DEV) console.error('Background removal failed in worker', error);
    globalThis.postMessage({
      type: 'error',
      message:
        'Chưa tách được nền trên thiết bị này. Hãy thử ảnh nhỏ hơn hoặc dùng trình duyệt mới.',
    });
  }
};
