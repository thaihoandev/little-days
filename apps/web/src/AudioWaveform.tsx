import type { AudioAsset, VideoConfig } from '../../../packages/domain/index.js';
export function AudioWaveform({
  track,
  config,
  onChange,
  disabled,
}: {
  track: AudioAsset;
  config: VideoConfig;
  onChange: (config: VideoConfig) => void;
  disabled: boolean;
}) {
  const max = Math.floor(track.duration * 10) / 10,
    start = config.audioStart ?? 0,
    end = config.audioEnd ?? max;
  return (
    <div className="audio-waveform" aria-label="Sóng nhạc và đoạn đã chọn">
      {track.waveform && (
        <svg viewBox="0 0 320 80" role="img" aria-label="Biên độ bản nhạc">
          <rect
            x={(start / track.duration) * 320}
            y="0"
            width={((end - start) / track.duration) * 320}
            height="80"
            fill="#a5b88a44"
          />
          {track.waveform.map((peak, i) => (
            <line
              key={i}
              x1={(i * 320) / track.waveform!.length}
              x2={(i * 320) / track.waveform!.length}
              y1={40 - peak * 37}
              y2={40 + peak * 37}
              stroke="#667650"
              strokeWidth="1.5"
            />
          ))}
          <line
            x1={(start / track.duration) * 320}
            x2={(start / track.duration) * 320}
            y1="0"
            y2="80"
            stroke="#956542"
            strokeWidth="2"
          />
          <line
            x1={(end / track.duration) * 320}
            x2={(end / track.duration) * 320}
            y1="0"
            y2="80"
            stroke="#956542"
            strokeWidth="2"
          />
        </svg>
      )}
      <label>
        Kéo điểm bắt đầu · {start.toFixed(1)} giây
        <input
          aria-label="Điểm bắt đầu trên sóng nhạc"
          type="range"
          min="0"
          max={max - 0.1}
          step="0.1"
          value={start}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...config, audioStart: Math.min(Number(event.target.value), end - 0.1) })
          }
        />
      </label>
      <label>
        Kéo điểm kết thúc · {end.toFixed(1)} giây
        <input
          aria-label="Điểm kết thúc trên sóng nhạc"
          type="range"
          min="0.1"
          max={max}
          step="0.1"
          value={end}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...config, audioEnd: Math.max(Number(event.target.value), start + 0.1) })
          }
        />
      </label>
    </div>
  );
}
