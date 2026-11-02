import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  AlbumSummary,
  FeedEntry,
  LibraryPage,
  LibraryPhoto,
} from '../../../packages/domain/library.js';
import { Repository } from './database.js';
import { JournalService } from './journal.js';
import { dateString } from '../../../packages/domain/index.js';
import type { TimelineGrant } from '../../../packages/domain/journal.js';
import type { StoredProfile } from './profile-view.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(20),
  cursor: z.string().max(1200).optional(),
  q: z.string().trim().max(200).default(''),
  kind: z.enum(['all', 'memory', 'anniversary', 'plan', 'note']).default('all'),
  source: z.enum(['all', 'album', 'milestone']).default('all'),
  timeline: z.union([z.literal('all'), z.uuid()]).default('all'),
  today: dateString.default(() => new Date().toISOString().slice(0, 10)),
});
const decode = <T>(value: unknown): T =>
  typeof value === 'string' ? JSON.parse(value) : (value as T);
/** SQL projections and keyset pagination; never deserialize every album layout for a list. */
export class LibraryService {
  constructor(
    private db: Repository,
    private journal: JournalService,
  ) {}
  private get pg() {
    return this.db.driver === 'postgresql';
  }
  private text(expr: string, path: string) {
    return this.pg
      ? `((${expr})::jsonb #>> '{${path.replaceAll('.', ',')}}')`
      : `json_extract(${expr}, '$.${path}')`;
  }
  private json(expr: string, path: string) {
    return this.pg
      ? `((${expr})::jsonb #> '{${path.replaceAll('.', ',')}}')`
      : `json(json_extract(${expr}, '$.${path}'))`;
  }
  private object(fields: Record<string, string>) {
    return `${this.pg ? 'jsonb_build_object' : 'json_object'}(${Object.entries(fields)
      .map(([key, value]) => `'${key}',${value}`)
      .join(',')})`;
  }
  private each(expr: string, alias: string) {
    return this.pg
      ? `jsonb_array_elements(COALESCE((${expr})::jsonb,'[]'::jsonb)) AS ${alias}(value)`
      : `json_each(${expr}) AS ${alias}`;
  }
  private aggregate(expr: string) {
    return this.pg ? `COALESCE(jsonb_agg(${expr}),'[]'::jsonb)` : `json_group_array(json(${expr}))`;
  }
  private async scope(actor: string, timeline: string) {
    await this.journal.sharing.access(actor, actor);
    // Batch membership/account/profile checks instead of fetching each member in a loop.
    const rows = await this.db.query(
      `SELECT g.payload AS grant,p.payload AS profile FROM records ix
      JOIN records g ON g.kind='timeline-grant' AND g.id=ix.id
      JOIN records member ON member.kind='account' AND member.owner=ix.owner
      JOIN records own ON own.kind='account' AND own.owner=g.owner
      LEFT JOIN records p ON p.kind='profile' AND p.owner=g.owner
      LEFT JOIN account_deletions od ON od.owner=g.owner
      LEFT JOIN account_deletions md ON md.owner=ix.owner
      WHERE ix.kind='timeline-member-index' AND ix.owner=? AND ${this.text('g.payload', 'memberId')}=?
      AND ${this.text('g.payload', 'timelineOwner')}=g.owner AND ${this.text('g.payload', 'state')}='active'
      AND ${this.text('member.payload', 'deletingAt')} IS NULL AND ${this.text('own.payload', 'deletingAt')} IS NULL
      AND od.owner IS NULL AND md.owner IS NULL`,
      [actor, actor],
    );
    const grants = rows.map((row) => {
      const grant = decode<TimelineGrant>(row.grant),
        profile = row.profile ? decode<StoredProfile>(row.profile) : undefined;
      return {
        ...grant,
        ownerLabel: profile?.displayName || grant.ownerLabel,
        ownerAvatarUrl: profile?.avatar
          ? `/api/profiles/${grant.timelineOwner}/avatar?v=${profile.avatar.id}`
          : undefined,
      };
    });
    const owners = [actor, ...grants.map((g) => g.timelineOwner)];
    if (timeline !== 'all' && !owners.includes(timeline))
      throw new NotFoundException('Không tìm thấy dòng thời gian.');
    return { owners: timeline === 'all' ? owners : [timeline], grants };
  }
  async summaries(actor: string): Promise<AlbumSummary[]> {
    const p = 'payload';
    const fields = Object.fromEntries(
      ['id', 'title', 'theme', 'startDate', 'timezone', 'createdAt', 'updatedAt', 'revision'].map(
        (key) => [key, this.text(p, key)],
      ),
    );
    const array = (value: string) =>
      this.pg ? `jsonb_build_array(${value})` : `json_array(json(${value}))`;
    const projection = this.object({
      ...fields,
      schemaVersion: '1',
      names: this.json(p, 'names'),
      memories: this.json(p, 'memories'),
      assets: this.json(p, 'assets'),
      pages: array(this.json(p, this.pg ? 'pages.0' : 'pages[0]')),
      pageCount: this.pg
        ? `jsonb_array_length(${this.json(p, 'pages')})`
        : `json_array_length(${this.json(p, 'pages')})`,
    });
    const rows = await this.db.query(
      `WITH albums AS MATERIALIZED (SELECT id,${this.pg ? 'payload::jsonb' : 'jsonb(payload)'} AS payload FROM records WHERE kind='album' AND owner=?) SELECT ${projection} AS item FROM albums ORDER BY ${this.text(p, 'updatedAt')} DESC,id DESC`,
      [actor],
    );
    return rows.map((row) => {
      const value = decode<AlbumSummary>(row.item);
      return { ...value, revision: Number(value.revision) };
    });
  }
  async ownsAlbumAsset(actor: string, id: string, assetId: string) {
    return (
      (
        await this.db.query(
          `SELECT r.id FROM records r WHERE r.kind='album' AND r.id=? AND r.owner=?
      AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner=r.owner)
      AND EXISTS(SELECT 1 FROM ${this.each(this.json('r.payload', 'assets'), 'a')} WHERE ${this.text('a.value', 'id')}=?)`,
          [id, actor, assetId],
        )
      ).length > 0
    );
  }
  private sources(owners: string[], actor: string, photos: boolean) {
    const albumOwner = owners.includes(actor) ? actor : '';
    const p = 'r.payload',
      t = (key: string) => this.text(p, key),
      j = (key: string) => this.json(p, key);
    const allowed = `r.owner IN (${owners.map(() => '?').join(',')}) AND ${t('deletedAt')} IS NULL`;
    if (photos) {
      const item = (origin: 'album' | 'milestone') =>
        this.object({
          key: `'${origin}:' || r.id || ':' || ${this.text('a.value', 'id')}`,
          asset: this.pg ? 'a.value' : 'json(a.value)',
          context: t('title'),
          kind: `'${origin}'`,
          date: t(origin === 'album' ? 'updatedAt' : 'date'),
          ...(origin === 'album' ? { albumId: 'r.id' } : {}),
        });
      return {
        sql: `SELECT ${item('milestone')} AS item,r.owner FROM documents r,${this.each(j('assets'), 'a')} WHERE r.kind='journal' AND ${allowed}
        UNION ALL SELECT ${item('album')} AS item,r.owner FROM documents r,${this.each(j('assets'), 'a')} WHERE r.kind='album' AND r.owner=?`,
        values: [...owners, albumOwner],
      };
    }
    const common = {
      revision: j('revision'),
      createdAt: t('createdAt'),
      updatedAt: t('updatedAt'),
      albumId: 'r.id',
    };
    const startAssets = `(SELECT ${this.aggregate('a.value')} FROM ${this.each(j('assets'), 'a')} WHERE ${this.pg ? "a.value->>'id'" : "json_extract(a.value,'$.id')"} = ${this.text(p, this.pg ? 'assets.0.id' : 'assets[0].id')})`;
    const assets = `(SELECT ${this.aggregate('a.value')} FROM ${this.each(j('assets'), 'a')} WHERE ${this.text('a.value', 'id')} = ${this.text('m.value', 'assetId')})`;
    const nested = (expr: string) => (this.pg ? expr : `json(${expr})`);
    const start = this.object({
      ...common,
      id: "'start-' || r.id",
      title: `'Ngày bắt đầu · ' || COALESCE(${this.text(p, this.pg ? 'names.0' : 'names[0]')},'') || ' & ' || COALESCE(${this.text(p, this.pg ? 'names.1' : 'names[1]')},'')`,
      date: t('startDate'),
      note: "'Câu chuyện của hai đứa bắt đầu từ đây.'",
      kind: "'anniversary'",
      annual: this.pg ? "'true'::jsonb" : "json('true')",
      assets: nested(startAssets),
    });
    const memory = this.object({
      ...common,
      id: `r.id || ':' || ${this.text('m.value', 'id')}`,
      title: this.text('m.value', 'title'),
      date: this.text('m.value', 'date'),
      note: this.text('m.value', 'body'),
      kind: "'memory'",
      annual: this.pg ? "'false'::jsonb" : "json('false')",
      assets: nested(assets),
    });
    return {
      sql: `SELECT ${this.pg ? 'r.payload' : 'json(r.payload)'} AS item,r.owner FROM documents r WHERE r.kind='journal' AND ${allowed}
      UNION ALL SELECT ${start} AS item,r.owner FROM documents r WHERE r.kind='album' AND r.owner=?
      UNION ALL SELECT ${memory} AS item,r.owner FROM documents r,${this.each(j('memories'), 'm')} WHERE r.kind='album' AND r.owner=?`,
      values: [...owners, albumOwner, albumOwner],
    };
  }
  async page(
    actor: string,
    raw: unknown,
    photos = false,
    map = false,
  ): Promise<LibraryPage<FeedEntry | LibraryPhoto>> {
    const input = querySchema.parse(raw),
      { owners, grants } = await this.scope(actor, input.timeline);
    const source = this.sources(owners, actor, photos),
      date = this.text('item', 'date'),
      created = photos ? date : `COALESCE(${this.text('item', 'createdAt')},${date})`,
      key = this.text('item', photos ? 'key' : 'id');
    const clauses: string[] = [],
      values: (string | number)[] = [...owners, actor, ...source.values];
    if (input.q) {
      clauses.push(
        `${this.pg ? 'lower' : 'vi_lower'}(COALESCE(${this.text('item', photos ? 'context' : 'title')},'') || ' ' || COALESCE(${this.text('item', photos ? 'date' : 'note')},'')) LIKE ? ESCAPE '!'`,
      );
      values.push(
        '%' +
          input.q
            .toLocaleLowerCase('vi')
            .replaceAll('!', '!!')
            .replaceAll('%', '!%')
            .replaceAll('_', '!_') +
          '%',
      );
    }
    if (!photos && input.kind !== 'all') {
      clauses.push(`${this.text('item', 'kind')}=?`);
      values.push(input.kind);
    }
    if (photos && input.source !== 'all') {
      clauses.push(`${this.text('item', 'kind')}=?`);
      values.push(input.source);
    }
    if (map) clauses.push(`${this.text('item', 'location')} IS NOT NULL`);
    const omitted = photos ? ['pages', 'memories', 'note'] : ['pages'];
    const projection = this.pg
      ? `payload::jsonb ${omitted.map((key) => `- '${key}'`).join(' ')}`
      : `jsonb(json_remove(payload,${omitted.map((key) => `'$.${key}'`).join(',')}))`;
    const base = `WITH documents AS MATERIALIZED (SELECT kind,id,owner,${projection} AS payload FROM records WHERE (kind='journal' AND owner IN (${owners.map(() => '?').join(',')})) OR (kind='album' AND owner=?)),feed AS (${source.sql}) SELECT item,owner FROM feed${clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''}`;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([actor, owners, input.q, input.kind, input.source, photos, map]))
      .digest('hex')
      .slice(0, 24);
    let after = '',
      cursorValues: (string | number)[] = [];
    if (input.cursor) {
      try {
        const cursor = z
          .object({
            date: z.string().max(40),
            at: z.string().max(40),
            key: z.string().max(180),
            scope: z.literal(fingerprint),
          })
          .parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString()));
        after = ` WHERE (${date} < ? OR (${date} = ? AND (${created} < ? OR (${created} = ? AND ${key} < ?))))`;
        cursorValues = [cursor.date, cursor.date, cursor.at, cursor.at, cursor.key];
      } catch {
        throw new BadRequestException('Trang dữ liệu không hợp lệ. Hãy tải lại danh sách.');
      }
    }
    return this.db.transaction(async () => {
      const statsSql =
        photos || map
          ? ''
          : `,(SELECT SUM(CASE WHEN ${this.text('item', 'albumId')} IS NULL THEN 1 ELSE 0 END) FROM filtered) AS milestones,
        (SELECT SUM(CASE WHEN CAST(${this.text('item', 'annual')} AS TEXT) IN ('true','1') OR ${date} >= '${input.today}' THEN 1 ELSE 0 END) FROM filtered) AS upcoming,
        (SELECT COUNT(DISTINCT ${this.text('a.value', 'id')}) FROM filtered,${this.each(this.json('item', 'assets'), 'a')}) AS photos`;
      const rowObject = this.object({ item: this.pg ? 'item' : 'json(item)', owner: 'owner' });
      const aggregate = this.pg
        ? `COALESCE(jsonb_agg(${rowObject} ORDER BY sort_date DESC,sort_at DESC,sort_key DESC),'[]'::jsonb)`
        : `json_group_array(${rowObject} ORDER BY sort_date DESC,sort_at DESC,sort_key DESC)`;
      const result = await this.db.query(
        `WITH filtered AS MATERIALIZED (${base}),page AS (
          SELECT ${map ? this.mapProjection() : 'item'} AS item,owner,${date} AS sort_date,${created} AS sort_at,${key} AS sort_key FROM filtered${after} ORDER BY ${date} DESC,${created} DESC,${key} DESC LIMIT ?)
          SELECT (SELECT COUNT(*) FROM filtered) AS total,(SELECT ${aggregate} FROM page) AS rows${statsSql}`,
        [...values, ...cursorValues, map ? 501 : input.limit + 1],
      );
      const rows = decode<{ item: FeedEntry | LibraryPhoto; owner: string }[]>(result[0].rows);
      const pageSize = map ? 500 : input.limit;
      const more = rows.length > pageSize;
      const selected = more ? rows.slice(0, pageSize) : rows;
      const items = selected.map((row) => {
        const item = decode<FeedEntry | LibraryPhoto>(row.item);
        if (!photos && row.owner !== actor) {
          const grant = grants.find((g) => g.timelineOwner === row.owner)!;
          Object.assign(item, {
            timelineId: row.owner,
            timelineLabel: grant.ownerLabel,
            timelineAvatarUrl: grant.ownerAvatarUrl,
            calendarVisible: grant.showOnCalendar,
          });
        }
        return item;
      });
      const last = items.at(-1);
      return {
        items,
        total: Number(result[0].total),
        ...(!photos && !map
          ? {
              stats: {
                milestones: Number(result[0].milestones || 0),
                photos: Number(result[0].photos || 0),
                upcoming: Number(result[0].upcoming || 0),
              },
            }
          : {}),
        nextCursor:
          more && last
            ? Buffer.from(
                JSON.stringify({
                  date: last.date,
                  at: 'createdAt' in last ? last.createdAt : last.date,
                  key: 'key' in last ? last.key : last.id,
                  scope: fingerprint,
                }),
              ).toString('base64url')
            : null,
      };
    }, true);
  }
  private mapProjection() {
    const fields = Object.fromEntries(
      ['id', 'title', 'date', 'kind', 'createdAt', 'updatedAt'].map((key) => [
        key,
        this.text('item', key),
      ]),
    );
    const first = this.json('item', this.pg ? 'assets.0' : 'assets[0]');
    const assets = this.pg
      ? `CASE WHEN ${first} IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(${first}) END`
      : `json(CASE WHEN ${first} IS NULL THEN '[]' ELSE json_array(${first}) END)`;
    return this.object({
      ...fields,
      note: "''",
      annual: this.json('item', 'annual'),
      revision: this.json('item', 'revision'),
      location: this.json('item', 'location'),
      assets,
    });
  }
}
