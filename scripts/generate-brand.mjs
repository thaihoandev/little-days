import sharp from 'sharp';
const source = 'apps/web/public/logo.svg';
for (const [size, name] of [
  [32, 'favicon-32.png'],
  [180, 'apple-touch-icon.png'],
  [192, 'pwa-192x192.png'],
  [512, 'pwa-512x512.png'],
]) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile('apps/web/public/' + name);
}
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#faedf0' } })
  .composite([{ input: await sharp(source).resize(410, 410).png().toBuffer(), left: 51, top: 51 }])
  .png()
  .toFile('apps/web/public/pwa-maskable-512x512.png');
console.log('Generated favicon and Apple touch icon from the original Little Days SVG.');
