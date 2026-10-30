import sharp from 'sharp';
const source = 'apps/web/public/logo.svg';
for (const [size, name] of [
  [32, 'favicon-32.png'],
  [180, 'apple-touch-icon.png'],
]) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile('apps/web/public/' + name);
}
console.log('Generated favicon and Apple touch icon from the original Little Days SVG.');
