import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function collectLicenses() {
  const raw = await fs.readFile('package-lock.json', 'utf8'),
    lock = JSON.parse(raw),
    entries = [],
    texts = [];
  for (const [relative, meta] of Object.entries(lock.packages || {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!relative.startsWith('node_modules/') || relative.split('/').includes('..')) continue;
    const root = path.resolve(relative);
    let installed;
    try {
      installed = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    } catch {}
    const name = installed?.name || relative.slice(relative.lastIndexOf('node_modules/') + 13);
    const declared = installed?.license || meta.license || null;
    const files = [];
    if (installed) {
      for (const folder of ['', 'lib', 'vendor']) {
        let names = [];
        try {
          names = await fs.readdir(path.join(root, folder));
        } catch {}
        for (const filename of names.sort()) {
          if (!/^(licen[cs]e|copying|notice|copyright|ofl)([.\-_]|$)/i.test(filename)) continue;
          try {
            const file = path.join(root, folder, filename),
              stat = await fs.stat(file);
            if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
            const text = await fs.readFile(file, 'utf8');
            const label = (folder ? folder + '/' : '') + filename;
            files.push(label);
            texts.push(`\n===== ${name}@${meta.version} — ${relative}/${label} =====\n\n${text}\n`);
          } catch {}
        }
      }
    }
    entries.push({
      name,
      version: meta.version,
      location: relative,
      license: declared,
      dev: !!meta.dev,
      optional: !!meta.optional,
      installed: !!installed,
      noticeFiles: files,
      review: !declared
        ? 'missing-license-metadata'
        : /SEE |Remotion/i.test(String(declared))
          ? 'custom-license-review'
          : !files.length && installed
            ? 'notice-file-review'
            : 'declared-license-not-legal-clearance',
    });
  }
  return {
    inventory: {
      schemaVersion: 1,
      lockSha256: createHash('sha256').update(raw).digest('hex'),
      platform: process.platform,
      architecture: process.arch,
      entries,
    },
    texts:
      'Third-party license and notice texts collected from installed dependencies.\nTheir original terms remain in force; collection is not legal compatibility clearance.\n' +
      texts.join(''),
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await collectLicenses();
  await fs.mkdir('licenses', { recursive: true });
  await fs.writeFile(
    'licenses/dependencies.json',
    JSON.stringify(result.inventory, null, 2) + '\n',
  );
  await fs.writeFile('licenses/THIRD-PARTY-LICENSE-TEXTS.txt', result.texts);
  console.log(
    `Collected ${result.inventory.entries.length} locked packages; ${result.inventory.entries.filter((e) => e.review !== 'declared-license-not-legal-clearance').length} entries need notice/custom-license review.`,
  );
}
