import type { ScrapElement } from './index.js';

export const photoStyleIds = [
  'polaroid',
  'classic',
  'rounded',
  'circle',
  'arch',
  'film',
  'stamp',
  'minimal',
  'cutout',
] as const;
export const photoStyleNames: Record<(typeof photoStyleIds)[number], string> = {
  polaroid: 'Polaroid dán giấy',
  classic: 'Viền ảnh triển lãm',
  rounded: 'Góc mềm',
  circle: 'Ô ảnh tròn',
  arch: 'Cửa vòm',
  film: 'Thước phim',
  stamp: 'Tem kỉ niệm',
  minimal: 'Ảnh tràn khung',
  cutout: 'Ảnh tự do / tách nền',
};
export type FrameShape = 'rect' | 'rounded' | 'ellipse' | 'arch' | 'stamp';
export function photoFrame(e: Pick<ScrapElement, 'photoStyle' | 'frameColor'>) {
  const style = e.photoStyle || 'polaroid';
  return {
    style,
    pad:
      style === 'minimal' || style === 'cutout'
        ? 0
        : style === 'stamp'
          ? 18
          : style === 'classic' || style === 'film'
            ? 16
            : 12,
    bottom: style === 'polaroid' ? 38 : style === 'film' ? 28 : 0,
    shape: (style === 'circle'
      ? 'ellipse'
      : style === 'rounded'
        ? 'rounded'
        : style === 'arch'
          ? 'arch'
          : style === 'stamp'
            ? 'stamp'
            : 'rect') as FrameShape,
    color: e.frameColor || (style === 'film' ? '#292e29' : '#fffdf8'),
    tape: style === 'polaroid',
    caption: style === 'polaroid',
  };
}
export function photoBox(e: ScrapElement) {
  const f = photoFrame(e);
  return {
    x: f.pad,
    y: f.style === 'film' ? 28 : f.pad,
    width: Math.max(1, e.width - f.pad * 2),
    height: Math.max(
      1,
      e.height - (f.style === 'film' ? 56 : f.pad * 2 + f.bottom - (f.caption ? 12 : 0)),
    ),
  };
}
type Command =
  | ['M' | 'L', number, number]
  | ['Q', number, number, number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];
function outline(w: number, h: number, shape: FrameShape): Command[] {
  if (shape === 'ellipse') {
    const x = w / 2,
      y = h / 2,
      k = 0.55228475;
    return [
      ['M', x, 0],
      ['C', x + x * k, 0, w, y - y * k, w, y],
      ['C', w, y + y * k, x + x * k, h, x, h],
      ['C', x - x * k, h, 0, y + y * k, 0, y],
      ['C', 0, y - y * k, x - x * k, 0, x, 0],
      ['Z'],
    ];
  }
  if (shape === 'arch') {
    const y = Math.min(w / 2, h * 0.65);
    return [
      ['M', 0, h],
      ['L', 0, y],
      ['C', 0, y * 0.448, w * 0.224, 0, w / 2, 0],
      ['C', w * 0.776, 0, w, y * 0.448, w, y],
      ['L', w, h],
      ['Z'],
    ];
  }
  if (shape === 'rounded') {
    const r = Math.min(28, w / 4, h / 4);
    return [
      ['M', r, 0],
      ['L', w - r, 0],
      ['Q', w, 0, w, r],
      ['L', w, h - r],
      ['Q', w, h, w - r, h],
      ['L', r, h],
      ['Q', 0, h, 0, h - r],
      ['L', 0, r],
      ['Q', 0, 0, r, 0],
      ['Z'],
    ];
  }
  if (shape === 'stamp') {
    const result: Command[] = [['M', 0, 0]],
      nx = Math.max(2, Math.ceil(w / 20)),
      ny = Math.max(2, Math.ceil(h / 20));
    for (let i = 0; i < nx; i++) result.push(['Q', ((i + 0.5) * w) / nx, 7, ((i + 1) * w) / nx, 0]);
    for (let i = 0; i < ny; i++)
      result.push(['Q', w - 7, ((i + 0.5) * h) / ny, w, ((i + 1) * h) / ny]);
    for (let i = nx; i > 0; i--)
      result.push(['Q', ((i - 0.5) * w) / nx, h - 7, ((i - 1) * w) / nx, h]);
    for (let i = ny; i > 0; i--) result.push(['Q', 7, ((i - 0.5) * h) / ny, 0, ((i - 1) * h) / ny]);
    result.push(['Z']);
    return result;
  }
  return [['M', 0, 0], ['L', w, 0], ['L', w, h], ['L', 0, h], ['Z']];
}
export const photoFramePath = (w: number, h: number, shape: FrameShape) =>
  outline(w, h, shape)
    .map((c) => c.join(' '))
    .join(' ');
type TraceContext = Pick<
  CanvasRenderingContext2D,
  'beginPath' | 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath'
>;
export function tracePhotoFrame(ctx: TraceContext, w: number, h: number, shape: FrameShape) {
  ctx.beginPath();
  for (const c of outline(w, h, shape)) {
    if (c[0] === 'M') ctx.moveTo(c[1], c[2]);
    else if (c[0] === 'L') ctx.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') ctx.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    else if (c[0] === 'C') ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
    else ctx.closePath();
  }
}
export function filmHoles(width: number, height: number) {
  return Array.from({ length: Math.max(2, Math.floor(width / 28)) }, (_, i) => [
    { x: 8 + i * 28, y: 7, width: 12, height: 10 },
    { x: 8 + i * 28, y: height - 17, width: 12, height: 10 },
  ])
    .flat()
    .filter((b) => b.x + b.width <= width - 5);
}
