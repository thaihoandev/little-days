import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const base = new URL('..', import.meta.url);
export async function prepareBackground() {
  const manifest = JSON.parse(
    await fs.readFile(new URL('packages/background-removal/resources.json', base), 'utf8'),
  );
  const folder = new URL('apps/web/public/background-removal/1.7.0/', base);
  await fs.mkdir(folder, { recursive: true });
  const chunks = new Map(
    Object.values(manifest).flatMap((entry) => entry.chunks.map((chunk) => [chunk.name, chunk])),
  );
  let downloaded = 0;
  const queue = [...chunks.values()];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const chunk = queue.shift();
        if (!/^[a-f0-9]{64}$/.test(chunk.name) || chunk.name !== chunk.hash)
          throw new Error('Invalid background asset hash');
        const expectedSize = chunk.offsets[1] - chunk.offsets[0];
        const target = new URL(chunk.name, folder);
        const valid = (bytes) =>
          bytes.length === expectedSize &&
          createHash('sha256').update(bytes).digest('hex') === chunk.hash;
        try {
          if (valid(await fs.readFile(target))) continue;
        } catch {}
        const response = await fetch(
          'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/' + chunk.name,
          { signal: AbortSignal.timeout(120000), redirect: 'error' },
        );
        if (!response.ok) throw new Error('Background asset download failed: ' + response.status);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!valid(bytes)) throw new Error('Background asset integrity check failed');
        const temp = new URL(chunk.name + '.' + randomUUID() + '.tmp', folder);
        try {
          await fs.writeFile(temp, bytes, { flag: 'wx' });
          await fs.rename(temp, target);
        } finally {
          await fs.rm(temp, { force: true });
        }
        downloaded += bytes.length;
      }
    }),
  );
  await fs.writeFile(new URL('resources.json', folder), JSON.stringify(manifest));
  console.log(
    'Prepared verified background-removal assets (downloaded ' +
      Math.round(downloaded / 1048576) +
      ' MiB).',
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await prepareBackground();
