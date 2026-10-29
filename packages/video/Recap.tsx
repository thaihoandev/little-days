import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { type Album, type VideoConfig, daysTogether } from '../domain/index.js';
import { audioEnvelope, sceneTimeline } from '../domain/video.js';
import { PageArtwork } from '../scrapbook-renderer/index.js';
import '@fontsource/lora/vietnamese-400.css';
import '@fontsource/lora/latin-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/patrick-hand/vietnamese-400.css';

export type RecapProps = {
  album: Album;
  config: VideoConfig;
  referenceDate: string;
  assetData: Record<string, string>;
  audioSrc?: string;
};
function Scene({
  album,
  pageId,
  referenceDate,
  assetData,
}: {
  album: Album;
  pageId: string;
  referenceDate: string;
  assetData: Record<string, string>;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const page = album.pages.find((p) => p.id === pageId)!;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          transform: `scale(${1.22 + Math.min(frame / 6000, 0.03)})`,
          opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        <PageArtwork
          page={page}
          album={album}
          referenceDate={referenceDate}
          assetData={assetData}
          imageComponent={Img}
          elementStyle={(e, i) => {
            if (e.animation === 'none') return {};
            const progress = spring({ fps, frame: frame - i * 3, config: { damping: 20 } });
            return {
              opacity: e.opacity * progress,
              transform: `translateY(${(1 - progress) * (e.animation === 'drop' ? -65 : e.animation === 'fade' ? 0 : 35)}px) rotate(${e.rotation}deg)`,
            };
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
function Title({
  album,
  text,
  referenceDate,
  ending = false,
}: {
  album: Album;
  text: string;
  referenceDate: string;
  ending?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ fps, frame, config: { damping: 25 } });
  const days = daysTogether(album.startDate, referenceDate);
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: 100,
        textAlign: 'center',
        fontFamily: 'Lora',
        opacity: appear,
        transform: `translateY(${(1 - appear) * 35}px)`,
      }}
    >
      <div
        style={{ fontFamily: 'Patrick Hand', fontSize: 150, color: '#a65c48', marginBottom: 20 }}
      >
        ♡
      </div>
      <div style={{ fontSize: 64, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{text}</div>
      <div style={{ fontFamily: 'Patrick Hand', fontSize: 75, marginTop: 55, color: '#777b53' }}>
        {album.names.join(' & ')}
      </div>
      {!ending && (
        <div style={{ fontFamily: 'Be Vietnam Pro', fontSize: 25, marginTop: 35 }}>
          {days >= 0 ? `${days} ngày bên nhau` : `Còn ${-days} ngày đến ngày của mình`}
        </div>
      )}
    </AbsoluteFill>
  );
}
export function Recap({ album, config, referenceDate, assetData, audioSrc }: RecapProps) {
  const { fps, durationInFrames } = useVideoConfig();
  const intro = fps * 2;
  const outro = fps * 3;
  const timeline = sceneTimeline(config, fps);
  const source = audioSrc || (config.musicId === 'gentle' ? '/audio/gentle.wav' : undefined);
  const audioDuration =
    config.musicId === 'custom'
      ? Math.round(((config.audioEnd ?? 0) - (config.audioStart ?? 0)) * fps)
      : durationInFrames;
  const fadeDuration =
    config.musicId === 'custom' && !config.audioLoop
      ? Math.min(durationInFrames, audioDuration)
      : durationInFrames;
  return (
    <AbsoluteFill style={{ background: '#f5efe2', color: '#453f36' }}>
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(#a28b6822 1px,transparent 1px)',
          backgroundSize: '12px 12px',
        }}
      />
      <Sequence durationInFrames={intro}>
        <Title album={album} referenceDate={referenceDate} text={config.opening} />
      </Sequence>
      {timeline.map((scene) => (
        <Sequence key={scene.pageId} from={scene.from} durationInFrames={scene.durationInFrames}>
          <Scene
            album={album}
            pageId={scene.pageId}
            referenceDate={referenceDate}
            assetData={assetData}
          />
        </Sequence>
      ))}
      <Sequence from={durationInFrames - outro}>
        <Title ending album={album} referenceDate={referenceDate} text={config.closing} />
      </Sequence>
      {config.musicId !== 'none' && source && (
        <Audio
          key={source + ':' + (config.audioStart ?? 0) + ':' + (config.audioEnd ?? '')}
          src={source}
          trimBefore={
            config.musicId === 'custom' ? Math.round((config.audioStart ?? 0) * fps) : undefined
          }
          trimAfter={
            config.musicId === 'custom' ? Math.round((config.audioEnd ?? 0) * fps) : undefined
          }
          loop={config.musicId === 'custom' ? config.audioLoop : false}
          loopVolumeCurveBehavior="extend"
          volume={(frame) => audioEnvelope(frame, fadeDuration, fps, config.audioVolume ?? 0.4)}
        />
      )}
    </AbsoluteFill>
  );
}
