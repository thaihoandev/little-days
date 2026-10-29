import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { JobRenderer } from './render.js';
import { ObjectNotFoundError, type MediaStore } from './storage.js';
export class PermanentRenderError extends Error {}
export function createRenderer(store: MediaStore): JobRenderer {
  let bundled: Promise<string> | undefined;
  return async (job, context) => {
    const assetData: Record<string, string> = {};
    const required = new Set(
      job.snapshot.pages
        .filter((p) => job.config.pageIds.includes(p.id))
        .flatMap((p) => p.elements.filter((e) => e.type === 'image').map((e) => e.assetId)),
    );
    for (const id of required) {
      context.signal.throwIfAborted();
      if (!id) continue;
      if (/^demo-[123]$/.test(id)) {
        const svg = await readFile(path.resolve('apps/web/public/illustrations', `${id}.svg`));
        assetData[id] = `data:image/svg+xml;base64,${svg.toString('base64')}`;
      } else {
        if (!job.snapshot.assets.some((a) => a.id === id))
          throw new PermanentRenderError('Ảnh trong snapshot không tồn tại.');
        try {
          const bytes = await store.read(`uploads/${id}.webp`);
          assetData[id] = `data:image/webp;base64,${bytes.toString('base64')}`;
        } catch (error) {
          if (error instanceof ObjectNotFoundError)
            throw new PermanentRenderError('File ảnh không còn tồn tại.');
          throw error;
        }
      }
    }
    let audioSrc: string | undefined;
    if (job.config.musicId === 'gentle')
      audioSrc =
        'data:audio/wav;base64,' +
        (await readFile(path.resolve('apps/web/public/audio/gentle.wav'))).toString('base64');
    if (job.config.musicId === 'custom') {
      if (
        !job.audioAsset ||
        job.audioAsset.id !== job.config.audioId ||
        job.audioAsset.albumId !== job.albumId
      )
        throw new PermanentRenderError('Nhạc không thuộc snapshot của album.');
      try {
        const audio = await store.read('audio/' + job.audioAsset.id + '.mp3', 20 * 1024 * 1024);
        audioSrc = 'data:audio/mpeg;base64,' + audio.toString('base64');
      } catch (error) {
        if (error instanceof ObjectNotFoundError)
          throw new PermanentRenderError('File nhạc không còn tồn tại.');
        throw error;
      }
    }
    const inputProps = {
      album: job.snapshot,
      config: job.config,
      referenceDate: job.referenceDate,
      assetData,
      audioSrc,
    };
    bundled ??= bundle({
      entryPoint: path.resolve('packages/video/index.tsx'),
      webpackOverride: (config) => ({
        ...config,
        resolve: { ...config.resolve, extensionAlias: { '.js': ['.ts', '.tsx', '.js'] } },
      }),
    }).catch((error) => {
      bundled = undefined;
      throw error;
    });
    const serveUrl = await bundled;
    context.signal.throwIfAborted();
    const { cancel, cancelSignal } = makeCancelSignal();
    const onAbort = () => cancel();
    context.signal.addEventListener('abort', onAbort, { once: true });
    const file = path.join(context.workspace, 'output.mp4');
    try {
      const composition = await selectComposition({ serveUrl, id: 'CoupleRecap', inputProps });
      context.signal.throwIfAborted();
      context.progress(10);
      let previous = 10;
      await renderMedia({
        serveUrl,
        composition,
        inputProps,
        codec: 'h264',
        audioCodec: 'aac',
        outputLocation: file,
        concurrency: 2,
        cancelSignal,
        crf: 23,
        onProgress: ({ progress }) => {
          const percent = 10 + Math.floor(progress * 85);
          if (percent > previous) {
            previous = percent;
            context.progress(percent);
          }
        },
      });
      return file;
    } finally {
      context.signal.removeEventListener('abort', onAbort);
    }
  };
}
