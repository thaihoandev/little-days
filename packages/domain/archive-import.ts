import { z } from 'zod';
import { albumContentSchema } from './index.js';
import { journalContentSchema } from './journal.js';
const media = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(150),
  path: z.string().regex(/^media\/(albums|journal|audio)\/[a-f0-9-]+\/[a-f0-9-]+\.(webp|mp3)$/i),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const base = { archiveHash: z.string().regex(/^[a-f0-9]{64}$/), sourceId: z.uuid() };
export const archiveImportSchema = z
  .discriminatedUnion('kind', [
    z.object({
      ...base,
      kind: z.literal('album'),
      content: albumContentSchema,
      assets: z.array(media).max(100),
      audio: z.array(media).max(10),
    }),
    z.object({
      ...base,
      kind: z.literal('journal'),
      content: journalContentSchema,
      assets: z.array(media).max(6),
      audio: z.array(media).max(0),
    }),
  ])
  .superRefine((input, ctx) => {
    const items = [...input.assets, ...input.audio];
    if (
      new Set(items.map((m) => m.id)).size !== items.length ||
      new Set(items.map((m) => m.path)).size !== items.length
    )
      ctx.addIssue({ code: 'custom', message: 'Media trong bản ghi bị trùng.' });
    for (const item of input.assets)
      if (
        item.path !==
        `media/${input.kind === 'album' ? 'albums' : 'journal'}/${input.sourceId}/${item.id}.webp`
      )
        ctx.addIssue({ code: 'custom', message: 'Đường dẫn ảnh không khớp bản ghi.' });
    for (const item of input.audio)
      if (item.path !== `media/audio/${input.sourceId}/${item.id}.mp3`)
        ctx.addIssue({ code: 'custom', message: 'Đường dẫn nhạc không khớp bản ghi.' });
  });
export type ArchiveImportInput = z.infer<typeof archiveImportSchema>;
