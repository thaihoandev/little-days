import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAudio, byteRange, InvalidAudioError } from '../apps/api/src/audio.js';
import { audioFixture } from './audio-fixture.js';
import { mediaBinary } from '../apps/api/src/audio.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import sharp from 'sharp';

test('audio decoder normalizes real WAV bytes and rejects fake or out-of-range audio', async () => {
  const result = await normalizeAudio(audioFixture(2));
  assert.ok(result.bytes.length > 10000);
  assert.equal(result.waveform.length, 160);
  assert.ok(result.waveform.some((peak) => peak > 0));
  assert.ok(result.waveform.every((peak) => peak >= 0 && peak <= 1));
  assert.ok(result.duration >= 1.9 && result.duration <= 2.1);
  const mp3 = await normalizeAudio(result.bytes);
  assert.ok(mp3.duration >= 1.9 && mp3.duration <= 2.2);
  await assert.rejects(
    normalizeAudio(Buffer.from('fake mp3, trust my extension')),
    InvalidAudioError,
  );
  await assert.rejects(normalizeAudio(audioFixture(0.2)), /1 đến 600/);
  await assert.rejects(normalizeAudio(Buffer.alloc(20 * 1024 * 1024 + 1)), /20 MB/);
});
test('private audio ranges support seeking and reject invalid/multiple ranges', () => {
  assert.equal(byteRange(undefined, 100), undefined);
  assert.deepEqual(byteRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(byteRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange('bytes=-20', 100), { start: 80, end: 99 });
  assert.deepEqual(byteRange('bytes=0-999', 100), { start: 0, end: 99 });
  for (const header of [
    'bytes=100-',
    'bytes=9-2',
    'bytes=-0',
    'bytes=-',
    'bytes=1-2,4-5',
    'bytes=99999999999999999999-',
  ])
    assert.throws(() => byteRange(header, 100));
});

test('M4A AAC is decoded and a video disguised as audio is rejected', async () => {
  const root = path.resolve('test-results/audio-formats', crypto.randomUUID());
  await mkdir(root, { recursive: true });
  const source = path.join(root, 'tone.wav'),
    m4a = path.join(root, 'tone.m4a');
  await writeFile(source, audioFixture(2));
  const run = promisify(execFile);
  await run(mediaBinary('ffmpeg'), ['-v', 'error', '-i', source, '-c:a', 'aac', '-f', 'mp4', m4a], {
    windowsHide: true,
  });
  const result = await normalizeAudio(await readFile(m4a));
  assert.ok(result.duration >= 1.9 && result.duration <= 2.1);
  const picture = path.join(root, 'cover.png'),
    video = path.join(root, 'disguised.mp4');
  await sharp({ create: { width: 16, height: 16, channels: 3, background: '#b7c2a1' } })
    .png()
    .toFile(picture);
  await run(
    mediaBinary('ffmpeg'),
    [
      '-v',
      'error',
      '-loop',
      '1',
      '-i',
      picture,
      '-i',
      source,
      '-t',
      '1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      video,
    ],
    { windowsHide: true },
  );
  await assert.rejects(normalizeAudio(await readFile(video)), /không phải video/);
});
