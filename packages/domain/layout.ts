import { type ScrapElement, type Page } from './index.js';

export function bounds(elements: ScrapElement[]) {
  if (!elements.length) return { x: 0, y: 0, width: 0, height: 0 };
  const points = elements.flatMap((e) => {
    const r = (e.rotation * Math.PI) / 180;
    return [
      [0, 0],
      [e.width, 0],
      [0, e.height],
      [e.width, e.height],
    ].map(([x, y]) => ({
      x: e.x + x * Math.cos(r) - y * Math.sin(r),
      y: e.y + x * Math.sin(r) + y * Math.cos(r),
    }));
  });
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
}
export function expandSelection(elements: ScrapElement[], ids: string[]) {
  const groups = new Set(
    elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId),
  );
  return elements
    .filter((e) => ids.includes(e.id) || (e.groupId && groups.has(e.groupId)))
    .map((e) => e.id);
}
export function translated(elements: ScrapElement[], ids: string[], dx: number, dy: number) {
  const selected = elements.filter((e) => ids.includes(e.id));
  if (selected.some((e) => e.locked)) return elements;
  const b = bounds(selected);
  dx = Math.max(
    -1000 - Math.min(...selected.map((e) => e.x)),
    Math.min(dx, 2000 - Math.max(...selected.map((e) => e.x))),
  );
  dy = Math.max(
    -1000 - Math.min(...selected.map((e) => e.y)),
    Math.min(dy, 2500 - Math.max(...selected.map((e) => e.y))),
  );
  if (!b.width && !b.height) return elements;
  return elements.map((e) => (ids.includes(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e));
}
type Unit = { ids: string[]; box: ReturnType<typeof bounds> };
function units(elements: ScrapElement[], ids: string[]): Unit[] {
  const map = new Map<string, ScrapElement[]>();
  for (const e of elements.filter((e) => ids.includes(e.id))) {
    const key = e.groupId || e.id;
    map.set(key, [...(map.get(key) || []), e]);
  }
  return [...map.values()].map((es) => ({ ids: es.map((e) => e.id), box: bounds(es) }));
}
export type Alignment =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'horizontal'
  | 'vertical'
  | 'page-center';
export function alignElements(elements: ScrapElement[], ids: string[], action: Alignment) {
  if (elements.some((e) => ids.includes(e.id) && e.locked)) return elements;
  const selected = elements.filter((e) => ids.includes(e.id));
  if (!selected.length) return elements;
  const box = bounds(selected);
  if (action === 'page-center')
    return translated(elements, ids, 360 - box.x - box.width / 2, 450 - box.y - box.height / 2);
  const items = units(elements, ids);
  const horizontal = ['left', 'center', 'right', 'horizontal'].includes(action);
  const axis = horizontal ? 'x' : 'y',
    size = horizontal ? 'width' : 'height';
  if (action === 'horizontal' || action === 'vertical') {
    if (items.length < 3) return elements;
    items.sort((a, b) => a.box[axis] - b.box[axis]);
    const gap = (box[size] - items.reduce((n, u) => n + u.box[size], 0)) / (items.length - 1);
    let cursor = box[axis],
      result = elements;
    for (const u of items) {
      const delta = cursor - u.box[axis];
      result = translated(result, u.ids, horizontal ? delta : 0, horizontal ? 0 : delta);
      cursor += u.box[size] + gap;
    }
    return result;
  }
  const factor = ['center', 'middle'].includes(action)
    ? 0.5
    : ['right', 'bottom'].includes(action)
      ? 1
      : 0;
  const target =
    items.length === 1 ? (horizontal ? 720 : 900) * factor : box[axis] + box[size] * factor;
  return items.reduce((result, u) => {
    const delta = target - u.box[axis] - u.box[size] * factor;
    return translated(result, u.ids, horizontal ? delta : 0, horizontal ? 0 : delta);
  }, elements);
}
export function reorderElements(elements: ScrapElement[], ids: string[], direction: 'up' | 'down') {
  const result = [...elements];
  const indices = result.map((_, i) => i);
  if (direction === 'up') indices.reverse();
  const step = direction === 'up' ? 1 : -1;
  for (const i of indices) {
    const j = i + step;
    if (j >= 0 && j < result.length && ids.includes(result[i].id) && !ids.includes(result[j].id))
      [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function cloneLayout(page: Page, assetIds?: string[]): Page {
  const groups = new Map<string, string>();
  let photo = 0;
  return {
    ...structuredClone(page),
    id: crypto.randomUUID(),
    elements: page.elements.map((e) => {
      if (e.groupId && !groups.has(e.groupId)) groups.set(e.groupId, crypto.randomUUID());
      return {
        ...structuredClone(e),
        id: crypto.randomUUID(),
        groupId: e.groupId ? groups.get(e.groupId)! : null,
        assetId:
          e.type === 'image' && assetIds
            ? assetIds[photo++ % Math.max(1, assetIds.length)] || null
            : e.assetId,
      };
    }),
  };
}
