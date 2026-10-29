import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { type AudioAsset, type VideoConfig } from '../../../packages/domain/index.js';
import { api } from './api.js';
import { AudioWaveform } from './AudioWaveform.js';

export function AudioControls({
  albumId,
  config,
  onChange,
  onSource,
  onBusy,
  onError,
}: {
  albumId: string;
  config: VideoConfig;
  onChange: Dispatch<SetStateAction<VideoConfig>>;
  onSource: (source: string | undefined) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const [tracks, setTracks] = useState<AudioAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    api<AudioAsset[]>('/albums/' + albumId + '/audio')
      .then((tracks) => {
        if (active) setTracks(tracks);
      })
      .catch((e) => {
        if (active) onError(e.message);
      });
    return () => {
      active = false;
    };
  }, [albumId]);
  const selected = tracks.find((t) => t.id === config.audioId);
  useEffect(
    () => onSource(config.musicId === 'custom' ? selected?.url : undefined),
    [config.musicId, selected?.url, onSource],
  );
  const choose = (track: AudioAsset) =>
    onChange((current) => ({
      ...current,
      musicId: 'custom',
      audioId: track.id,
      audioStart: 0,
      audioEnd: Math.floor(track.duration * 10) / 10,
      audioLoop: false,
    }));
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    onBusy(true);
    onError('');
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <section className="audio-controls" aria-label="Tùy chỉnh nhạc nền">
      <label>
        Nhạc nền
        <select
          value={config.musicId}
          disabled={busy}
          onChange={(e) => {
            const musicId = e.target.value as VideoConfig['musicId'];
            if (musicId === 'custom' && !selected && tracks[0]) choose(tracks[0]);
            else onChange({ ...config, musicId });
          }}
        >
          <option value="gentle">Chuông gió dịu dàng · bản gốc</option>
          <option value="none">Không nhạc</option>
          <option value="custom">Nhạc của mình</option>
        </select>
      </label>
      <input
        ref={file}
        hidden
        type="file"
        aria-label="File nhạc riêng"
        accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
        disabled={busy}
        onChange={(e) => {
          const input = e.currentTarget,
            track = input.files?.[0];
          if (!track) return;
          void run(async () => {
            if (track.size > 20 * 1024 * 1024) throw new Error('Nhạc tối đa 20 MB.');
            const form = new FormData();
            form.append('file', track);
            const uploaded = await api<AudioAsset>('/albums/' + albumId + '/audio', {
              method: 'POST',
              body: form,
            });
            setTracks((prev) => [...prev, uploaded]);
            choose(uploaded);
          }).finally(() => {
            input.value = '';
          });
        }}
      />
      <button
        className="button quiet full"
        disabled={busy || tracks.length >= 10}
        onClick={() => file.current?.click()}
      >
        {busy ? 'Đang xử lý âm thanh…' : 'Tải nhạc riêng'}
      </button>
      <p className="muted small">MP3, WAV hoặc M4A · tối đa 20 MB, 10 phút · 10 bản nhạc/album.</p>
      {config.musicId === 'custom' && (
        <>
          {tracks.length > 0 ? (
            <label>
              Bản nhạc
              <select
                value={selected?.id || ''}
                disabled={busy}
                onChange={(e) => {
                  const track = tracks.find((t) => t.id === e.target.value);
                  if (track) choose(track);
                }}
              >
                {!selected && <option value="">Chọn bản nhạc</option>}
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name} · {track.duration.toFixed(1)} giây
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="muted small">Tải một bản nhạc để chọn đoạn dùng trong video.</p>
          )}
          {selected && (
            <>
              <AudioWaveform track={selected} config={config} onChange={onChange} disabled={busy} />
              <div className="audio-trim">
                <label>
                  Bắt đầu nhạc (giây)
                  <input
                    type="number"
                    min={0}
                    max={(config.audioEnd ?? selected.duration) - 0.1}
                    step={0.1}
                    value={config.audioStart ?? 0}
                    disabled={busy}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value))
                        onChange({
                          ...config,
                          audioStart:
                            Math.round(
                              Math.max(
                                0,
                                Math.min(value, (config.audioEnd ?? selected.duration) - 0.1),
                              ) * 10,
                            ) / 10,
                        });
                    }}
                  />
                </label>
                <label>
                  Kết thúc nhạc (giây)
                  <input
                    type="number"
                    min={(config.audioStart ?? 0) + 0.1}
                    max={Math.floor(selected.duration * 10) / 10}
                    step={0.1}
                    value={config.audioEnd ?? selected.duration}
                    disabled={busy}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value))
                        onChange({
                          ...config,
                          audioEnd:
                            Math.round(
                              Math.max(
                                (config.audioStart ?? 0) + 0.1,
                                Math.min(value, Math.floor(selected.duration * 10) / 10),
                              ) * 10,
                            ) / 10,
                        });
                    }}
                  />
                </label>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={config.audioLoop ?? false}
                  disabled={busy}
                  onChange={(e) => onChange({ ...config, audioLoop: e.target.checked })}
                />
                Lặp đoạn nhạc cho đủ video
              </label>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api('/albums/' + albumId + '/audio/' + selected.id, { method: 'DELETE' });
                    setTracks((prev) => prev.filter((t) => t.id !== selected.id));
                    onChange((current) => ({ ...current, musicId: 'none', audioId: undefined }));
                  })
                }
              >
                Xóa bản nhạc đã chọn
              </button>
            </>
          )}
        </>
      )}
      {config.musicId !== 'none' && (
        <label>
          Âm lượng nhạc · {Math.round((config.audioVolume ?? 0.4) * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.audioVolume ?? 0.4}
            onChange={(e) => onChange({ ...config, audioVolume: Number(e.target.value) })}
          />
        </label>
      )}
    </section>
  );
}
