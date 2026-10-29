import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RenderInternals } from '@remotion/renderer';

const execute = promisify(execFile);
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export class InvalidAudioError extends Error {}
export function mediaBinary(type: 'ffmpeg' | 'ffprobe') {
  return RenderInternals.getExecutablePath({
    type,
    indent: false,
    logLevel: 'error',
    binariesDirectory: null,
  });
}
async function probe(file: string) {
  const { stdout } = await execute(
    mediaBinary('ffprobe'),
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-format_whitelist',
      'mp3,wav,mov',
      '-show_format',
      '-show_streams',
      '-of',
      'json',
      file,
    ],
    { timeout: 20000, maxBuffer: 256 * 1024, windowsHide: true },
  );
  return JSON.parse(stdout) as {
    format: { format_name: string; duration: string };
    streams: { codec_type: string; disposition?: { attached_pic?: number } }[];
  };
}
export async function normalizeAudio(input: Buffer) {
  if (!input.length || input.length > MAX_AUDIO_BYTES)
    throw new InvalidAudioError('Nhạc tối đa 20 MB.');
  const root = await mkdtemp(path.join(tmpdir(), 'little-days-audio-'));
  try {
    const source = path.join(root, 'input'),
      output = path.join(root, 'normalized.mp3');
    await writeFile(source, input, { flag: 'wx' });
    const info = await probe(source);
    const duration = Number(info.format.duration);
    if (
      !info.streams.some((s) => s.codec_type === 'audio') ||
      info.streams.some((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
    )
      throw new InvalidAudioError('Chọn file âm thanh MP3, WAV hoặc M4A, không phải video.');
    if (
      !info.format.format_name.split(',').some((f) => ['mp3', 'wav', 'm4a', 'mov'].includes(f)) ||
      !Number.isFinite(duration) ||
      duration < 1 ||
      duration > 600
    )
      throw new InvalidAudioError('Nhạc cần dài từ 1 đến 600 giây, định dạng MP3, WAV hoặc M4A.');
    await execute(
      mediaBinary('ffmpeg'),
      [
        '-v',
        'error',
        '-nostdin',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mp3,wav,mov',
        '-i',
        source,
        '-map',
        '0:a:0',
        '-vn',
        '-sn',
        '-dn',
        '-map_metadata',
        '-1',
        '-t',
        '601',
        '-ac',
        '2',
        '-ar',
        '44100',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-threads',
        '1',
        output,
      ],
      { timeout: 60000, maxBuffer: 256 * 1024, windowsHide: true },
    );
    const result = await probe(output),
      actual = Number(result.format.duration);
    if (!Number.isFinite(actual) || actual < 1 || actual > 600.1)
      throw new InvalidAudioError('Thời lượng nhạc không hợp lệ.');
    // Decoder padding is excluded from the selectable duration.
    const waveFile = path.join(root, 'waveform.wav');
    await execute(
      mediaBinary('ffmpeg'),
      [
        '-v',
        'error',
        '-nostdin',
        '-i',
        output,
        '-map',
        '0:a:0',
        '-ac',
        '1',
        '-ar',
        '8000',
        '-t',
        '600',
        '-c:a',
        'pcm_s16le',
        waveFile,
      ],
      { timeout: 20000, maxBuffer: 256 * 1024, windowsHide: true },
    );
    const wave = await readFile(waveFile);
    let offset = 12,
      pcm = Buffer.alloc(0);
    while (offset + 8 <= wave.length) {
      const length = wave.readUInt32LE(offset + 4);
      if (wave.toString('ascii', offset, offset + 4) === 'data') {
        pcm = wave.subarray(offset + 8, offset + 8 + length);
        break;
      }
      offset += 8 + length + (length % 2);
    }
    if (!pcm.length) throw new InvalidAudioError('Không đọc được sóng nhạc.');
    const waveform = waveformPeaks(pcm);
    return {
      waveform,
      bytes: await readFile(output),
      duration: Math.floor(Math.min(duration, actual, 600) * 1000) / 1000,
    };
  } catch (error) {
    if (error instanceof InvalidAudioError) throw error;
    throw new InvalidAudioError('Không đọc được âm thanh. Hãy dùng file MP3, WAV hoặc M4A hợp lệ.');
  } finally {
    // mkdtemp creates this exact child of the OS temporary directory.
    await rm(root, { recursive: true, force: true });
  }
}

export function waveformPeaks(pcm: Buffer, bins = 160) {
  const samples = Math.floor(pcm.length / 2),
    peaks: number[] = [];
  for (let bin = 0; bin < bins; bin++) {
    let peak = 0;
    for (
      let i = Math.floor((bin * samples) / bins);
      i < Math.floor(((bin + 1) * samples) / bins);
      i++
    )
      peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)));
    peaks.push(Math.round((peak / 32768) * 1000) / 1000);
  }
  return peaks;
}

export function byteRange(header: string | undefined, length: number) {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new InvalidAudioError('Range không hợp lệ.');
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(length - 1, Number(match[2])) : length - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= length ||
    (!match[1] && Number(match[2]) === 0)
  )
    throw new InvalidAudioError('Range không hợp lệ.');
  return { start, end };
}
