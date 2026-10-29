import test from 'node:test';
import assert from 'node:assert/strict';
import { element, pageSchema, layoutTemplateSchema } from '../packages/domain/index.js';
import {
  bounds,
  alignElements,
  cloneLayout,
  expandSelection,
  reorderElements,
  translated,
} from '../packages/domain/layout.js';

test('rotated bounds and page centering preserve a group geometry', () => {
  const groupId = crypto.randomUUID();
  const es = [
    element('image', { x: 100, y: 100, width: 100, height: 200, rotation: 90, groupId }),
    element('text', { x: 200, y: 300, width: 100, height: 50, groupId }),
  ];
  assert.deepEqual(bounds(es), { x: -100, y: 100, width: 400, height: 250 });
  const result = alignElements(
    es,
    es.map((e) => e.id),
    'page-center',
  );
  const b = bounds(result);
  assert.equal(b.x + b.width / 2, 360);
  assert.equal(b.y + b.height / 2, 450);
  assert.equal(result[1].x - result[0].x, 100);
  assert.equal(result[0].rotation, 90);
  assert.deepEqual(
    expandSelection(es, [es[0].id]),
    es.map((e) => e.id),
  );
});
test('equal gaps use visual bounds and treat groups as units', () => {
  const es = [
    element('text', { x: 0, width: 100, rotation: 0 }),
    element('text', { x: 200, width: 50, rotation: 0 }),
    element('text', { x: 500, width: 100, rotation: 0 }),
  ];
  const result = alignElements(
    es,
    es.map((e) => e.id),
    'horizontal',
  );
  assert.equal(result[1].x - 100, result[2].x - (result[1].x + 50));
  assert.equal(result[0].x, 0);
  assert.equal(result[2].x, 500);
  const withLock = es.map((e, i) => ({ ...e, locked: i === 1 }));
  assert.deepEqual(
    alignElements(
      withLock,
      es.map((e) => e.id),
      'left',
    ),
    withLock,
  );
  assert.deepEqual(
    translated(
      withLock,
      es.map((e) => e.id),
      20,
      10,
    ),
    withLock,
  );
});
test('reorder preserves selected relative order, cloning isolates groups and replaces images', () => {
  const groupId = crypto.randomUUID();
  const es = [
    element('image', { groupId, assetId: 'private-source' }),
    element('text', { groupId }),
    element('sticker'),
  ];
  assert.deepEqual(
    reorderElements(
      es,
      es.slice(0, 2).map((e) => e.id),
      'up',
    ).map((e) => e.id),
    [es[2].id, es[0].id, es[1].id],
  );
  const page = { id: crypto.randomUUID(), title: 'Test', background: '#ffffff', elements: es };
  const cloned = cloneLayout(page, ['target-photo']);
  assert.notEqual(cloned.id, page.id);
  assert.notEqual(cloned.elements[0].groupId, groupId);
  assert.equal(cloned.elements[0].groupId, cloned.elements[1].groupId);
  assert.equal(cloned.elements[0].assetId, 'target-photo');
  assert.equal(cloneLayout(page, []).elements[0].assetId, null);
  assert.ok(pageSchema.safeParse(cloned).success);
  assert.ok(layoutTemplateSchema.safeParse({ name: 'Mẫu của mình', page }).success);
  assert.ok(!layoutTemplateSchema.safeParse({ name: '  ', page }).success);
});
test('legacy elements remain visible by default and translation respects stored limits', () => {
  const es = [element('text', { x: 1999, y: 2499 }), element('text', { x: 1900, y: 2400 })];
  const result = translated(
    es,
    es.map((e) => e.id),
    100,
    100,
  );
  assert.equal(result[0].x, 2000);
  assert.equal(result[0].y, 2500);
  assert.equal(result[0].x - result[1].x, 99);
  assert.equal(result[0].visible, undefined);
});
