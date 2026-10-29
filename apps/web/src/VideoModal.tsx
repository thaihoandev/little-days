import { useEffect, useState } from 'react';
import { Player } from '@remotion/player';
import { ArrowDown, ArrowUp, Check, Download, Film, LoaderCircle, Music2, X } from 'lucide-react';
import { Recap } from '../../../packages/video/Recap.js';
import {
  type Album,
  type JobView,
  type VideoConfig,
  todayIn,
  videoConfigSchema,
} from '../../../packages/domain/index.js';
import { api } from './api.js';
import { AudioControls } from './AudioControls.js';
import { sceneTimeline, videoDurationFrames } from '../../../packages/domain/video.js';

const jobLabels = {
  queued: 'Đang chờ đến lượt',
  preparing: 'Chuẩn bị ảnh và phông chữ',
  rendering: 'Đang dệt những kỉ niệm thành phim',
  uploading: 'Hoàn thiện file',
  completed: 'Video của bạn đã sẵn sàng',
  failed: 'Chưa xuất được video',
  canceled: 'Đã hủy xuất video',
};
export default function VideoModal({
  album,
  onClose,
  notify,
}: {
  album: Album;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const [config, setConfig] = useState<VideoConfig>({
    seconds: 30,
    pageIds: album.pages.map((p) => p.id),
    opening: 'Ngày mình bên nhau',
    closing: 'Và còn những ngày thật đẹp phía trước…',
    musicId: 'gentle',
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string>();
  const [audioBusy, setAudioBusy] = useState(false);
  const validated = videoConfigSchema.safeParse(config);
  const duration = videoDurationFrames(config);
  const timeline = sceneTimeline(config);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [capacity, setCapacity] = useState<boolean>();
  useEffect(() => {
    let active = true;
    const load = () =>
      void api<{ available: boolean }>('/render-capacity')
        .then((result) => {
          if (active) setCapacity(result.available);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let mounted = true;
    api<{ config: VideoConfig | null }>('/albums/' + album.id + '/video-settings')
      .then(({ config }) => {
        if (mounted && config) setConfig(config);
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      })
      .finally(() => {
        if (mounted) setSettingsLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, [album.id]);
  const saveSettings = async () => {
    setSavingSettings(true);
    setError('');
    try {
      await api('/albums/' + album.id + '/video-settings', {
        method: 'PATCH',
        body: JSON.stringify(config),
      });
      notify('Đã lưu tùy chọn video cho lần sau.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingSettings(false);
    }
  };
  const load = () =>
    api<JobView[]>(`/albums/${album.id}/exports`)
      .then(setJobs)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 1800);
    return () => clearInterval(timer);
  }, [album.id]);
  const job = jobs[0];
  const active = job && !['completed', 'failed', 'canceled'].includes(job.status);
  const move = (i: number, delta: number) =>
    setConfig((c) => {
      const ids = [...c.pageIds];
      [ids[i], ids[i + delta]] = [ids[i + delta], ids[i]];
      return { ...c, pageIds: ids };
    });
  const render = async () => {
    setPending(true);
    setError('');
    try {
      const j = await api<JobView>(`/albums/${album.id}/exports`, {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: album.revision,
          config,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setJobs((prev) => [j, ...prev]);
      notify('Đã thêm video vào hàng đợi. Bạn có thể tiếp tục chỉnh album.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <div className="video-modal" role="dialog" aria-modal="true" aria-labelledby="video-heading">
        <header className="modal-header">
          <div>
            <span className="eyebrow">TỪ TRANG GIẤY ĐẾN THƯỚC PHIM</span>
            <h2 id="video-heading">Kỉ niệm, chuyển động.</h2>
          </div>
          <button className="icon-button" aria-label="Đóng" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="video-body">
          <div className="video-player">
            <Player
              component={Recap}
              inputProps={{
                album,
                config,
                referenceDate: todayIn(album.timezone),
                assetData: {},
                audioSrc,
              }}
              durationInFrames={duration}
              compositionWidth={1080}
              compositionHeight={1920}
              fps={30}
              initialFrame={15}
              controls
              style={{ width: '100%', maxHeight: '65vh', aspectRatio: '9/16' }}
            />
            <p>Preview 9:16 · Bản xuất 1080p · 30 fps · {(duration / 30).toFixed(1)} giây</p>
          </div>
          <fieldset className="video-options" disabled={!settingsLoaded || savingSettings}>
            <h3>Câu chuyện của hai bạn</h3>
            {capacity === false && (
              <p className="overflow-warning" role="status">
                Bộ xuất video hiện chưa sẵn sàng. Bạn vẫn có thể xếp hàng; video sẽ được xử lý khi
                bộ xuất hoạt động trở lại.
              </p>
            )}
            <label>
              Tiêu đề mở đầu
              <input
                value={config.opening}
                maxLength={160}
                onChange={(e) => setConfig({ ...config, opening: e.target.value })}
              />
            </label>
            <label>
              Lời kết
              <textarea
                rows={2}
                maxLength={250}
                value={config.closing}
                onChange={(e) => setConfig({ ...config, closing: e.target.value })}
              />
            </label>
            <div className="duration-field">
              <span>Độ dài</span>
              <div className="segmented">
                {([15, 30, 60] as const).map((s) => (
                  <button
                    key={s}
                    className={!config.sceneDurations && config.seconds === s ? 'active' : ''}
                    onClick={() => setConfig({ ...config, seconds: s, sceneDurations: undefined })}
                  >
                    {s} giây
                  </button>
                ))}
              </div>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={!!config.sceneDurations}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    sceneDurations: e.target.checked
                      ? Object.fromEntries(
                          timeline.map((scene) => [
                            scene.pageId,
                            Math.max(1, Math.round(scene.durationInFrames / 3) / 10),
                          ]),
                        )
                      : undefined,
                  })
                }
              />
              Thời lượng từng trang
            </label>
            <p className="muted small">
              Mở đầu 2 giây · Kết 3 giây. Chế độ riêng: mỗi trang 1–60 giây, tổng video tối đa 180
              giây.
            </p>
            <AudioControls
              albumId={album.id}
              config={config}
              onChange={setConfig}
              onSource={setAudioSrc}
              onBusy={setAudioBusy}
              onError={setError}
            />
            <h4>Các trang trong video</h4>
            <p className="muted small">Chọn trang và sắp xếp theo thứ tự bạn muốn.</p>
            <div className="scene-list">
              {[
                ...config.pageIds.map((id) => album.pages.find((p) => p.id === id)!),
                ...album.pages.filter((p) => !config.pageIds.includes(p.id)),
              ].map((page) => {
                const index = config.pageIds.indexOf(page.id);
                return (
                  <div key={page.id}>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={index !== -1}
                        onChange={() =>
                          setConfig((c) => {
                            const pageIds =
                              index === -1
                                ? [...c.pageIds, page.id]
                                : c.pageIds.filter((id) => id !== page.id);
                            return {
                              ...c,
                              pageIds,
                              sceneDurations: c.sceneDurations
                                ? Object.fromEntries(
                                    pageIds.map((id) => [id, c.sceneDurations![id] ?? 5]),
                                  )
                                : undefined,
                            };
                          })
                        }
                      />
                      {index !== -1 && <span className="scene-number">{index + 1}</span>}
                      {page.title}
                    </label>
                    {index !== -1 && config.sceneDurations && (
                      <label className="scene-duration">
                        Giây
                        <input
                          aria-label={'Thời lượng cảnh ' + page.title}
                          type="number"
                          min={1}
                          max={60}
                          step={0.1}
                          value={config.sceneDurations[page.id] ?? 5}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (Number.isFinite(value))
                              setConfig((c) => ({
                                ...c,
                                sceneDurations: {
                                  ...c.sceneDurations,
                                  [page.id]: Math.round(Math.max(1, Math.min(60, value)) * 10) / 10,
                                },
                              }));
                          }}
                        />
                      </label>
                    )}
                    {index !== -1 && (
                      <span>
                        <button
                          className="icon-button tiny"
                          aria-label="Đưa cảnh lên"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          className="icon-button tiny"
                          aria-label="Đưa cảnh xuống"
                          disabled={index === config.pageIds.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown size={14} />
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {!validated.success && (
              <p className="error" role="alert">
                {validated.error.issues[0].message}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              disabled={
                pending ||
                active ||
                audioBusy ||
                !validated.success ||
                (config.musicId === 'custom' && !audioSrc)
              }
              onClick={() => void render()}
            >
              {pending || active ? <LoaderCircle className="spin" size={17} /> : <Film size={17} />}
              Xuất video MP4
            </button>
            <button
              className="button quiet full"
              disabled={
                audioBusy || !validated.success || (config.musicId === 'custom' && !audioSrc)
              }
              onClick={() => void saveSettings()}
            >
              {savingSettings ? 'Đang lưu…' : 'Lưu tùy chọn video'}
            </button>
            {job && (
              <div className={`job-card ${job.status}`}>
                <strong>
                  {job.status === 'completed' ? <Check size={17} /> : <Film size={17} />}{' '}
                  {jobLabels[job.status]}
                </strong>
                <progress value={job.progress} max={100} />
                <div className="row between">
                  <span className="small">
                    {job.progress}% · {(videoDurationFrames(job.config) / 30).toFixed(1)} giây
                  </span>
                  {active && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void api(`/exports/${job.id}/cancel`, { method: 'POST' })
                          .then(load)
                          .catch((e) => setError(e.message))
                      }
                    >
                      Hủy tác vụ
                    </button>
                  )}
                </div>
                {job.error && <p className="error">{job.error}</p>}
                {job.status === 'completed' && (
                  <a className="button primary full" href={`/api/exports/${job.id}/download`}>
                    <Download size={16} />
                    Tải video của hai bạn
                  </a>
                )}
              </div>
            )}
            <p className="muted small">
              <Music2 size={13} /> Chọn nhạc gốc hoặc tải nhạc của bạn. Video đang xuất giữ nguyên
              nội dung lúc bạn bấm xuất.
            </p>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
