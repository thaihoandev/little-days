import { mkdir, writeFile } from 'node:fs/promises';
// Original deterministic synthesis; no sampled recordings or third-party downloads.
const rate = 22050,
  seconds = 32,
  notes = [261.6256, 293.6648, 329.6276, 349.2282, 391.9954, 440, 493.8833, 523.2511];
await mkdir('apps/web/public/audio', { recursive: true });
for (const name of ['warm-piano', 'little-waltz', 'evening']) {
  const data = Buffer.alloc(44 + rate * seconds * 2);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(data.length - 44, 40);
  const beat = name === 'little-waltz' ? 0.5 : 0.75;
  for (let i = 0; i < rate * seconds; i++) {
    const t = i / rate;
    let value = 0;
    if (name === 'evening') {
      for (let voice = 0; voice < 3; voice++) {
        const chord = Math.floor(t / 8) % 4,
          idx = [
            [0, 2, 4],
            [5, 0, 2],
            [3, 5, 0],
            [4, 6, 1],
          ][chord][voice];
        const f = notes[idx] * (voice === 0 ? 0.5 : 1),
          swell = Math.sin((Math.PI * (t % 8)) / 8) ** 2;
        value +=
          0.08 * swell * (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * f * 2 * t));
      }
    } else {
      for (let tail = 0; tail < 6; tail++) {
        const n = Math.floor(t / beat) - tail;
        if (n < 0) continue;
        const age = t - n * beat,
          pattern =
            name === 'little-waltz'
              ? [0, 2, 4, 5, 4, 2, 3, 5, 0, 4, 2, 1]
              : [0, 4, 2, 7, 5, 2, 4, 1];
        const f =
            notes[pattern[n % pattern.length]] * (name === 'little-waltz' && n % 3 === 0 ? 0.5 : 1),
          envelope = (1 - Math.exp(-age * 90)) * Math.exp(-age * 3);
        value +=
          0.12 *
          envelope *
          (Math.sin(2 * Math.PI * f * age) +
            0.23 * Math.sin(2 * Math.PI * f * 2 * age) +
            0.08 * Math.sin(2 * Math.PI * f * 3 * age));
      }
    }
    const fade = Math.min(1, t / 0.15, (seconds - t) / 0.3);
    data.writeInt16LE(
      Math.round(Math.max(-0.95, Math.min(0.95, value * fade)) * 32767),
      44 + i * 2,
    );
  }
  await writeFile('apps/web/public/audio/' + name + '.wav', data);
}
console.log('Generated three original 32-second PCM music beds.');
