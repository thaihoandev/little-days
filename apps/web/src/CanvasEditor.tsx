import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Group, Rect, Text, Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { bounds, expandSelection } from '../../../packages/domain/layout.js';
import { elementSchema } from '../../../packages/domain/index.js';
import {
  type Album,
  type Page,
  type ScrapElement,
  fonts,
  assetUrl,
  displayedText,
  imageCrop,
  PAGE_HEIGHT,
  PAGE_WIDTH,
} from '../../../packages/domain/index.js';

function useImage(src?: string) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => {
    setImage(undefined);
    if (!src) return;
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);
  return image;
}
function Photo({ e, album }: { e: ScrapElement; album: Album }) {
  const image = useImage(assetUrl(e.assetId, album));
  const w = e.width - 24,
    h = Math.max(1, e.height - 50);
  let crop: { x: number; y: number; width: number; height: number } | undefined;
  if (image) crop = imageCrop(image.width, image.height, w, h, e.crop);
  return (
    <>
      <Rect
        width={e.width}
        height={e.height}
        fill="#fffdf8"
        shadowColor="#392d25"
        shadowBlur={15}
        shadowOpacity={0.16}
        shadowOffsetY={6}
      />
      <Rect x={12} y={12} width={Math.max(w, 1)} height={Math.max(h, 1)} fill="#d8d7c6" />
      {image && <KonvaImage image={image} x={12} y={12} width={w} height={h} crop={crop} />}
      <Rect
        x={e.width * 0.3}
        y={-9}
        width={e.width * 0.4}
        height={23}
        fill="#c6b68a"
        opacity={0.55}
        rotation={-3}
      />
      <Text
        x={6}
        y={e.height - 29}
        width={e.width - 12}
        height={24}
        text={e.text}
        align="center"
        fontFamily="Patrick Hand"
        fontSize={21}
        fill="#655c50"
      />
    </>
  );
}

export function CanvasEditor({
  album,
  page,
  selected,
  onSelect,
  onPatchMany,
  referenceDate,
  onEditText,
  zoom,
}: {
  album: Album;
  page: Page;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onPatchMany: (patches: { id: string; patch: Partial<ScrapElement> }[]) => void;
  referenceDate: string;
  onEditText: () => void;
  zoom: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const transformer = useRef<Konva.Transformer>(null);
  const [width, setWidth] = useState(600);
  const [fontReady, setFontReady] = useState(0);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const start = useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const dragging = useRef<{ id: string; ids: string[]; x: number; y: number } | null>(null);
  const [guides, setGuides] = useState<{ axis: 'x' | 'y'; value: number }[]>([]);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    if (wrap.current) observer.observe(wrap.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    void document.fonts.ready.then(() => setFontReady((n) => n + 1));
  }, []);
  const chosen = page.elements.filter((e) => selected.includes(e.id));
  const locked = chosen.some((e) => e.locked);
  const nodeFor = (id: string) => stage.current?.findOne('#' + id);
  useEffect(() => {
    transformer.current?.nodes(
      locked
        ? []
        : chosen
            .filter((e) => e.visible !== false)
            .map((e) => nodeFor(e.id))
            .filter((n): n is Konva.Node => !!n),
    );
  }, [selected, page, fontReady]);
  const scale = Math.max(0.1, Math.min((width - 72) / PAGE_WIDTH, 0.76) * zoom);
  const point = () => {
    const p = stage.current?.getPointerPosition();
    return p ? { x: p.x / scale, y: p.y / scale } : null;
  };
  const select = (id: string, additive = false) => {
    const ids = expandSelection(page.elements, [id]);
    onSelect(
      additive
        ? ids.every((id) => selected.includes(id))
          ? selected.filter((id) => !ids.includes(id))
          : [...new Set([...selected, ...ids])]
        : ids,
    );
  };
  const commit = (patches: { id: string; patch: Partial<ScrapElement> }[]) => {
    if (
      patches.every(
        ({ id, patch }) =>
          elementSchema.safeParse({ ...page.elements.find((e) => e.id === id), ...patch }).success,
      )
    )
      onPatchMany(patches);
    else
      page.elements.forEach((e) =>
        nodeFor(e.id)?.setAttrs({
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          rotation: e.rotation,
          scaleX: 1,
          scaleY: 1,
        }),
      );
  };
  const move = (node: Konva.Node) => {
    const d = dragging.current;
    if (!d) return;
    let dx = node.x() - d.x,
      dy = node.y() - d.y;
    const es = page.elements.filter((e) => d.ids.includes(e.id));
    dx = Math.max(
      -1000 - Math.min(...es.map((e) => e.x)),
      Math.min(dx, 2000 - Math.max(...es.map((e) => e.x))),
    );
    dy = Math.max(
      -1000 - Math.min(...es.map((e) => e.y)),
      Math.min(dy, 2500 - Math.max(...es.map((e) => e.y))),
    );
    const b = bounds(es.filter((e) => e.visible !== false));
    const targets = [
      { x: 0, y: 0, width: 720, height: 900 },
      ...page.elements
        .filter((e) => !d.ids.includes(e.id) && e.visible !== false)
        .map((e) => bounds([e])),
    ];
    const nextGuides: { axis: 'x' | 'y'; value: number }[] = [];
    for (const axis of ['x', 'y'] as const) {
      const size = axis === 'x' ? 'width' : 'height';
      let best = 6,
        correction = 0,
        line = 0;
      for (const t of targets)
        for (const f of [0, 0.5, 1])
          for (const tf of [0, 0.5, 1]) {
            const value = t[axis] + t[size] * tf,
              delta = value - (b[axis] + (axis === 'x' ? dx : dy) + b[size] * f);
            if (Math.abs(delta) < best) {
              best = Math.abs(delta);
              correction = delta;
              line = value;
            }
          }
      if (best < 6) {
        if (axis === 'x') dx += correction;
        else dy += correction;
        nextGuides.push({ axis, value: line });
      }
    }
    for (const e of es) nodeFor(e.id)?.position({ x: e.x + dx, y: e.y + dy });
    setGuides(nextGuides);
  };
  return (
    <div className="canvas-scroll" ref={wrap}>
      <div
        className="canvas-sheet"
        style={{ width: PAGE_WIDTH * scale, height: PAGE_HEIGHT * scale }}
      >
        <Stage
          ref={stage}
          width={PAGE_WIDTH * scale}
          height={PAGE_HEIGHT * scale}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(ev) => {
            if (ev.target === ev.target.getStage() || ev.target.name() === 'paper') {
              const p = point();
              if (p) {
                start.current = { ...p, additive: ev.evt.shiftKey };
                setMarquee({ ...p, width: 0, height: 0 });
              }
            }
          }}
          onMouseMove={() => {
            const p = point(),
              s = start.current;
            if (p && s)
              setMarquee({
                x: Math.min(p.x, s.x),
                y: Math.min(p.y, s.y),
                width: Math.abs(p.x - s.x),
                height: Math.abs(p.y - s.y),
              });
          }}
          onMouseUp={() => {
            if (start.current && marquee) {
              const ids = expandSelection(
                page.elements,
                page.elements
                  .filter((e) => {
                    const b = bounds([e]);
                    return (
                      e.visible !== false &&
                      !e.locked &&
                      marquee.width > 3 &&
                      marquee.height > 3 &&
                      b.x < marquee.x + marquee.width &&
                      b.x + b.width > marquee.x &&
                      b.y < marquee.y + marquee.height &&
                      b.y + b.height > marquee.y
                    );
                  })
                  .map((e) => e.id),
              );
              onSelect(start.current.additive ? [...new Set([...selected, ...ids])] : ids);
            }
            start.current = null;
            setMarquee(null);
          }}
        >
          <Layer>
            <Rect
              name="paper"
              width={720}
              height={900}
              fill={page.background}
              onTap={() => onSelect([])}
            />
            <Rect x={22} y={22} width={676} height={856} stroke="#9f895622" listening={false} />
            {page.elements.map((e) => (
              <Group
                key={e.id}
                id={e.id}
                visible={e.visible !== false}
                x={e.x}
                y={e.y}
                width={e.width}
                height={e.height}
                rotation={e.rotation}
                opacity={e.opacity}
                draggable={
                  !e.locked &&
                  !page.elements.some(
                    (other) => other.groupId && other.groupId === e.groupId && other.locked,
                  ) &&
                  !(selected.includes(e.id) && locked)
                }
                onClick={(ev) => select(e.id, ev.evt.shiftKey)}
                onTap={() => select(e.id)}
                onDblClick={() => {
                  if (e.type === 'text' && !e.locked) {
                    onSelect([e.id]);
                    onEditText();
                  }
                }}
                onDragStart={() => {
                  const ids = selected.includes(e.id)
                    ? selected
                    : expandSelection(page.elements, [e.id]);
                  onSelect(ids);
                  dragging.current = { id: e.id, ids, x: e.x, y: e.y };
                }}
                onDragMove={(ev) => move(ev.target)}
                onDragEnd={(ev) => {
                  move(ev.target);
                  const d = dragging.current;
                  if (d)
                    commit(
                      d.ids.map((id) => ({
                        id,
                        patch: { x: nodeFor(id)!.x(), y: nodeFor(id)!.y() },
                      })),
                    );
                  dragging.current = null;
                  setGuides([]);
                }}
              >
                {e.type === 'image' ? (
                  <Photo e={e} album={album} />
                ) : (
                  <Text
                    text={displayedText(e, album, referenceDate)}
                    width={e.width}
                    height={e.height}
                    fontFamily={fonts[e.font]}
                    fontSize={e.fontSize}
                    lineHeight={1.3}
                    fill={e.color}
                    align={e.align}
                    verticalAlign={e.type === 'sticker' ? 'middle' : 'top'}
                    wrap="word"
                  />
                )}
              </Group>
            ))}
            {guides.map((g) => (
              <Rect
                key={g.axis}
                x={g.axis === 'x' ? g.value : 0}
                y={g.axis === 'y' ? g.value : 0}
                width={g.axis === 'x' ? 1 : 720}
                height={g.axis === 'y' ? 1 : 900}
                fill="#b87978"
                listening={false}
              />
            ))}
            {marquee && (
              <Rect
                {...marquee}
                fill="#6d7c5422"
                stroke="#6d7c54"
                strokeWidth={1}
                listening={false}
              />
            )}
            <Transformer
              ref={transformer}
              rotateEnabled
              flipEnabled={false}
              ignoreStroke
              anchorSize={9}
              anchorFill="#fffdf8"
              anchorStroke="#6d7c54"
              borderStroke="#6d7c54"
              keepRatio={chosen.length > 1 || chosen[0]?.type === 'image'}
              onTransformEnd={() => {
                const visible = chosen.filter((e) => e.visible !== false);
                const first = visible[0];
                if (!first) return;
                const firstNode = nodeFor(first.id)!;
                const transform = firstNode.getTransform().copy();
                const oldTransform = firstNode.getTransform().copy();
                oldTransform.reset();
                oldTransform.translate(first.x, first.y);
                oldTransform.rotate((first.rotation * Math.PI) / 180);
                const delta = transform.copy().multiply(oldTransform.invert());
                const factor = firstNode.scaleX(),
                  rotation = firstNode.rotation() - first.rotation;
                const patches = chosen.map((e) => {
                  const n = nodeFor(e.id)!;
                  const hidden = e.visible === false;
                  const pos = hidden ? delta.point({ x: e.x, y: e.y }) : { x: n.x(), y: n.y() };
                  const sx = hidden ? factor : n.scaleX(),
                    sy = hidden ? factor : n.scaleY();
                  return {
                    id: e.id,
                    patch: {
                      ...pos,
                      width: e.width * sx,
                      height: e.height * sy,
                      rotation:
                        (((hidden ? e.rotation + rotation : n.rotation()) + 540) % 360) - 180,
                      ...(chosen.length > 1
                        ? { fontSize: Math.max(10, Math.min(160, e.fontSize * sx)) }
                        : {}),
                    },
                  };
                });
                chosen.forEach((e) => {
                  nodeFor(e.id)?.scale({ x: 1, y: 1 });
                });
                commit(patches);
              }}
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 24 * scale || newBox.height < 24 * scale ? oldBox : newBox
              }
            />
          </Layer>
        </Stage>
      </div>
      <div className="canvas-caption">
        {page.title} • Shift + chạm để chọn nhiều • Kéo vùng trống để chọn
      </div>
    </div>
  );
}
