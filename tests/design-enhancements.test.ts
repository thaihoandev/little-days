import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  element,
  createAlbumContent,
  albumContentSchema,
  displayedText,
  type Album,
} from '../packages/domain/index.js';
import { counterAppearance, counterStyleIds, counterMotif } from '../packages/domain/counter.js';
import sharp from 'sharp';
import { visualMotion } from '../packages/domain/visual-effects.js';
import { captureDesign, applyDesign } from '../packages/domain/design-tools.js';
import { ElementContent, PageArtwork } from '../packages/scrapbook-renderer/index.js';
const album: Album = {
  ...createAlbumContent(),
  id: randomUUID(),
  revision: 0,
  schemaVersion: 1,
  assets: [],
  createdAt: '2026-11-03T00:00:00Z',
  updatedAt: '2026-11-03T00:00:00Z',
};

test('new counter motifs are distinct self-contained SVGs with requested dimensions', async () => {
  const images = new Set<string>();
  for (const style of ['postcard', 'midnight', 'stamp', 'notebook', 'ribbon'] as const) {
    const uri = counterMotif(style, 350, 190, '#aa8899')!;
    images.add(uri);
    const bytes = Buffer.from(decodeURIComponent(uri.split(',')[1]));
    const result = await sharp(bytes).metadata();
    assert.equal(result.width, 350);
    assert.equal(result.height, 190);
    assert.doesNotMatch(bytes.toString(), /https?:\/\/(?!www.w3.org\/2000\/svg)/);
  }
  assert.equal(images.size, 5);
  assert.equal(counterMotif('card', 350, 190, '#aa8899'), undefined);
});
test('custom counter date, caption and colors round trip and use the same appearance in shared artwork', () => {
  const e = element('anniversary', {
    counterStyle: 'notebook',
    counterDate: '2024-01-01',
    counterCaption: 'ngày giữ thương',
    counterFill: '#ffeedd',
    counterStroke: '#8899aa',
    counterAccent: '#aabbcc',
    visualEffect: 'float',
  });
  const content = { ...album, pages: [{ ...album.pages[0], elements: [e] }] };
  const parsed = albumContentSchema.parse(content).pages[0].elements[0];
  assert.equal(displayedText(parsed, album, '2024-01-11'), '10 ngày\nngày giữ thương');
  assert.deepEqual(counterAppearance(parsed.counterStyle, parsed), {
    ...counterAppearance('notebook'),
    fill: '#ffeedd',
    stroke: '#8899aa',
    accent: '#aabbcc',
  });
  const markup = renderToStaticMarkup(
    React.createElement(ElementContent, { element: parsed, album, referenceDate: '2024-01-11' }),
  );
  assert.match(markup, /background:#ffeedd/);
  assert.match(markup, /#8899aa/);
  assert.match(markup, /#aabbcc/);
  assert.throws(() =>
    albumContentSchema.parse({
      ...content,
      pages: [
        { ...content.pages[0], elements: [{ ...e, counterFill: 'url(https://example.test)' }] },
      ],
    }),
  );
  for (const style of counterStyleIds.filter((s) => s !== 'plain'))
    assert.ok(counterAppearance(style));
});
test('loop effects have neutral editing frame and deterministic frame-based motion in shared artwork', () => {
  for (const effect of ['none', 'float', 'pulse', 'swing'] as const)
    assert.deepEqual(visualMotion(effect, 0), { y: 0, rotation: 0, scale: 1 });
  assert.equal(visualMotion('float', 1).y, -6);
  assert.equal(visualMotion('swing', 1).rotation, 2.5);
  assert.ok(visualMotion('pulse', 0.75).scale > 1);
  assert.deepEqual(visualMotion('float', NaN), visualMotion('float', 0));
  const e = element('anniversary', { counterStyle: 'midnight', visualEffect: 'float' });
  const markup = renderToStaticMarkup(
    React.createElement(PageArtwork, {
      page: { ...album.pages[0], elements: [e] },
      album,
      referenceDate: '2026-11-03',
      effectTime: 1,
    }),
  );
  assert.match(markup, /data-visual-effect="float"/);
  assert.match(markup, /translateY\(-6px\)/);
});
test('style paste is one geometry-preserving edit and cannot overwrite text, dates, photos or locked groups', () => {
  const source = element('anniversary', {
    color: '#123456',
    counterStyle: 'stamp',
    counterFill: '#e9dfed',
    visualEffect: 'pulse',
    counterDate: '2020-01-01',
  });
  const target = element('anniversary', {
    x: 40,
    y: 50,
    width: 320,
    height: 180,
    rotation: 13,
    text: 'Của mình',
    counterDate: '2025-01-01',
  });
  const photo = element('image', { assetId: 'my-private-photo', width: 200, height: 250 });
  const result = applyDesign([target, photo], [target.id, photo.id], captureDesign(source));
  assert.equal(result[0].counterFill, '#e9dfed');
  assert.equal(result[0].counterDate, target.counterDate);
  assert.equal(result[0].text, target.text);
  for (const key of ['id', 'x', 'y', 'width', 'height', 'rotation', 'assetId'] as const)
    assert.equal(result[0][key], target[key]);
  assert.equal(result[1].assetId, photo.assetId);
  assert.equal(result[1].counterStyle, undefined);
  const locked = [target, { ...photo, locked: true }];
  assert.equal(applyDesign(locked, [target.id, photo.id], captureDesign(source)), locked);
});
