import { useEffect, useRef, type RefObject } from 'react';
import type { AlbumPresentation } from '../../../packages/domain/index.js';
import { previewAudioClip } from '../../../packages/domain/preview-audio.js';

export function PreviewAudio({
  source,
  presentation,
  audioRef,
  autoStart = false,
  controls = false,
  onPlaying,
  onError,
  onDuration,
}: {
  source: string;
  presentation: AlbumPresentation;
  audioRef?: RefObject<HTMLAudioElement | null>;
  autoStart?: boolean;
  controls?: boolean;
  onPlaying?: (playing: boolean) => void;
  onError?: () => void;
  onDuration?: (duration: number) => void;
}) {
  const own = useRef<HTMLAudioElement>(null),
    ref = audioRef || own;
  const latest = useRef({ presentation, onPlaying, onError, onDuration });
  latest.current = { presentation, onPlaying, onError, onDuration };
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let active = true;
    const play = () =>
      void node.play().catch(() => {
        if (active) latest.current.onPlaying?.(false);
      });
    const prepare = () => {
      const p = latest.current.presentation,
        clip = previewAudioClip(p, node.duration);
      if (!clip.end) return;
      node.volume = p.volume;
      node.currentTime = clip.start;
      latest.current.onDuration?.(node.duration);
      if (autoStart) play();
    };
    const check = () => {
      const clip = previewAudioClip(latest.current.presentation, node.duration);
      if (
        clip.end &&
        !node.paused &&
        (node.currentTime >= clip.end || node.currentTime < clip.start)
      )
        node.currentTime = clip.start;
    };
    const ended = () => {
      node.currentTime = previewAudioClip(latest.current.presentation, node.duration).start;
      play();
    };
    node.addEventListener('loadedmetadata', prepare);
    node.addEventListener('ended', ended);
    node.addEventListener('timeupdate', check);
    const timer = window.setInterval(check, 50);
    if (node.readyState >= 1) prepare();
    return () => {
      active = false;
      clearInterval(timer);
      node.removeEventListener('loadedmetadata', prepare);
      node.removeEventListener('ended', ended);
      node.removeEventListener('timeupdate', check);
      node.pause();
    };
  }, [source, autoStart, ref]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (node.readyState >= 1)
      node.currentTime = previewAudioClip(presentation, node.duration).start;
  }, [presentation.audioStart, presentation.audioEnd, ref]);
  useEffect(() => {
    if (ref.current) ref.current.volume = presentation.volume;
  }, [presentation.volume, ref]);
  return (
    <audio
      ref={ref}
      src={source}
      preload={autoStart ? 'auto' : 'metadata'}
      controls={controls}
      aria-label={presentation.audioLabel || 'Nghe thử đoạn nhạc'}
      onPlay={() => latest.current.onPlaying?.(true)}
      onPause={() => latest.current.onPlaying?.(false)}
      onError={() => {
        latest.current.onPlaying?.(false);
        latest.current.onError?.();
      }}
    />
  );
}
