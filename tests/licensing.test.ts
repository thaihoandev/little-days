import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sourceOffer } from '../scripts/source-offer.mjs';
test('source offer identifies exact clean builds and does not mislabel dirty/unknown builds', () => {
  const repository = 'https://github.com/thaihoandev/little-days',
    hash = 'a'.repeat(40);
  const clean = sourceOffer(repository, hash, false);
  assert.equal(clean.revision, hash);
  assert.equal(clean.development, false);
  assert.equal(clean.archiveUrl, repository + '/archive/' + hash + '.tar.gz');
  assert.equal(sourceOffer(repository, hash, true).revision, null);
  assert.equal(sourceOffer(repository, null, false).archiveUrl, null);
  assert.throws(() => sourceOffer('javascript:alert(1)', hash, false));
});
test('project licensing includes original AGPL text, approved exception, fonts and a current dependency inventory', async () => {
  const license = await readFile('LICENSE', 'utf8');
  assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE/);
  assert.match(license, /13\. Remote Network Interaction/);
  assert.match(
    await readFile('LICENSE-REMOTION-EXCEPTION.md', 'utf8'),
    /additional permission under section 7/,
  );
  const lock = await readFile('package-lock.json', 'utf8'),
    inventory = JSON.parse(await readFile('licenses/dependencies.json', 'utf8'));
  assert.equal(inventory.lockSha256, createHash('sha256').update(lock).digest('hex'));
  assert.ok(inventory.entries.some((e: { name: string }) => e.name === 'remotion'));
  assert.ok(inventory.entries.length > 100);
  for (const font of ['be-vietnam-pro', 'caveat', 'lora', 'patrick-hand'])
    assert.match(
      await readFile('licenses/fonts/' + font + '-OFL.txt', 'utf8'),
      /SIL OPEN FONT LICENSE/,
    );
});
