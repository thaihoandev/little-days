import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  element,
  elementSchema,
  createAlbumContent,
  type Album,
} from '../packages/domain/index.js';
import { photoGeometry, photoWindow, zoomPhoto } from '../packages/domain/photo-edit.js';
import { ElementContent } from '../packages/scrapbook-renderer/index.js';
import { normalizePhoto } from '../apps/api/src/images.js';
import { readFile } from 'node:fs/promises';
test('cutouts contain the complete source crop while legacy Polaroid images retain cover geometry', () => {
  const size = { width: 1200, height: 600 },
    image = element('image', { width: 300, height: 400, photoStyle: 'cutout' });
  const g = photoGeometry(image, size);
  assert.deepEqual(g, {
    x: 0,
    y: 125,
    width: 300,
    height: 150,
    crop: { x: 0, y: 0, width: 1200, height: 600 },
  });
  const crop = zoomPhoto(image, size, 2);
  assert.deepEqual(crop, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  assert.deepEqual(photoWindow({ ...image, crop }, size), crop);
  assert.ok(elementSchema.safeParse({ ...image, crop }).success);
  const legacy = element('image', { width: 300, height: 400 });
  assert.equal(legacy.photoStyle, undefined);
  assert.equal(photoGeometry(legacy, size).x, 12);
  assert.ok(photoGeometry(legacy, size).crop.width < size.width);
});
test('shared DOM/video renderer does not add paper, tape or an opaque frame to a cutout', () => {
  const image = element('image', {
    photoStyle: 'cutout',
    width: 300,
    height: 400,
    assetId: 'private-photo',
  });
  const album: Album = {
    ...createAlbumContent(),
    id: crypto.randomUUID(),
    revision: 0,
    schemaVersion: 1,
    createdAt: '',
    updatedAt: '',
    assets: [
      { id: 'private-photo', name: 'cutout', url: '/private', width: 1200, height: 600, bytes: 50 },
    ],
  };
  const html = renderToStaticMarkup(
    React.createElement(ElementContent, { element: image, album, referenceDate: '2026-10-30' }),
  );
  assert.match(html, /data-photo-style="cutout"/);
  assert.doesNotMatch(html, /background:|box-shadow:|padding:/);
  const old = renderToStaticMarkup(
    React.createElement(ElementContent, {
      element: { ...image, photoStyle: undefined },
      album,
      referenceDate: '2026-10-30',
    }),
  );
  assert.match(old, /background:#fffdf8/);
});
test('standard WebP normalization preserves transparent pixels in derived images', async () => {
  const input = await sharp({
    create: { width: 60, height: 50, channels: 4, background: '#00000000' },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 20, height: 20, channels: 4, background: '#e68a5eff' },
        })
          .png()
          .toBuffer(),
        left: 20,
        top: 15,
      },
    ])
    .png()
    .toBuffer();
  const normalized = await normalizePhoto(input, 'webp');
  const { data, info } = await sharp(normalized.data)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.equal(data[3], 0);
  assert.equal(data[(25 * info.width + 30) * 4 + 3], 255);
});
test('pinned background resources include only the quantized model and CPU runtime, with hash-named chunks', async () => {
  const manifest = JSON.parse(await readFile('packages/background-removal/resources.json', 'utf8'));
  assert.equal(Object.keys(manifest).length, 3);
  assert.ok(manifest['/models/isnet_quint8']);
  let total = 0;
  for (const entry of Object.values(manifest) as {
    size: number;
    chunks: { name: string; hash: string; offsets: number[] }[];
  }[]) {
    total += entry.size;
    assert.equal(
      entry.chunks.reduce((sum, c) => sum + c.offsets[1] - c.offsets[0], 0),
      entry.size,
    );
    for (const chunk of entry.chunks) {
      assert.match(chunk.name, /^[a-f0-9]{64}$/);
      assert.equal(chunk.name, chunk.hash);
    }
  }
  assert.ok(total < 60 * 1048576);
});
