import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { collectLicenses } from './license-inventory.mjs';
import { sourceOffer } from './source-offer.mjs';
const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
const repository = String(packageJson.repository?.url || '')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');
if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repository))
  throw new Error('Set repository.url to the public repository containing this deployment source.');
let commit = null,
  dirty = true;
try {
  const candidate = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  if (/^[a-f0-9]{40}$/.test(candidate)) commit = candidate;
  dirty = !!execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
} catch {
  const providerCommit = process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA;
  if (/^[a-f0-9]{40}$/.test(providerCommit || '')) {
    commit = providerCommit;
    dirty = false;
  }
}
const info = sourceOffer(repository, commit, dirty);
await fs.mkdir('apps/web/public/legal', { recursive: true });
for (const [source, target] of [
  ['LICENSE', 'AGPL-3.0-only.txt'],
  ['LICENSE.md', 'LICENSE.md'],
  ['LICENSE-REMOTION-EXCEPTION.md', 'REMOTION-EXCEPTION.md'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
])
  await fs.copyFile(source, 'apps/web/public/legal/' + target);
await fs.cp('licenses/fonts', 'apps/web/public/legal/fonts', { recursive: true });
await fs.cp('licenses/remotion', 'apps/web/public/legal/remotion', { recursive: true });
await fs.cp('licenses/background-removal', 'apps/web/public/legal/background-removal', {
  recursive: true,
});
const result = await collectLicenses();
await fs.writeFile(
  'apps/web/public/legal/dependencies.json',
  JSON.stringify(result.inventory, null, 2) + '\n',
);
await fs.writeFile('apps/web/public/legal/THIRD-PARTY-LICENSE-TEXTS.txt', result.texts);
await fs.writeFile('apps/web/public/legal-info.json', JSON.stringify(info, null, 2) + '\n');
console.log(
  'Prepared legal notices and ' +
    (info.revision
      ? 'exact-commit source offer.'
      : 'development source link (working tree is dirty or revision unknown).'),
);
