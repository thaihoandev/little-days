import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { normalizePhoto, PHOTO_STANDARD_EDGE, PHOTO_TARGET_BYTES } from '../apps/api/src/images.js';
import {
  counterPreset,
  counterPresets,
  textPreset,
  textPresets,
} from '../packages/domain/presets.js';
import { elementSchema, displayedText } from '../packages/domain/index.js';

test('creative presets keep independent IDs, selectable counter styles and dynamic dates', () => {
  for (const spec of textPresets) {
    const e = textPreset(spec.id);
    assert.ok(elementSchema.safeParse(e).success);
    assert.notEqual(e.id, textPreset(spec.id).id);
  }
  for (const spec of counterPresets) {
    const e = counterPreset(spec.id);
    assert.ok(elementSchema.safeParse(e).success);
    assert.notEqual(e.id, counterPreset(spec.id).id);
    const album = { startDate: '2024-10-20' };
    assert.notEqual(displayedText(e, album, '2026-10-30'), displayedText(e, album, '2026-10-31'));
    assert.equal(elementSchema.safeParse({ ...e, counterStyle: 'unknown' }).success, false);
  }
  assert.throws(() => counterPreset('unknown'));
  assert.throws(() => textPreset('unknown'));
});
test('standard photos rotate orientation, strip EXIF and avoid enlarging small images', async () => {
  const source = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#a8b58c' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  for (const format of ['jpeg', 'webp'] as const) {
    const normalized = await normalizePhoto(source, format),
      metadata = await sharp(normalized.data).metadata();
    assert.equal(metadata.width, 240);
    assert.equal(metadata.height, 320);
    assert.equal(metadata.orientation, undefined);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.format, format);
  }
  await assert.rejects(
    normalizePhoto(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
      'webp',
    ),
  );
});
test('heavy photos shrink to bounded dimensions and an economical encoded size', async () => {
  const source = await sharp(randomBytes(2200 * 1800 * 3), {
    raw: { width: 2200, height: 1800, channels: 3 },
  })
    .png()
    .toBuffer();
  for (const format of ['jpeg', 'webp'] as const) {
    const image = await normalizePhoto(source, format);
    assert.ok(image.info.width <= PHOTO_STANDARD_EDGE && image.info.height <= PHOTO_STANDARD_EDGE);
    assert.ok(
      image.data.length <= PHOTO_TARGET_BYTES,
      'High entropy photo should use the fallback compression profile',
    );
    assert.ok(image.data.length < source.length / 5);
  }
});
