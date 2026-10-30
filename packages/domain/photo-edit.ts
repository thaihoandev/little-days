import { imageCrop, type Asset, type ScrapElement } from './index.js';
export const fullPhoto = { x: 0, y: 0, width: 1, height: 1 };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export function photoSize(asset?: Pick<Asset, 'width' | 'height'>) {
  return { width: asset?.width || 600, height: asset?.height || 650 };
}
export function photoWindow(e: ScrapElement, asset?: Pick<Asset, 'width' | 'height'>) {
  if (e.photoStyle === 'cutout') return { ...e.crop };
  const size = photoSize(asset);
  const crop = imageCrop(
    size.width,
    size.height,
    Math.max(1, e.width - 24),
    Math.max(1, e.height - 50),
    e.crop,
  );
  return {
    x: crop.x / size.width,
    y: crop.y / size.height,
    width: crop.width / size.width,
    height: crop.height / size.height,
  };
}
/** Shared image placement: cutouts contain the complete cropped subject without a paper frame. */
export function photoGeometry(e: ScrapElement, asset?: Pick<Asset, 'width' | 'height'>) {
  const size = photoSize(asset),
    c = photoWindow(e, asset);
  const crop = {
    x: c.x * size.width,
    y: c.y * size.height,
    width: c.width * size.width,
    height: c.height * size.height,
  };
  if (e.photoStyle !== 'cutout')
    return {
      x: 12,
      y: 12,
      width: Math.max(1, e.width - 24),
      height: Math.max(1, e.height - 50),
      crop,
    };
  const factor = Math.min(e.width / crop.width, e.height / crop.height),
    width = crop.width * factor,
    height = crop.height * factor;
  return { x: (e.width - width) / 2, y: (e.height - height) / 2, width, height, crop };
}
export function photoZoom(e: ScrapElement, asset?: Pick<Asset, 'width' | 'height'>) {
  return photoWindow({ ...e, crop: fullPhoto }, asset).width / photoWindow(e, asset).width;
}
export function zoomPhoto(
  e: ScrapElement,
  asset: Pick<Asset, 'width' | 'height'> | undefined,
  zoom: number,
) {
  const old = photoWindow(e, asset),
    base = photoWindow({ ...e, crop: fullPhoto }, asset);
  const width = base.width / clamp(zoom, 1, 8),
    height = base.height / clamp(zoom, 1, 8);
  return {
    x: clamp(old.x + old.width / 2 - width / 2, 0, 1 - width),
    y: clamp(old.y + old.height / 2 - height / 2, 0, 1 - height),
    width,
    height,
  };
}
export function panPhoto(
  e: ScrapElement,
  asset: Pick<Asset, 'width' | 'height'> | undefined,
  x: number,
  y: number,
) {
  const crop = photoWindow(e, asset);
  return { ...crop, x: clamp(x, 0, 1 - crop.width), y: clamp(y, 0, 1 - crop.height) };
}
