import { z } from 'zod';
import { decorationIds } from './decorations.js';
import { counterStyleIds } from './counter.js';

const finite = z.number().finite();
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return (
      !Number.isNaN(+d) &&
      d.toISOString().slice(0, 10) === s &&
      s >= '1900-01-01' &&
      s <= '2200-12-31'
    );
  }, 'Ngày không hợp lệ');
export const themeSchema = z.enum(['polaroid', 'letter', 'timeline']);
export type Theme = z.infer<typeof themeSchema>;
export const elementSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['image', 'text', 'sticker', 'anniversary']),
  x: finite.min(-1000).max(2000),
  y: finite.min(-1000).max(2500),
  width: finite.min(24).max(1600),
  height: finite.min(24).max(2000),
  rotation: finite.min(-360).max(360),
  opacity: finite.min(0).max(1),
  locked: z.boolean(),
  visible: z.boolean().optional(),
  groupId: z.string().uuid().nullable().optional(),
  text: z.string().max(3000),
  assetId: z.string().max(100).nullable(),
  decorationId: z.enum(decorationIds).optional(),
  font: z.enum(['serif', 'sans', 'hand']),
  fontSize: finite.min(10).max(160),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  align: z.enum(['left', 'center', 'right']),
  crop: z
    .object({
      x: finite.min(0).max(1),
      y: finite.min(0).max(1),
      width: finite.min(0.01).max(1),
      height: finite.min(0.01).max(1),
    })
    .refine((c) => c.x + c.width <= 1.001 && c.y + c.height <= 1.001),
  animation: z.enum(['none', 'fade', 'rise', 'drop']),
  dateMode: z.enum(['elapsed', 'annual', 'milestone']).optional(),
  counterStyle: z.enum(counterStyleIds).optional(),
  milestoneDays: z.number().int().min(1).max(50000).optional(),
});
export type ScrapElement = z.infer<typeof elementSchema>;
export const pageSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().max(120),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    elements: z.array(elementSchema).max(50),
  })
  .refine(
    (p) => new Set(p.elements.map((e) => e.id)).size === p.elements.length,
    'ID phần tử bị trùng',
  );
export type Page = z.infer<typeof pageSchema>;
export const layoutTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  page: pageSchema,
});
export type LayoutTemplate = z.infer<typeof layoutTemplateSchema> & {
  id: string;
  createdAt: string;
};
export const memorySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(160),
  date: dateString,
  body: z.string().max(3000),
  featured: z.boolean(),
  assetId: z.string().nullable(),
});
export type Memory = z.infer<typeof memorySchema>;
export const albumContentSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    names: z.tuple([z.string().trim().min(1).max(60), z.string().trim().min(1).max(60)]),
    startDate: dateString,
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    theme: themeSchema,
    pages: z.array(pageSchema).min(1).max(20),
    memories: z.array(memorySchema).max(100),
  })
  .refine((a) => new Set(a.pages.map((p) => p.id)).size === a.pages.length, 'ID trang bị trùng');
export type AlbumContent = z.infer<typeof albumContentSchema>;
export type Asset = {
  id: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  url: string;
};
export type Album = AlbumContent & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  assets: Asset[];
  schemaVersion: 1;
};
export type AlbumVersionSummary = {
  revision: number;
  title: string;
  pageCount: number;
  capturedAt: string;
  label: string;
};
export type AlbumVersions = {
  currentRevision: number;
  limit: number;
  versions: AlbumVersionSummary[];
};
export const saveAlbumSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  content: albumContentSchema,
});
export const videoConfigSchema = z
  .object({
    seconds: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    pageIds: z.array(z.string().uuid()).min(1).max(20),
    opening: z.string().max(160),
    closing: z.string().max(250),
    musicId: z.enum(['none', 'gentle', 'custom', 'warm-piano', 'little-waltz', 'evening']),
    sceneDurations: z.record(z.string().uuid(), finite.min(1).max(60).multipleOf(0.1)).optional(),
    audioId: z.string().uuid().optional(),
    audioStart: finite.min(0).max(599.9).optional(),
    audioEnd: finite.min(0.1).max(600).optional(),
    audioVolume: finite.min(0).max(1).optional(),
    audioLoop: z.boolean().optional(),
  })
  .superRefine((config, ctx) => {
    if (new Set(config.pageIds).size !== config.pageIds.length)
      ctx.addIssue({ code: 'custom', path: ['pageIds'], message: 'Trang video bị trùng.' });
    if (config.sceneDurations) {
      const ids = Object.keys(config.sceneDurations);
      if (
        ids.length !== config.pageIds.length ||
        config.pageIds.some((id) => config.sceneDurations![id] === undefined)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['sceneDurations'],
          message: 'Mỗi trang đã chọn cần có thời lượng riêng.',
        });
      if (Object.values(config.sceneDurations).reduce((sum, n) => sum + n, 0) > 175)
        ctx.addIssue({
          code: 'custom',
          path: ['sceneDurations'],
          message: 'Video tối đa 180 giây, gồm 5 giây mở đầu và kết.',
        });
    }
    if (
      config.musicId === 'custom' &&
      (!config.audioId ||
        config.audioEnd === undefined ||
        config.audioEnd - (config.audioStart ?? 0) < 0.1 - 1e-6)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['audioEnd'],
        message: 'Chọn nhạc và đoạn cắt dài ít nhất 0,1 giây.',
      });
  });
export type VideoConfig = z.infer<typeof videoConfigSchema>;
export type AudioAsset = {
  waveform?: number[];
  id: string;
  albumId: string;
  name: string;
  duration: number;
  bytes: number;
  url: string;
};
export type ExportJob = {
  id: string;
  albumId: string;
  status: 'queued' | 'preparing' | 'rendering' | 'uploading' | 'completed' | 'failed' | 'canceled';
  progress: number;
  createdAt: string;
  error?: string;
  cancelRequested?: boolean;
  snapshot: Album;
  config: VideoConfig;
  referenceDate: string;
  assetData: Record<string, string>;
  attempts?: number;
  maxAttempts?: number;
  outputKey?: string;
  audioAsset?: AudioAsset;
};
export type JobView = Omit<ExportJob, 'snapshot' | 'assetData' | 'outputKey' | 'audioAsset'>;
export const fonts = { serif: 'Lora', sans: 'Be Vietnam Pro', hand: 'Patrick Hand' };
export const themeNames: Record<Theme, string> = {
  polaroid: 'Nhật ký Polaroid',
  letter: 'Thư gửi người thương',
  timeline: 'Những ngày bên nhau',
};
export const stickerOptions = ['♡', '✿', '✦', '☀', '❀', '♥'];
export const PAGE_WIDTH = 720;
export const PAGE_HEIGHT = 900;
export function todayIn(timezone = 'Asia/Ho_Chi_Minh', now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function daysTogether(start: string, reference: string): number {
  return Math.round(
    (Date.parse(`${reference}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000,
  );
}
export function nextAnnual(
  start: string,
  reference: string,
): { date: string; days: number; years: number } {
  const make = (year: number) => {
    const month = Number(start.slice(5, 7));
    const day = Math.min(Number(start.slice(8)), new Date(Date.UTC(year, month, 0)).getUTCDate());
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  let year = Number(reference.slice(0, 4));
  if (year < Number(start.slice(0, 4))) year = Number(start.slice(0, 4));
  if (make(year) < reference) year++;
  const date = make(year);
  return { date, days: daysTogether(reference, date), years: year - Number(start.slice(0, 4)) };
}
export function element(
  type: ScrapElement['type'],
  patch: Partial<ScrapElement> = {},
): ScrapElement {
  return {
    id: crypto.randomUUID(),
    type,
    x: 130,
    y: 180,
    width: 300,
    height: 110,
    rotation: 0,
    opacity: 1,
    locked: false,
    text: 'Một chút thương, gửi vào đây…',
    assetId: null,
    font: 'hand',
    fontSize: 34,
    color: '#453f36',
    align: 'center',
    crop: { x: 0, y: 0, width: 1, height: 1 },
    animation: 'rise',
    ...patch,
  };
}
export function createPage(theme: Theme, assets: string[] = []): Page {
  const image = (i: number, patch: Partial<ScrapElement>) =>
    element('image', {
      assetId: assets[i] ?? `demo-${(i % 3) + 1}`,
      width: 268,
      height: 315,
      text: i === 0 ? 'một ngày thật đẹp' : 'cùng nhau, ở đây',
      ...patch,
    });
  const title = element('text', {
    x: 75,
    y: 67,
    width: 570,
    height: 75,
    text:
      theme === 'letter'
        ? 'Gửi người mình thương,'
        : theme === 'timeline'
          ? 'Từng chút, từng chút một'
          : 'Những ngày có nhau',
    font: 'serif',
    fontSize: 38,
  });
  const footer = element('text', {
    x: 90,
    y: 770,
    width: 540,
    height: 70,
    text: 'Có những điều nhỏ xíu, mà mình muốn nhớ thật lâu.',
    fontSize: 29,
  });
  if (theme === 'letter')
    return {
      id: crypto.randomUUID(),
      title: 'Một lá thư',
      background: '#faf3e4',
      elements: [
        title,
        image(0, { x: 213, y: 185, rotation: 4 }),
        element('text', {
          x: 100,
          y: 545,
          width: 520,
          height: 205,
          text: 'Cảm ơn vì đã cùng mình đi qua những ngày bình thường.\n\nMong rằng sau này, mỗi trang trong cuốn sổ này đều có hai đứa mình.',
          fontSize: 30,
          align: 'left',
        }),
        footer,
        element('sticker', {
          x: 550,
          y: 475,
          width: 80,
          height: 80,
          text: '♡',
          fontSize: 76,
          color: '#ad5648',
        }),
      ],
    };
  return {
    id: crypto.randomUUID(),
    title: theme === 'timeline' ? 'Dấu mốc của mình' : 'Trang đầu của chúng mình',
    background: '#f8f1e5',
    elements: [
      title,
      image(0, { x: 77, y: 190, rotation: -7 }),
      image(1, { x: 378, y: 330, rotation: 6 }),
      element('text', {
        x: 75,
        y: 565,
        width: 260,
        height: 130,
        text: 'Chẳng cần đi đâu xa,\nchỉ cần đi cùng nhau.',
        fontSize: 31,
        rotation: -3,
      }),
      element('anniversary', {
        x: 365,
        y: 180,
        width: 275,
        height: 90,
        text: 'ngày bên nhau',
        font: 'sans',
        fontSize: 22,
        color: '#6b7452',
      }),
      footer,
      element('sticker', {
        x: 50,
        y: 440,
        width: 85,
        height: 85,
        text: '✿',
        fontSize: 76,
        color: '#bf7557',
      }),
      element('sticker', {
        x: 590,
        y: 695,
        width: 80,
        height: 80,
        text: '♡',
        fontSize: 72,
        color: '#a35a48',
      }),
    ],
  };
}
export function createAlbumContent(): AlbumContent {
  return {
    title: 'Ngày mình bên nhau',
    names: ['Minh', 'An'],
    startDate: '2024-10-20',
    timezone: 'Asia/Ho_Chi_Minh',
    theme: 'polaroid',
    pages: [createPage('polaroid')],
    memories: [],
  };
}
export function displayedText(
  e: ScrapElement,
  album: Pick<Album, 'startDate'>,
  reference: string,
): string {
  if (e.type !== 'anniversary') return e.text;
  const days = daysTogether(album.startDate, reference);
  if (e.dateMode === 'annual') {
    const next = nextAnnual(album.startDate, reference);
    return next.days === 0
      ? `Hôm nay tròn ${next.years} năm\nbên nhau ♡`
      : `Còn ${next.days} ngày\nđến kỉ niệm ${next.years} năm`;
  }
  if (e.dateMode === 'milestone') {
    const target = e.milestoneDays || 1000;
    const remaining = target - days;
    return remaining > 0
      ? `Còn ${remaining.toLocaleString('vi-VN')} ngày\nđến mốc ${target.toLocaleString('vi-VN')} ngày`
      : remaining === 0
        ? `${target.toLocaleString('vi-VN')} ngày\nbên nhau hôm nay ♡`
        : `Mốc ${target.toLocaleString('vi-VN')} ngày\nđã qua ${-remaining} ngày`;
  }
  return days >= 0
    ? `${days.toLocaleString('vi-VN')} ngày\nbên nhau`
    : `Còn ${Math.abs(days)} ngày\nđến ngày của mình`;
}
export function assetUrl(id: string | null, album: Album): string | undefined {
  if (!id) return undefined;
  if (/^demo-[123]$/.test(id)) return `/api/demo/${id.slice(-1)}.svg`;
  return album.assets.find((a) => a.id === id)?.url;
}
export function imageCrop(
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
  crop: ScrapElement['crop'],
) {
  const cw = width * crop.width,
    ch = height * crop.height,
    ratio = targetWidth / Math.max(1, targetHeight);
  let sw = cw,
    sh = ch;
  if (cw / ch > ratio) sw = ch * ratio;
  else sh = cw / ratio;
  return {
    x: width * crop.x + (cw - sw) / 2,
    y: height * crop.y + (ch - sh) / 2,
    width: sw,
    height: sh,
  };
}
