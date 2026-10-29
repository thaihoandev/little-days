import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { mediaBinary } from '../apps/api/src/audio.js';

const execute = promisify(execFile),
  video = 'test-results/recap-smoke.mp4';
const { stdout } = await execute(
  mediaBinary('ffprobe'),
  ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', video],
  { windowsHide: true },
);
const info = JSON.parse(stdout),
  visual = info.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
assert.equal(visual.width, 1080);
assert.equal(visual.height, 1920);
assert.equal(visual.r_frame_rate, '30/1');
assert.ok(Math.abs(Number(info.format.duration) - 12) < 0.15);
for (const second of [1, 3, 7, 9]) {
  const output = 'test-results/custom-audio-' + second + '.wav';
  await execute(
    mediaBinary('ffmpeg'),
    [
      '-v',
      'error',
      '-y',
      '-ss',
      String(second),
      '-i',
      video,
      '-t',
      '0.25',
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
    assert.ok(offset < wav.length);
  }
  const bytes = wav.subarray(offset + 8),
    count = bytes.length / 2;
  const power = (frequency: number) => {
    let real = 0,
      imag = 0;
    for (let i = 0; i < count; i++) {
      const sample =
        bytes.readInt16LE(i * 2) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (count - 1)));
      real += sample * Math.cos((2 * Math.PI * frequency * i) / 8000);
      imag += sample * Math.sin((2 * Math.PI * frequency * i) / 8000);
    }
    return real * real + imag * imag;
  };
  assert.ok(
    power(440) > power(220) * 30 && power(440) > power(880) * 30,
    'Expected trimmed 440 Hz tone at ' + second + 's; wrong source/cut/loop or silence',
  );
}
for (const [name, second] of [
  ['intro', 1],
  ['first-scene', 3],
  ['second-scene', 7],
  ['ending', 11],
] as const)
  await execute(
    mediaBinary('ffmpeg'),
    [
      '-v',
      'error',
      '-y',
      '-ss',
      String(second),
      '-i',
      video,
      '-frames:v',
      '1',
      '-update',
      '1',
      'test-results/custom-video-' + name + '.png',
    ],
    { windowsHide: true },
  );
console.log(
  'PASS custom MP4: 1080×1920, 30 fps, 12 seconds; selected 440 Hz segment repeats through the video; four frames extracted.',
);
