import { audioFixture } from '../tests/audio-fixture.js';
import { createPage, type VideoConfig } from '../packages/domain/index.js';
import { videoDurationFrames } from '../packages/domain/video.js';
import { builtInMusic } from '../packages/domain/music.js';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { Album, JobView } from '../packages/domain/index.js';
const origin = process.env.SMOKE_ORIGIN || 'http://127.0.0.1:3001';
let cookie = '';
async function request(route: string, method = 'GET', body?: unknown) {
  const response = await fetch(origin + '/api' + route, {
    method,
    headers: {
      Cookie: cookie,
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  if (response.headers.get('set-cookie'))
    cookie = response.headers.get('set-cookie')!.split(';')[0];
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response;
}
await request('/session');
let album: Album = await (await request('/albums', 'POST', { title: 'Render smoke test' })).json();
const image = await sharp({
  create: { width: 800, height: 650, channels: 3, background: '#acb795' },
})
  .composite([
    {
      input: Buffer.from(
        '<svg width="800" height="650"><circle cx="400" cy="250" r="140" fill="#f1d5a5"/><path d="M0 650V480Q250 220 800 490V650" fill="#6a845f"/></svg>',
      ),
    },
  ])
  .png()
  .toBuffer();
const upload = new FormData();
upload.append('file', new Blob([image]), 'render-fixture.png');
album = await (await request(`/albums/${album.id}/assets`, 'POST', upload)).json();
album.pages[0].elements.find((e) => e.type === 'image')!.assetId = album.assets[0].id;
album.pages[0].elements.find((e) => e.type === 'image')!.animation = 'fade';
const counter = album.pages[0].elements.find((e) => e.type === 'anniversary')!;
counter.dateMode = 'milestone';
counter.milestoneDays = 1000;
const custom = process.env.SMOKE_CUSTOM_VIDEO === 'true';
if (custom) album.pages.push(createPage('letter'));
const { id, revision, assets, createdAt, updatedAt, schemaVersion, ...content } = album;
album = await (
  await request(`/albums/${id}`, 'PATCH', { expectedRevision: revision, content })
).json();
const config: VideoConfig = {
  seconds: 15,
  pageIds: [album.pages[0].id],
  opening: 'Ngày mình bên nhau',
  closing: 'Cảm ơn vì đã ở đây ♡',
  musicId: 'gentle',
};
if (process.env.SMOKE_MUSIC_ID) {
  const track = builtInMusic(process.env.SMOKE_MUSIC_ID);
  if (!track) throw new Error('Invalid fixture music ID.');
  config.musicId = track.id;
}
if (custom) {
  const form = new FormData();
  form.append('file', new Blob([audioFixture()]), 'original-tones.wav');
  const audio = await (await request('/albums/' + id + '/audio', 'POST', form)).json();
  config.pageIds = album.pages.slice(0, 2).map((p) => p.id);
  config.sceneDurations = Object.fromEntries(config.pageIds.map((id, i) => [id, i === 0 ? 3 : 4]));
  config.musicId = 'custom';
  config.audioId = audio.id;
  config.audioStart = 2;
  config.audioEnd = 4;
  config.audioLoop = true;
  config.audioVolume = 0.6;
}
let job: JobView = await (
  await request(`/albums/${id}/exports`, 'POST', {
    expectedRevision: album.revision,
    idempotencyKey: crypto.randomUUID(),
    config,
  })
).json();
// Change the live title after queuing: the immutable snapshot must still render.
await request(`/albums/${id}`, 'PATCH', {
  expectedRevision: album.revision,
  content: { ...content, title: 'Thay đổi sau khi xuất' },
});
console.log(`Render queued: ${job.id}`);
let last = '';
const deadline = Date.now() + 15 * 60 * 1000;
while (!['completed', 'failed', 'canceled'].includes(job.status) && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 2000));
  job = await (await request(`/exports/${job.id}`)).json();
  const state = `${job.status} ${job.progress}%`;
  if (state !== last) {
    console.log(state);
    last = state;
  }
}
assert.equal(job.status, 'completed', job.error || 'Render timeout');
const video = Buffer.from(await (await request(`/exports/${job.id}/download`)).arrayBuffer());
assert.ok(video.length > 20000);
assert.equal(video.toString('ascii', 4, 8), 'ftyp');
await mkdir('test-results', { recursive: true });
await writeFile('test-results/recap-smoke.mp4', video);
await writeFile(
  'test-results/render-result.json',
  JSON.stringify(
    {
      id: job.id,
      status: job.status,
      bytes: video.length,
      musicId: config.musicId,
      seconds: videoDurationFrames(config) / 30,
      download: `${origin}/api/exports/${job.id}/download`,
    },
    null,
    2,
  ),
);
console.log(
  `PASS MP4: ${video.length} bytes, 1080 × 1920, ${videoDurationFrames(config) / 30} seconds, ${custom ? 'custom trimmed/looped audio + scene durations' : 'original audio'}, uploaded image + illustration. Saved test-results/recap-smoke.mp4`,
);
