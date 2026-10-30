import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { mediaBinary } from '../apps/api/src/audio.js';
import { builtInMusic } from '../packages/domain/music.js';

const execute = promisify(execFile);
export async function verifyLibraryVideo(musicId: string, seconds: number) {
  const track = builtInMusic(musicId);
  assert.ok(track, 'Expected a built-in music fixture');
  const video = 'test-results/recap-smoke.mp4';
  const { stdout } = await execute(
    mediaBinary('ffprobe'),
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', video],
    { windowsHide: true },
  );
  const info = JSON.parse(stdout),
    visual = info.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  assert.equal(visual.codec_name, 'h264');
  assert.equal(visual.width, 1080);
  assert.equal(visual.height, 1920);
  assert.equal(visual.r_frame_rate, '30/1');
  assert.ok(info.streams.some((s: { codec_name: string }) => s.codec_name === 'aac'));
  assert.ok(Math.abs(Number(info.format.duration) - seconds) < 0.15);
  async function decode(input: string, output: string) {
    await execute(
      mediaBinary('ffmpeg'),
      [
        '-v',
        'error',
        '-y',
        '-i',
        input,
        '-map',
        '0:a:0',
        '-ac',
        '1',
        '-ar',
        '8000',
        '-c:a',
        'pcm_s16le',
        output,
      ],
      { windowsHide: true },
    );
    const wav = await readFile(output);
    let offset = 12;
    while (wav.toString('ascii', offset, offset + 4) !== 'data') {
      offset += 8 + wav.readUInt32LE(offset + 4) + (wav.readUInt32LE(offset + 4) % 2);
      assert.ok(offset + 8 <= wav.length, 'Expected WAV data');
    }
    return wav.subarray(offset + 8, offset + 8 + wav.readUInt32LE(offset + 4));
  }
  const actual = await decode(video, 'test-results/library-video.wav'),
    expected = await decode(
      'apps/web/public/audio/' + track.file,
      'test-results/library-source.wav',
    ),
    sourceSamples = expected.length / 2;
  for (const second of [1, Math.floor(seconds / 2), seconds - 2]) {
    let best = 0;
    for (let shift = -80; shift <= 80; shift += 4) {
      let cross = 0,
        left = 0,
        right = 0;
      for (let i = 0; i < 3200; i++) {
        const sample = second * 8000 + i,
          a = actual.readInt16LE(sample * 2),
          b = expected.readInt16LE(((sample + shift + sourceSamples) % sourceSamples) * 2);
        cross += a * b;
        left += a * a;
        right += b * b;
      }
      assert.ok(left > 3200 * 10 ** 2, 'Audio must not be silent');
      best = Math.max(best, cross / Math.sqrt(left * right));
    }
    assert.ok(best > 0.85, `Expected selected track ${musicId} at ${second}s; correlation ${best}`);
  }
  console.log(
    `PASS library MP4: H.264 1080×1920/30 fps, AAC, ${seconds}s; selected ${musicId} matches decoded audio at three positions.`,
  );
}
