import test from 'node:test';
import assert from 'node:assert/strict';
import {
  albumContentSchema,
  createAlbumContent,
  defaultPresentation,
} from '../packages/domain/index.js';
import { builtInTemplates, templatePage } from '../packages/domain/templates.js';
import { contentOf } from '../apps/web/src/useDocument.js';

test('old documents remain unchanged; presentation and kind survive content extraction, validation and drafts', () => {
  const old = createAlbumContent();
  assert.deepEqual(albumContentSchema.parse(old), old);
  const content = {
    ...old,
    documentKind: 'invitation' as const,
    presentation: {
      ...defaultPresentation,
      musicId: 'evening' as const,
      ambience: 'sparkles' as const,
    },
  };
  const album = {
    ...content,
    id: crypto.randomUUID(),
    revision: 7,
    assets: [],
    createdAt: '',
    updatedAt: '',
    schemaVersion: 1 as const,
  };
  assert.deepEqual(contentOf(album), content);
  assert.deepEqual(albumContentSchema.parse(contentOf(album)), content);
  assert.equal(
    albumContentSchema.safeParse({ ...content, presentation: { musicId: 'custom' } }).success,
    false,
  );
  assert.equal(
    albumContentSchema.safeParse({
      ...content,
      presentation: { musicId: 'https://untrusted.test/track.mp3' },
    }).success,
    false,
  );
});

test('four invitation designs contain editable real artwork within fixed page geometry with unique IDs', () => {
  const specs = builtInTemplates.filter((t) => t.id.startsWith('invite-'));
  assert.equal(specs.length, 4);
  for (const spec of specs) {
    const page = templatePage(spec.id),
      copy = templatePage(spec.id, ['fixture-photo']);
    albumContentSchema.parse({ ...createAlbumContent(), pages: [page] });
    assert.notEqual(page.id, copy.id);
    assert.equal(new Set(page.elements.map((e) => e.id)).size, page.elements.length);
    assert.ok(page.elements.filter((e) => e.type === 'text').length >= 6);
    assert.ok(page.elements.some((e) => e.decorationId));
    for (const e of page.elements) {
      assert.ok(e.x >= 0 && e.y >= 0 && e.x + e.width <= 720 && e.y + e.height <= 900);
      assert.equal(e.locked, false);
      assert.ok(!copy.elements.some((x) => x.id === e.id));
    }
    if (copy.elements.some((e) => e.type === 'image'))
      assert.ok(copy.elements.some((e) => e.assetId === 'fixture-photo'));
  }
});
