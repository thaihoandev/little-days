import { z } from 'zod';
import { dateString, element, type Asset, type Page } from './index.js';
import type { TimelineSpace } from './journal.js';

export function weekStartFor(date: string) {
  const day = new Date(date + 'T12:00:00Z'),
    offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}
export function shiftDate(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const weekSchema = dateString.refine(
  (date) => weekStartFor(date) === date,
  'Tuần bắt đầu từ thứ Hai.',
);
export const recapInputSchema = z
  .object({
    requestId: z.uuid(),
    spaceId: z.uuid(),
    weekStart: weekSchema,
    title: z.string().trim().min(1).max(80),
    message: z.string().trim().max(240),
    layout: z.enum(['grid', 'film', 'editorial']),
    background: z.enum(['#f8f1e5', '#e3eada', '#f3e3d9', '#24364e']),
    photos: z
      .array(
        z.object({
          entryId: z.uuid(),
          assetId: z.uuid(),
          expectedRevision: z.number().int().nonnegative(),
        }),
      )
      .min(1)
      .max(9),
  })
  .superRefine((input, ctx) => {
    if (new Set(input.photos.map((p) => p.entryId + ':' + p.assetId)).size !== input.photos.length)
      ctx.addIssue({ code: 'custom', message: 'Không chọn trùng ảnh.' });
    const revisions = new Map<string, number>();
    for (const photo of input.photos) {
      if (revisions.has(photo.entryId) && revisions.get(photo.entryId) !== photo.expectedRevision)
        ctx.addIssue({ code: 'custom', message: 'Revision dấu mốc không nhất quán.' });
      revisions.set(photo.entryId, photo.expectedRevision);
    }
  });
export type RecapInput = z.infer<typeof recapInputSchema>;
export type WeeklyPhoto = {
  entryId: string;
  revision: number;
  date: string;
  title: string;
  asset: Asset;
  authorId?: string;
  authorName: string;
  authorAvatarUrl?: string;
};
export type WeeklyView = {
  weekStart: string;
  weekEnd: string;
  space: TimelineSpace;
  days: { date: string; photos: number; cover?: Asset }[];
  items: WeeklyPhoto[];
  nextCursor: string | null;
};

/** Real editable elements, never a flattened screenshot; shared renderer also handles MP4. */
export function buildWeeklyPage(
  photos: { assetId: string; date: string }[],
  input: Pick<RecapInput, 'weekStart' | 'title' | 'message' | 'layout' | 'background'>,
): Page {
  const dark = input.background === '#24364e',
    ink = dark ? '#f4dfb6' : '#445640';
  const text = (
    value: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    font: 'sans' | 'serif' | 'hand' = 'sans',
  ) =>
    element('text', {
      text: value,
      x,
      y,
      width,
      height,
      fontSize,
      font,
      color: ink,
      align: 'left',
    });
  const n = photos.length,
    columns = n <= 2 ? n : n <= 4 ? 2 : 3,
    rows = Math.ceil(n / columns),
    gap = input.layout === 'film' ? 12 : 10;
  const top = 175,
    bottom = 650,
    left = 52,
    width = 616,
    cellW = (width - gap * (columns - 1)) / columns,
    cellH = (bottom - top - gap * (rows - 1)) / rows;
  const slots = photos.flatMap((photo, i) => {
    let x = left + (i % columns) * (cellW + gap),
      y = top + Math.floor(i / columns) * (cellH + gap),
      w = cellW,
      h = cellH;
    if (input.layout === 'editorial' && n === 3) {
      x = i === 0 ? 52 : 369;
      y = i === 0 ? top : top + (i - 1) * 242;
      w = i === 0 ? 305 : 299;
      h = i === 0 ? 475 : 233;
    }
    return [
      element('image', {
        assetId: photo.assetId,
        text: photo.date.split('-').reverse().join('/'),
        x,
        y,
        width: w,
        height: h - 34,
        photoStyle:
          input.layout === 'film' ? 'film' : input.layout === 'editorial' ? 'rounded' : 'minimal',
        animation: 'fade',
      }),
      text(
        ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][
          (new Date(photo.date + 'T12:00:00Z').getUTCDay() + 6) % 7
        ],
        x + 9,
        y + h - 31,
        w - 18,
        28,
        14,
      ),
    ];
  });
  return {
    id: crypto.randomUUID(),
    title: input.title,
    background: input.background,
    elements: [
      text('NHỮNG NGÀY NHỎ · CỦA CHÚNG MÌNH', 52, 42, 616, 36, 16),
      text(input.title, 52, 89, 616, 70, input.title.length > 45 ? 24 : 34, 'serif'),
      ...slots,
      text(
        input.weekStart.split('-').reverse().join('/') +
          ' — ' +
          shiftDate(input.weekStart, 6).split('-').reverse().join('/'),
        52,
        677,
        616,
        40,
        17,
      ),
      text(
        input.message || 'Một tuần bình thường, được giữ lại bằng những điều thương.',
        52,
        735,
        616,
        113,
        input.message.length > 100 ? 17 : 24,
        'hand',
      ),
    ],
  };
}
