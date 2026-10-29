/** Original synthetic tones: each two seconds changes frequency. No external recordings. */
export function audioFixture(seconds = 8, rate = 22050) {
  const count = Math.round(seconds * rate),
    buffer = Buffer.alloc(44 + count * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const time = i / rate,
      frequency = [220, 440, 880, 1320][Math.floor(time / 2) % 4];
    buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * time) * 10000), 44 + i * 2);
  }
  return buffer;
}
