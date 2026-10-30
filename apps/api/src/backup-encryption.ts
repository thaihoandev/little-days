import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { z } from 'zod';
import { verifyBackup } from './backup.js';
import { validateObjectKey } from './storage.js';

const MAGIC = Buffer.from('LDBK2\0'),
  HEADER = MAGIC.length + 12,
  MAX_INDEX = 16 * 1048576;
const indexSchema = z
  .array(
    z.object({
      path: z.string(),
      bytes: z
        .number()
        .int()
        .nonnegative()
        .max(512 * 1048576),
    }),
  )
  .min(2)
  .max(10000);
export function encryptionKey(value: string | undefined) {
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value))
    throw new Error('BACKUP_ENCRYPTION_KEY must be 32 random bytes encoded as 64 hex characters.');
  return Buffer.from(value, 'hex');
}

export async function sealBackup(source: string, output: string, key: Buffer) {
  if (key.length !== 32) throw new Error('Invalid backup encryption key.');
  const { manifest } = await verifyBackup(source);
  const manifestBytes = (await stat(path.join(source, 'manifest.json'))).size;
  const files = [
    ...manifest.files.map((f) => ({ path: f.path, bytes: f.bytes })),
    { path: 'manifest.json', bytes: manifestBytes },
  ];
  const index = Buffer.from(JSON.stringify(files));
  if (index.length > MAX_INDEX) throw new Error('Backup index too large.');
  const iv = randomBytes(12),
    header = Buffer.concat([MAGIC, iv]),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(index.length);
  async function* input() {
    yield length;
    yield index;
    for (const file of files) {
      validateObjectKey(file.path);
      yield* createReadStream(path.resolve(source, ...file.path.split('/')));
    }
  }
  const target = path.resolve(output);
  await mkdir(path.dirname(target), { recursive: true });
  const handle = await open(target, 'wx', 0o600);
  let success = false;
  try {
    await handle.writeFile(header);
    await pipeline(
      Readable.from(input()),
      cipher,
      createWriteStream(target, { fd: handle.fd, autoClose: false, start: HEADER }),
    );
    await handle.write(cipher.getAuthTag(), 0, 16, (await handle.stat()).size);
    await handle.sync();
    success = true;
  } finally {
    await handle.close();
    if (!success) await rm(target, { force: true });
  }
  return { files: files.length, bytes: (await stat(target)).size };
}

export async function unsealBackup(
  source: string,
  output: string,
  key: Buffer,
  maxBytes = 512 * 1048576,
) {
  if (key.length !== 32 || !Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new Error('Invalid restore parameters.');
  const input = path.resolve(source),
    size = (await stat(input)).size;
  if (size < HEADER + 20 || size > maxBytes + MAX_INDEX + 1024)
    throw new Error('Invalid encrypted backup size.');
  const handle = await open(input, 'r'),
    header = Buffer.alloc(HEADER),
    tag = Buffer.alloc(16);
  try {
    await handle.read(header, 0, HEADER, 0);
    await handle.read(tag, 0, 16, size - 16);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error('Unknown backup encryption format.');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const root = path.resolve(output);
  await mkdir(path.dirname(root), { recursive: true });
  const temp = path.join(path.dirname(root), '.backup-decrypt-' + crypto.randomUUID());
  let count = 0;
  try {
    await pipeline(
      createReadStream(input, { start: HEADER, end: size - 17 }),
      decipher,
      new Transform({
        transform(chunk, _encoding, done) {
          count += chunk.length;
          done(
            count > maxBytes + MAX_INDEX ? new Error('Backup exceeds restore limit.') : null,
            chunk,
          );
        },
      }),
      createWriteStream(temp, { flags: 'wx', mode: 0o600 }),
    );
    // No output files are exposed before GCM authentication has succeeded.
    const plain = await open(temp, 'r');
    try {
      const length = Buffer.alloc(4);
      if ((await plain.read(length, 0, 4, 0)).bytesRead !== 4) throw new Error('Truncated backup.');
      const indexBytes = length.readUInt32BE();
      if (indexBytes < 2 || indexBytes > MAX_INDEX) throw new Error('Invalid backup index.');
      const index = Buffer.alloc(indexBytes);
      if ((await plain.read(index, 0, indexBytes, 4)).bytesRead !== indexBytes)
        throw new Error('Truncated backup index.');
      const files = indexSchema.parse(JSON.parse(index.toString('utf8'))),
        names = new Set<string>();
      let total = 0;
      for (const f of files) {
        validateObjectKey(f.path);
        if (
          names.has(f.path) ||
          (!['manifest.json', 'database.json'].includes(f.path) && !f.path.startsWith('media/'))
        )
          throw new Error('Invalid backup path.');
        names.add(f.path);
        total += f.bytes;
      }
      if (
        !names.has('manifest.json') ||
        !names.has('database.json') ||
        total > maxBytes ||
        4 + indexBytes + total !== count
      )
        throw new Error('Backup size or index mismatch.');
      await mkdir(root, { mode: 0o700 });
      let position = 4 + indexBytes;
      for (const f of files) {
        const target = path.resolve(root, ...f.path.split('/'));
        if (!target.startsWith(root + path.sep)) throw new Error('Backup path escapes output.');
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        if (f.bytes)
          await pipeline(
            createReadStream(temp, { start: position, end: position + f.bytes - 1 }),
            createWriteStream(target, { flags: 'wx', mode: 0o600 }),
          );
        else {
          const empty = await open(target, 'wx', 0o600);
          await empty.close();
        }
        position += f.bytes;
      }
    } finally {
      await plain.close();
    }
    return (await verifyBackup(root)).manifest;
  } finally {
    await rm(temp, { force: true });
  }
}
