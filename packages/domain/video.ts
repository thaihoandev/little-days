import type { VideoConfig } from './index.js';

export function videoDurationFrames(config: VideoConfig, fps = 30) {
  return config.sceneDurations
    ? fps * 5 +
        config.pageIds.reduce(
          (sum, id) => sum + Math.round((config.sceneDurations?.[id] ?? 1) * fps),
          0,
        )
    : config.seconds * fps;
}
export function sceneTimeline(config: VideoConfig, fps = 30) {
  const available = videoDurationFrames(config, fps) - 5 * fps;
  let cursor = 2 * fps;
  return config.pageIds.map((pageId, index) => {
    const durationInFrames = config.sceneDurations
      ? Math.round((config.sceneDurations[pageId] ?? 1) * fps)
      : Math.floor(((index + 1) * available) / config.pageIds.length) -
        Math.floor((index * available) / config.pageIds.length);
    const from = cursor;
    cursor += durationInFrames;
    return { pageId, from, durationInFrames };
  });
}
export function audioEnvelope(frame: number, duration: number, fps: number, volume: number) {
  return Math.max(0, Math.min(frame / (fps * 1.5), 1, (duration - 1 - frame) / (fps * 2))) * volume;
}
