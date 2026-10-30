import sharp from 'sharp';

export const PHOTO_STANDARD_EDGE = 1600;
export const PHOTO_TARGET_BYTES = 700 * 1024;
export async function normalizePhoto(input: Buffer, format: 'webp' | 'jpeg') {
  const source = sharp(input, { limitInputPixels: 40000000, animated: false });
  const metadata = await source.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format || ''))
    throw new Error('Unsupported image');
  const encode = (edge: number, quality: number) => {
    let image = source
      .clone()
      .rotate()
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true });
    if (format === 'jpeg')
      image = image.flatten({ background: '#fffdf7' }).jpeg({ quality, mozjpeg: true });
    else image = image.webp({ quality, effort: 3 });
    return image.toBuffer({ resolveWithObject: true });
  };
  let output = await encode(PHOTO_STANDARD_EDGE, 80);
  if (output.data.length > PHOTO_TARGET_BYTES) output = await encode(1280, 72);
  if (output.data.length > PHOTO_TARGET_BYTES) output = await encode(1024, 66);
  return output;
}
