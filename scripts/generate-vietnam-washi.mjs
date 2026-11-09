import * as fontkit from 'fontkit';
import { writeFile } from 'node:fs/promises';
const fonts = ['latin', 'vietnamese'].map((subset) =>
  fontkit.openSync(
    `node_modules/@fontsource/patrick-hand/files/patrick-hand-${subset}-400-normal.woff`,
  ),
);
const names = [
  'Lần đầu gặp',
  'Hôm nay trời đẹp',
  'Ăn sập phố xá',
  'Giận hờn vu vơ',
  'Mãi bên nhau',
];
const paths = names.map((name) => {
  let offset = 0;
  const glyphs = [];
  for (const character of name) {
    const code = character.codePointAt(0),
      font = fonts.find((f) => f.hasGlyphForCodePoint(code));
    if (!font) throw Error('Missing Vietnamese glyph: ' + character);
    const glyph = font.glyphForCodePoint(code),
      scale = 27 / font.unitsPerEm;
    glyphs.push(
      `<path transform="translate(${offset.toFixed(3)} 0) scale(${scale.toFixed(6)} -${scale.toFixed(6)})" d="${glyph.path.toSVG()}"/>`,
    );
    offset += glyph.advanceWidth * scale;
  }
  return `<g transform="translate(${((300 - offset) / 2).toFixed(3)} 49)" fill="#76515a">${glyphs.join('')}</g>`;
});
await writeFile(
  'packages/domain/vietnam-washi.ts',
  '// Generated from bundled Patrick Hand (OFL-1.1); run scripts/generate-vietnam-washi.mjs.\nexport const vietnamWashiPaths = ' +
    JSON.stringify(paths, null, 2) +
    ' as const;\n',
);
console.log('Generated five Vietnamese handwritten washi outlines.');
