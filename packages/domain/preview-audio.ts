import type { AlbumPresentation } from './index.js';
export function previewAudioClip(
  p: Pick<AlbumPresentation, 'audioStart' | 'audioEnd'>,
  duration: number,
) {
  if (!Number.isFinite(duration) || duration <= 0) return { start: 0, end: 0 };
  const start = Math.min(p.audioStart ?? 0, Math.max(0, duration - 0.1));
  return { start, end: Math.min(duration, Math.max(start + 0.1, p.audioEnd ?? duration)) };
}
