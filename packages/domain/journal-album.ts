import { z } from 'zod';
import { albumContentSchema, element, type Asset, type Page, type ScrapElement } from './index.js';
import { builtInTemplates, templatePage } from './templates.js';
import { decoration } from './decorations.js';

export const journalSourceSchema = z
  .object({
    kind: z.enum(['journal', 'album-start', 'album-memory']),
    id: z.string().uuid(),
    memoryId: z.string().uuid().optional(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .refine(
    (s) => (s.kind === 'album-memory' ? !!s.memoryId : !s.memoryId),
    'Nguồn dấu mốc không hợp lệ',
  );
export type JournalSource = z.infer<typeof journalSourceSchema>;
export const sourceKey = (source: JournalSource) =>
  source.kind + ':' + source.id + ':' + (source.memoryId || '');
export const journalAlbumSchema = z.object({
  requestId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  names: albumContentSchema.shape.names,
  timezone: albumContentSchema.shape.timezone,
  templateId: z.enum(builtInTemplates.map((t) => t.id) as [string, ...string[]]),
  sources: z
    .array(journalSourceSchema)
    .min(1)
    .max(20)
    .refine(
      (items) => new Set(items.map(sourceKey)).size === items.length,
      'Không chọn trùng dấu mốc',
    ),
});
export type JournalAlbumInput = z.infer<typeof journalAlbumSchema>;
export type JournalAlbumEntry = {
  id: string;
  title: string;
  date: string;
  note: string;
  assets: Asset[];
};

// Conservative line wrapping keeps every character, including long unbroken words.
function linesOf(text: string, ems: number, maxLines: number) {
  const lines: string[] = [];
  let line = '',
    width = 0;
  for (const ch of text.replace(/\r\n?/g, '\n')) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      width = 0;
      continue;
    }
    const weight = /\p{Mark}/u.test(ch)
      ? 0
      : /\s/u.test(ch)
        ? 0.32
        : /[MW@#%]/.test(ch)
          ? 1
          : /[ilI.,!':;]/.test(ch)
            ? 0.3
            : ch.codePointAt(0)! > 0x2fff
              ? 1.2
              : 0.62;
    if (line && (width + weight > ems || line.length + ch.length > 110)) {
      lines.push(line);
      line = '';
      width = 0;
    }
    line += ch;
    width += weight;
  }
  if (line || !lines.length) lines.push(line);
  return Array.from({ length: Math.ceil(lines.length / maxLines) }, (_, i) =>
    lines.slice(i * maxLines, (i + 1) * maxLines).join('\n'),
  );
}
function fitTitle(text: string, width: number, height: number, preferred: number) {
  const clean = text.replace(/\s+/g, ' ').trim();
  for (let fontSize = Math.floor(preferred); fontSize >= 10; fontSize--) {
    const wrapped = linesOf(clean, Math.max(4, width / fontSize - 1), 1000)[0];
    if (wrapped.split('\n').length * fontSize * 1.3 <= height) return { text: wrapped, fontSize };
  }
  return { text: clean, fontSize: 10 };
}
function notePage(
  entry: JournalAlbumEntry,
  note: string,
  background: string,
  number: number,
): Page {
  const art = decoration('paper-cream')!,
    tape = decoration('tape-sage')!;
  return {
    id: crypto.randomUUID(),
    title: (entry.title + ' · lời nhắn ' + number).slice(0, 120),
    background,
    elements: [
      element('sticker', {
        decorationId: art.id,
        text: art.name,
        x: 60,
        y: 125,
        width: 600,
        height: 725,
        locked: true,
      }),
      element('sticker', {
        decorationId: tape.id,
        text: tape.name,
        x: 240,
        y: 110,
        width: 220,
        height: (220 * tape.height) / tape.width,
      }),
      element('text', {
        ...fitTitle(entry.title, 560, 75, 22),
        font: 'serif',
        x: 80,
        y: 45,
        width: 560,
        height: 75,
      }),
      element('text', {
        text: entry.date.split('-').reverse().join('/'),
        font: 'sans',
        fontSize: 15,
        x: 100,
        y: 143,
        width: 500,
        height: 25,
      }),
      element('text', {
        text: note,
        font: 'sans',
        fontSize: 22,
        align: 'left',
        x: 105,
        y: 190,
        width: 510,
        height: 560,
      }),
    ],
  };
}
export function buildJournalPages(entries: JournalAlbumEntry[], templateId: string): Page[] {
  const pages: Page[] = [];
  for (const entry of [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )) {
    const base = templatePage(
      templateId,
      entry.assets.map((a) => a.id),
    );
    const images = base.elements.filter((e) => e.type === 'image');
    const title = base.elements.find((e) => e.type === 'text')!;
    const slots = base.elements
      .filter((e) => e.type === 'text' && e.id !== title.id)
      .sort((a, b) => b.width * b.height - a.width * a.height);
    const noteSlot = slots[0];
    const noteFont = 18;
    const noteLines = noteSlot ? Math.max(1, Math.floor(noteSlot.height / (noteFont * 1.3))) : 0;
    const chunks = entry.note
      ? linesOf(
          entry.note,
          noteSlot ? Math.max(8, noteSlot.width / noteFont - 1) : 22,
          noteLines || 18,
        )
      : [];
    const firstNote = noteSlot ? chunks.shift() || '' : '';
    const photoCount = Math.max(1, images.length);
    const photoPages = Math.max(1, Math.ceil(entry.assets.length / photoCount));
    for (let batch = 0; batch < photoPages; batch++) {
      const page =
        batch === 0
          ? base
          : templatePage(
              templateId,
              entry.assets.map((a) => a.id),
            );
      let photo = 0;
      const pageTitle = page.elements.find((e) => e.type === 'text')!;
      const heading = fitTitle(entry.title, pageTitle.width, pageTitle.height, pageTitle.fontSize);
      const notes: ScrapElement[] = [];
      // Longer notes get dedicated continuation pages instead of overflowing a photo caption.
      if (batch === 0 && firstNote && noteSlot)
        notes.push({
          ...noteSlot,
          text: firstNote,
          font: 'sans',
          fontSize: noteFont,
          align: 'left',
        });
      const used = entry.assets.slice(batch * photoCount, (batch + 1) * photoCount);
      const design = page.elements
        .filter((e) => e.type === 'sticker' || e.type === 'image')
        .map((e) => {
          if (e.type !== 'image') return e;
          const selected = used[photo++];
          return { ...e, assetId: selected?.id || null, visible: !!selected, text: '' };
        });
      pages.push({
        ...page,
        title: (entry.title + (batch ? ' · ảnh ' + (batch + 1) : '')).slice(0, 120),
        elements: [
          ...design,
          { ...pageTitle, ...heading },
          element('text', {
            text: entry.date.split('-').reverse().join('/'),
            font: 'sans',
            fontSize: 15,
            color: '#8b806c',
            x: pageTitle.x,
            y: pageTitle.y + pageTitle.height,
            width: pageTitle.width,
            height: 26,
          }),
          ...notes,
        ],
      });
    }
    // Rewrap the remainder as readable full-page notes, without truncating text.
    if (chunks.length) {
      const remainder = chunks.join('\n');
      linesOf(remainder, 22, 18).forEach((chunk, i) =>
        pages.push(notePage(entry, chunk, base.background, i + 1)),
      );
    }
    if (pages.length > 20)
      throw new Error('Nội dung cần hơn 20 trang. Hãy chọn ít dấu mốc hơn hoặc rút gọn ghi chú.');
  }
  return pages;
}
