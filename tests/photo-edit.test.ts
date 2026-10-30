import test from 'node:test';
import assert from 'node:assert/strict';
import { element, elementSchema } from '../packages/domain/index.js';
import {
  fullPhoto,
  photoWindow,
  zoomPhoto,
  panPhoto,
  photoZoom,
} from '../packages/domain/photo-edit.js';
import { paperPalettes, recolorPage } from '../packages/domain/palettes.js';
import { templatePage } from '../packages/domain/templates.js';
test('aspect-ratio clipping can pan at 1x and zoom retains a bounded source window', () => {
  const asset = { width: 1600, height: 900 },
    e = element('image', { width: 300, height: 450 });
  const initial = photoWindow(e, asset);
  assert.ok(initial.width < 1 && Math.abs(initial.height - 1) < 1e-9);
  const left = panPhoto(e, asset, 0, 0),
    right = panPhoto(e, asset, 1, 1);
  assert.equal(left.x, 0);
  assert.ok(right.x > left.x);
  for (const zoom of [1, 2, 4, 8]) {
    const crop = zoomPhoto({ ...e, crop: right }, asset, zoom),
      next = { ...e, crop };
    assert.ok(elementSchema.safeParse(next).success);
    assert.ok(Math.abs(photoZoom(next, asset) - zoom) < 1e-8);
    const actual = photoWindow(next, asset);
    assert.ok(
      Math.abs(actual.width - crop.width) < 1e-8 && Math.abs(actual.height - crop.height) < 1e-8,
    );
  }
  assert.equal(photoZoom({ ...e, crop: fullPhoto }, asset), 1);
});
test('portrait and rotated frames keep crop inside source across zoom and pan', () => {
  for (const size of [
    { width: 900, height: 1600 },
    { width: 1000, height: 1000 },
  ]) {
    const e = element('image', { width: 540, height: 250, rotation: 27 });
    for (const zoom of [1, 3, 8]) {
      const crop = zoomPhoto(e, size, zoom);
      for (const x of [-2, 0.5, 4]) {
        const moved = panPhoto({ ...e, crop }, size, x, 5);
        assert.ok(elementSchema.safeParse({ ...e, crop: moved }).success);
      }
    }
  }
});
test('page palettes recolor editable text while preserving images, decoration and geometry', () => {
  const page = templatePage('sunset');
  for (const palette of paperPalettes) {
    const next = recolorPage(page, palette);
    assert.equal(next.background, palette.paper);
    page.elements.forEach((e, i) => {
      assert.equal(next.elements[i].x, e.x);
      assert.equal(next.elements[i].width, e.width);
      if (e.type === 'image' || e.decorationId) assert.deepEqual(next.elements[i], e);
      if (e.type === 'text') assert.equal(next.elements[i].color, palette.ink);
    });
  }
});
