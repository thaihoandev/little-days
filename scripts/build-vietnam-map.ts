import { readFile, writeFile } from 'node:fs/promises';
import clipping from 'polygon-clipping';
import { format } from 'prettier';
import {
  LEGACY_PROVINCES,
  VIETNAM_PROVINCES,
  normalizeVietnamese,
} from '../packages/domain/vietnam-provinces.js';
import { provinceGroups } from '../packages/domain/vietnam-province-groups.js';

// Explicit, offline maintenance command. Pinned input and attribution: docs/VIETNAM_MAP_DATA.md.
const input = process.argv[2];
if (!input || process.argv.length !== 3)
  throw Error('Usage: node --import tsx scripts/build-vietnam-map.ts <pinned-geojson>');
type Feature = {
  properties: { shapeName: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};
const source = JSON.parse(await readFile(input, 'utf8')) as { features: Feature[] };
if (source.features.length !== 64)
  throw Error('Expected the pinned geoBoundaries 64-feature source.');
const shapes = new Map<string, clipping.MultiPolygon[]>();
for (const feature of source.features) {
  const label = normalizeVietnamese(feature.properties.shapeName);
  const legacy =
    label === 'con dao'
      ? 'ba-ria-vung-tau'
      : label === 'ho chi minh'
        ? 'tp-hcm'
        : LEGACY_PROVINCES.find((p) => normalizeVietnamese(p.name) === label)?.id;
  if (!legacy) throw Error('Unmapped source shape: ' + label);
  const id =
    Object.entries(provinceGroups).find(([, members]) => members.includes(legacy))?.[0] || legacy;
  const polygons = (
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates
  ) as clipping.MultiPolygon;
  shapes.set(id, [...(shapes.get(id) || []), polygons]);
}
const rings: Record<string, number[][][]> = {};
for (const province of VIETNAM_PROVINCES) {
  const polygons = shapes.get(province.id);
  if (!polygons?.length) throw Error('Missing geometry: ' + province.id);
  rings[province.id] = clipping
    .union(polygons[0], ...polygons.slice(1))
    .flatMap((p) => p.map((r) => r.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))])));
}
const code = `// geoBoundaries VNM ADM1 9469f09, grouped per Resolution 202/2025/QH15. Approximate travel geometry; see docs/VIETNAM_MAP_DATA.md.
export const provinceRings: Record<string, number[][][]> = ${JSON.stringify(rings)};
export const provincePath = (id: string) => provinceRings[id]?.map(r => r.map(([x,y],i) => (i ? 'L' : 'M') + ((x-102)*38+10).toFixed(2) + ',' + ((24-y)*49).toFixed(2)).join(' ') + ' Z').join(' ') || '';
`;
await writeFile(
  'packages/domain/vietnam-geometry.ts',
  await format(code, { parser: 'typescript', singleQuote: true, printWidth: 100 }),
);
console.log('Generated 34 current province groups from pinned reference geometry.');
