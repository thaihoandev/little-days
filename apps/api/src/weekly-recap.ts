import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { todayIn, dateString, type Asset } from '../../../packages/domain/index.js';
import {
  recapInputSchema,
  weekSchema,
  weekStartFor,
  shiftDate,
  type WeeklyView,
} from '../../../packages/domain/weekly-recap.js';
import type { JournalEntry } from '../../../packages/domain/journal.js';
import { sharedJournalSql } from './journal-privacy.js';
import type { Repository } from './database.js';
import type { JournalService } from './journal.js';
import type { JournalAlbumService } from './journal-album.js';

export class WeeklyRecaps {
  constructor(
    private db: Repository,
    private journal: JournalService,
    private albums: JournalAlbumService,
  ) {}
  async list(actor: string, body: unknown): Promise<WeeklyView> {
    const query = z
      .object({
        spaceId: z.uuid(),
        weekStart: weekSchema.optional(),
        cursor: z.string().max(1200).optional(),
      })
      .parse(body);
    const space = await this.journal.sharing.space(actor, query.spaceId);
    if (!space.shared) throw new BadRequestException('Chọn không gian chung để nhìn lại tuần.');
    const today = todayIn('Asia/Ho_Chi_Minh'),
      start = query.weekStart || weekStartFor(today),
      end = shiftDate(start, 6),
      maxDate = end < today ? end : today;
    const sharing = await this.journal.sharing.state(actor);
    const scope = createHash('sha256')
      .update(
        JSON.stringify([
          actor,
          space.id,
          start,
          space.members.map((m) => m.id).sort(),
          sharing.grants
            .filter((g) => g.state === 'active')
            .map((g) => g.id)
            .sort(),
        ]),
      )
      .digest('hex');
    let after: { date: string; id: string } | undefined;
    if (query.cursor) {
      try {
        const c = z
          .object({ scope: z.string(), date: dateString, id: z.uuid() })
          .parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
        if (c.scope !== scope) throw Error('scope');
        after = c;
      } catch {
        throw new BadRequestException('Danh sách tuần đã đổi. Tải lại để tiếp tục.');
      }
    }
    const pg = this.db.driver === 'postgresql',
      field = (name: string) =>
        pg ? `r.payload::jsonb->>'${name}'` : `json_extract(r.payload,'$.${name}')`;
    const assets = pg
      ? "COALESCE(r.payload::jsonb->'assets','[]'::jsonb)"
      : "COALESCE(json_extract(r.payload,'$.assets'),'[]')";
    const count = pg ? `jsonb_array_length(${assets})` : `json_array_length(${assets})`;
    const cover = pg ? `${assets}->0` : `json_extract(${assets},'$[0]')`;
    const completed = pg
      ? "r.payload::jsonb->'plan'->>'status'"
      : "json_extract(r.payload,'$.plan.status')";
    const where = `r.kind='journal' AND r.owner=? AND ${sharedJournalSql(this.db.driver)} AND ${field('deletedAt')} IS NULL AND ${field('date')}>=? AND ${field('date')}<=? AND (${field('kind')}!='plan' OR ${completed}='completed')`;
    const params = [space.id, start, maxDate];
    const days = await this.db.query(
      `SELECT day,total,cover FROM (SELECT ${field('date')} AS day,SUM(${count}) OVER(PARTITION BY ${field('date')}) AS total,${cover} AS cover,ROW_NUMBER() OVER(PARTITION BY ${field('date')} ORDER BY ${count} DESC,r.id) AS rn FROM records r WHERE ${where}) summary WHERE rn=1`,
      params,
    );
    const rows = await this.db.query(
      `SELECT r.payload FROM records r WHERE ${where} AND ${count}>0 ${after ? `AND (${field('date')}<? OR (${field('date')}=? AND r.id<?))` : ''} ORDER BY ${field('date')} DESC,r.id DESC LIMIT 25`,
      [...params, ...(after ? [after.date, after.date, after.id] : [])],
    );
    const entries = await this.journal.decorate(
      actor,
      space.id,
      rows.slice(0, 24).map((r) => JSON.parse(String(r.payload)) as JournalEntry),
    );
    const last = entries.at(-1);
    return {
      weekStart: start,
      weekEnd: end,
      space,
      days: Array.from({ length: 7 }, (_, i) => {
        const date = shiftDate(start, i),
          day = days.find((d) => d.day === date),
          asset = day?.cover;
        return {
          date,
          photos: Number(day?.total) || 0,
          ...(asset
            ? { cover: (typeof asset === 'string' ? JSON.parse(asset) : asset) as Asset }
            : {}),
        };
      }),
      items: entries.flatMap((e) =>
        e.assets.map((asset) => ({
          entryId: e.id,
          revision: e.revision,
          date: e.date,
          title: e.title,
          asset,
          authorId: e.createdBy,
          authorName: e.authorName || 'Thành viên',
          authorAvatarUrl: e.authorAvatarUrl,
        })),
      ),
      nextCursor:
        rows.length > 24 && last
          ? Buffer.from(JSON.stringify({ scope, date: last.date, id: last.id })).toString(
              'base64url',
            )
          : null,
    };
  }
  async create(actor: string, body: unknown) {
    const input = recapInputSchema.parse(body),
      space = await this.journal.sharing.space(actor, input.spaceId);
    if (!space.shared) throw new BadRequestException('Chọn không gian chung.');
    if (input.weekStart > weekStartFor(todayIn('Asia/Ho_Chi_Minh')))
      throw new BadRequestException('Chưa thể tạo recap cho tuần tương lai.');
    const unique = [
      ...new Map(
        input.photos.map((p) => [
          p.entryId,
          { kind: 'journal' as const, id: p.entryId, expectedRevision: p.expectedRevision },
        ]),
      ).values(),
    ];
    if (space.members.length < 2)
      throw new ConflictException('Không gian không còn đủ thành viên.');
    return this.albums.create(
      actor,
      {
        requestId: input.requestId,
        title: input.title,
        names: [
          space.members[0].displayName.slice(0, 60) || 'Mình',
          space.members[1].displayName.slice(0, 60) || 'Người thương',
        ],
        timezone: 'Asia/Ho_Chi_Minh',
        templateId: 'collage',
        sources: unique,
      },
      input,
    );
  }
}
