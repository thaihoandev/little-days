import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { JournalComment, JournalReaction } from '../../../packages/domain/journal.js';
import { Repository } from './database.js';
import { JournalService } from './journal.js';

export class JournalSocial {
  constructor(
    private db: Repository,
    private journal: JournalService,
  ) {}
  private async rows<T>(kind: string, id: string) {
    return (
      await this.db.query('SELECT payload FROM records WHERE kind=? AND id LIKE ?', [
        kind,
        id + ':%',
      ])
    ).map((row) => JSON.parse(String(row.payload)) as T);
  }
  async state(actor: string, id: string) {
    return this.journal.withEntry(actor, id, false, async (_, owner) => {
      const comments = await Promise.all(
        (await this.rows<JournalComment>('journal-comment', id))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map(async (c) => ({
            ...c,
            ...(await this.journal.authorView(actor, c.actorId)),
            canDelete: c.actorId === actor || actor === owner,
          })),
      );
      const reactions = await this.rows<JournalReaction>('journal-reaction', id);
      return {
        comments,
        reactions: ['heart', 'smile', 'hug', 'celebrate'].map((emoji) => ({
          emoji,
          count: reactions.filter((r) => r.emoji === emoji).length,
          mine: reactions.some((r) => r.emoji === emoji && r.actorId === actor),
        })),
      };
    });
  }
  async comment(actor: string, id: string, body: unknown) {
    const { text, requestId } = z
      .object({ text: z.string().trim().min(1).max(1000), requestId: z.uuid() })
      .parse(body);
    return this.journal.withEntry(actor, id, false, async (_, timelineOwner) => {
      const key = id + ':' + requestId;
      const existing = await this.db.get<JournalComment>('journal-comment', key);
      if (existing) {
        if (existing.actorId !== actor) throw new ForbiddenException();
        return { ok: true };
      }
      if (
        (await this.rows('journal-comment', id)).length >= 100 ||
        (await this.db.list('journal-comment', actor)).length >= 2000
      )
        throw new BadRequestException('Đã đạt giới hạn bình luận.');
      const comment: JournalComment = {
        id: key,
        entryId: id,
        actorId: actor,
        timelineOwner,
        text,
        createdAt: new Date().toISOString(),
      };
      await this.db.insert('journal-comment', key, actor, comment);
      return { ok: true };
    });
  }
  async removeComment(actor: string, id: string, commentId: string) {
    return this.journal.withEntry(actor, id, false, async (_, owner) => {
      const comment = await this.db.get<JournalComment>('journal-comment', commentId);
      if (!comment || comment.entryId !== id) throw new NotFoundException();
      if (actor !== owner && actor !== comment.actorId) throw new ForbiddenException();
      await this.db.remove('journal-comment', commentId);
      return { ok: true };
    });
  }
  async react(actor: string, id: string, body: unknown) {
    const { emoji } = z
      .object({ emoji: z.enum(['heart', 'smile', 'hug', 'celebrate']).nullable() })
      .parse(body);
    return this.journal.withEntry(actor, id, false, async (_, timelineOwner) => {
      const key = id + ':' + actor;
      await this.db.remove('journal-reaction', key);
      if (emoji)
        await this.db.insert('journal-reaction', key, actor, {
          id: key,
          entryId: id,
          timelineOwner,
          actorId: actor,
          emoji,
        } satisfies JournalReaction);
      return { ok: true };
    });
  }
}
