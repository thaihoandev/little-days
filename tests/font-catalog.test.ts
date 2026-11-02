import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fontIds, fonts, element, elementSchema } from '../packages/domain/index.js';
const packages = [
  'roboto',
  'nunito',
  'quicksand',
  'playfair-display',
  'merriweather',
  'montserrat',
  'source-sans-3',
  'comfortaa',
  'dancing-script',
  'eb-garamond',
];
test('13 font choices preserve legacy aliases and include local Vietnamese/Latin resources and original notices', async () => {
  assert.equal(fontIds.length, 13);
  assert.equal(new Set(Object.values(fonts)).size, 13);
  for (const font of fontIds)
    for (const align of ['left', 'center', 'right'] as const)
      assert.equal(
        elementSchema.parse(element('text', { font, align, text: 'Thương nhớ Việt Nam' })).font,
        font,
      );
  assert.equal(elementSchema.safeParse({ ...element('text'), font: 'remote-font' }).success, false);
  for (const name of packages) {
    for (const subset of ['vietnamese', 'latin'])
      assert.match(
        await readFile('node_modules/@fontsource/' + name + '/' + subset + '-400.css', 'utf8'),
        /@font-face/,
      );
    assert.match(
      await readFile('licenses/fonts/' + name + '-OFL.txt', 'utf8'),
      /SIL OPEN FONT LICENSE/,
    );
  }
  const stylesheet = await readFile('packages/scrapbook-renderer/additional-fonts.css', 'utf8');
  assert.equal((stylesheet.match(/@import/g) || []).length, 20);
});
