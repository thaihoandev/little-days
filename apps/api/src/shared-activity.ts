import { NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Repository } from './database.js';
import type { JournalService } from './journal.js';
import type { AccountDeletion } from './account-deletion.js';
import type { NotificationView } from '../../../packages/domain/reminders.js';
import type { TimelineGrant } from '../../../packages/domain/journal.js';
import { todayIn } from '../../../packages/domain/index.js';
import { sharedJournalSql } from './journal-privacy.js';
import { membershipEpoch } from './couple-rituals.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
/** Bounded metadata queries, current membership on every request, no sealed content in the inbox. */
export class SharedActivity {
  constructor(
    private db: Repository,
    private journal: JournalService,
    private deletion: AccountDeletion,
  ) {}
  async inbox(actor: string): Promise<NotificationView[]> {
    const sharing = await this.journal.sharing.state(actor);
    const now = await this.db.now(),
      since = new Date(now - 30 * 86400000).toISOString();
    const notices: NotificationView[] = [];
    const add = (
      key: string,
      title: string,
      at: string,
      kind: NonNullable<NotificationView['kind']>,
      target: string,
    ) => {
      if (at < since || !Number.isFinite(Date.parse(at)) || Date.parse(at) > now) return;
      notices.push({
        id: 'act-' + hash(key),
        title,
        createdAt: at,
        kind,
        target,
        occurrenceDate: todayIn('Asia/Ho_Chi_Minh', new Date(at)),
        offset: 0,
        emailDelivery: 'none',
      });
    };
    for (const g of sharing.grants) {
      if (g.memberId === actor && g.state === 'pending')
        add(
          'invite:' + g.id,
          g.ownerLabel + ' mời bạn vào không gian chung',
          g.createdAt,
          'invite',
          '/timeline?sharing=1',
        );
      if (g.timelineOwner === actor && g.state === 'active' && g.acceptedAt)
        add(
          'accepted:' + g.id,
          g.memberLabel + ' đã nhận lời mời không gian chung',
          g.acceptedAt,
          'accepted',
          '/timeline?sharing=1',
        );
    }
    const spaces = (sharing.spaces || []).filter((s) => s.shared && s.members.length > 1);
    if (spaces.length) {
      const owners = spaces.map((s) => s.id),
        marks = owners.map(() => '?').join(',');
      const grants = (
        await this.db.query(
          `SELECT payload FROM records WHERE kind='timeline-grant' AND owner IN (${marks})`,
          owners,
        )
      ).map((r) => JSON.parse(String(r.payload)) as TimelineGrant);
      const scopes = new Map(
        spaces.map((s) => {
          const active = grants.filter(
            (g) =>
              g.timelineOwner === s.id &&
              g.state === 'active' &&
              s.members.some((m) => m.id === g.memberId),
          );
          return [
            s.id,
            {
              members: s.members,
              epoch: membershipEpoch(
                s.members.map((m) => m.id),
                active.map((g) => g.id),
              ),
              since:
                active
                  .map((g) => g.acceptedAt || g.createdAt)
                  .sort()
                  .at(-1) || since,
            },
          ];
        }),
      );
      const field = (name: string, alias = 'r') =>
        this.db.driver === 'postgresql'
          ? `${alias}.payload::jsonb->>'${name}'`
          : `json_extract(${alias}.payload,'$.${name}')`;
      const rows = await this.db.query(
        `SELECT r.id,r.owner,${field('createdBy')} AS author,${field('createdAt')} AS at,${field('date')} AS day FROM records r WHERE r.kind='journal' AND r.owner IN (${marks}) AND ${sharedJournalSql(this.db.driver)} AND ${field('deletedAt')} IS NULL AND ${field('createdAt')}>=? AND ${field('createdBy')}!=? ORDER BY ${field('createdAt')} DESC,r.id DESC LIMIT 200`,
        [...owners, since, actor],
      );
      for (const r of rows) {
        const scope = scopes.get(String(r.owner)),
          member = scope?.members.find((m) => m.id === r.author);
        if (member && String(r.at) >= scope!.since)
          add(
            `memory:${scope!.epoch}:${r.id}`,
            member.displayName + ' đã thêm một dấu mốc',
            String(r.at),
            'memory',
            '/timeline?space=' + r.owner + '&entry=' + r.id,
          );
      }
      const assets =
        this.db.driver === 'postgresql'
          ? "jsonb_array_length(COALESCE(e.payload::jsonb->'assets','[]'::jsonb))"
          : "json_array_length(COALESCE(json_extract(e.payload,'$.assets'),'[]'))";
      const photos = await this.db.query(
        `SELECT r.owner,${field('actorId')} AS author,${field('createdAt')} AS at,e.id AS entry_id,${field('date', 'e')} AS day FROM records r JOIN records e ON e.kind='journal' AND e.id=${field('entryId')} AND e.owner=r.owner WHERE r.kind='journal-version' AND r.owner IN (${marks}) AND ${field('action')}='photo' AND ${field('createdAt')}>=? AND ${field('actorId')}!=? AND ${sharedJournalSql(this.db.driver, 'e')} AND ${field('deletedAt', 'e')} IS NULL AND ${assets}>0 ORDER BY ${field('createdAt')} DESC,r.id DESC LIMIT 200`,
        [...owners, since, actor],
      );
      const seen = new Set<string>();
      for (const r of photos) {
        const scope = scopes.get(String(r.owner)),
          member = scope?.members.find((m) => m.id === r.author);
        if (!member || String(r.at) < scope!.since) continue;
        const key = `photo:${scope!.epoch}:${r.entry_id}:${r.author}:${todayIn('Asia/Ho_Chi_Minh', new Date(String(r.at)))}`;
        if (seen.has(key)) continue;
        seen.add(key);
        add(
          key,
          member.displayName + ' đã thêm ảnh vào một dấu mốc',
          String(r.at),
          'photo',
          '/timeline?space=' + r.owner + '&entry=' + r.entry_id,
        );
      }
      const conditions = spaces
        .map(() => `(${field('spaceId')}=? AND ${field('epoch')}=?)`)
        .join(' OR ');
      const notes = await this.db.query(
        `SELECT r.id,${field('spaceId')} AS space,${field('authorId')} AS author,${field('createdAt')} AS at FROM records r WHERE r.kind='love-note' AND (${conditions}) AND ${field('authorId')}!=? AND ${field('createdAt')}>=? ORDER BY ${field('createdAt')} DESC,r.id DESC LIMIT 200`,
        [...spaces.flatMap((s) => [s.id, scopes.get(s.id)!.epoch]), actor, since],
      );
      for (const r of notes) {
        const member = scopes.get(String(r.space))?.members.find((m) => m.id === r.author);
        if (member)
          add(
            'jar:' + r.id,
            member.displayName + ' đã gửi một điều thương vào lọ',
            String(r.at),
            'love-note',
            '/together?space=' + r.space + '&tab=jar',
          );
      }
    }
    const read = new Map(
      (await this.db.list<{ id: string; readAt: string }>('activity-read', actor)).map((r) => [
        r.id,
        r.readAt,
      ]),
    );
    return notices
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, 200)
      .map((n) => ({ ...n, ...(read.has(n.id) ? { readAt: read.get(n.id) } : {}) }));
  }
  async markRead(actor: string, id: string) {
    const operation = await this.deletion.begin(actor);
    try {
      return await this.db.transaction(async () => {
        await this.journal.sharing.lock(actor);
        const visible = await this.inbox(actor),
          selected = id === 'all' ? visible : visible.filter((n) => n.id === id);
        if (id !== 'all' && !selected.length) throw new NotFoundException();
        const keep = new Set(visible.map((n) => n.id));
        for (const old of await this.db.list<{ id: string }>('activity-read', actor))
          if (!keep.has(old.id)) await this.db.remove('activity-read', old.id + ':' + actor);
        const readAt = new Date(await this.db.now()).toISOString();
        for (const n of selected)
          if (!n.readAt)
            await this.db.insert('activity-read', n.id + ':' + actor, actor, { id: n.id, readAt });
        return { ok: true };
      });
    } finally {
      await this.deletion.end(operation);
    }
  }
}
