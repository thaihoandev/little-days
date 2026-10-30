import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TimelineGrant, TimelineSharingState } from '../../../packages/domain/journal.js';
import { Repository } from './database.js';
import { AccountDeletion } from './account-deletion.js';
import { authHash, type Account } from './auth.js';

export class TimelineSharing {
  constructor(
    private db: Repository,
    private deletion: AccountDeletion,
  ) {}
  async lock(owner: string, actor = owner) {
    if (this.db.driver === 'postgresql') {
      for (const id of [...new Set([owner, actor])].sort())
        await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', ['owner-operation:' + id]);
      await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', ['timeline:' + owner]);
    }
  }
  private async account(owner: string) {
    const account = (await this.db.list<Account>('account', owner))[0];
    return account && !account.deletingAt && !(await this.deletion.blocked(owner))
      ? account
      : undefined;
  }
  private async verified(owner: string) {
    const account = await this.account(owner);
    if (!account?.emailVerifiedAt)
      throw new ForbiddenException('Đăng nhập và xác minh email trước khi chia sẻ dòng thời gian.');
    return account;
  }
  async access(actor: string, owner: string): Promise<TimelineGrant | undefined> {
    if ((await this.deletion.blocked(owner)) || (await this.deletion.blocked(actor)))
      throw new NotFoundException('Không tìm thấy dòng thời gian.');
    if (actor === owner) return;
    const grant = (await this.db.list<TimelineGrant>('timeline-grant', owner)).find(
      (g) => g.memberId === actor && g.state === 'active',
    );
    if (!grant || !(await this.account(actor)) || !(await this.account(owner)))
      throw new NotFoundException('Không tìm thấy dòng thời gian.');
    return grant;
  }
  async state(actor: string): Promise<TimelineSharingState> {
    if (await this.deletion.blocked(actor)) throw new NotFoundException();
    const grants = await this.db.list<TimelineGrant>('timeline-grant', actor);
    for (const index of await this.db.list<{ id: string }>('timeline-member-index', actor)) {
      const grant = await this.db.get<TimelineGrant>('timeline-grant', index.id);
      if (grant?.memberId === actor) grants.push(grant);
    }
    const visible: TimelineGrant[] = [];
    for (const grant of grants)
      if ((await this.account(grant.timelineOwner)) && (await this.account(grant.memberId)))
        visible.push(grant);
    return { ownId: actor, grants: visible };
  }
  async invite(actor: string, body: unknown) {
    const { email } = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((s) => s.trim().toLowerCase()),
      })
      .parse(body);
    const inviter = await this.verified(actor),
      recipient = await this.db.get<Account>('account', authHash(email));
    if (
      !recipient?.emailVerifiedAt ||
      recipient.deletingAt ||
      (await this.deletion.blocked(recipient.id))
    )
      throw new BadRequestException(
        'Chưa thể mời email này. Người nhận cần có tài khoản Little Days đã xác minh email.',
      );
    if (recipient.id === actor) throw new BadRequestException('Bạn đã là chủ dòng thời gian này.');
    const operations: string[] = [];
    try {
      for (const owner of [actor, recipient.id].sort())
        operations.push(await this.deletion.begin(owner));
      return await this.db.transaction(async () => {
        await this.lock(actor, recipient.id);
        await this.verified(actor);
        await this.verified(recipient.id);
        const grants = await this.db.list<TimelineGrant>('timeline-grant', actor),
          previous = grants.find((g) => g.memberId === recipient.id);
        if (previous) return previous;
        if (grants.length >= 10)
          throw new BadRequestException('Tối đa 10 lời mời và thành viên cho mỗi dòng thời gian.');
        if ((await this.db.list('timeline-member-index', recipient.id)).length >= 100)
          throw new BadRequestException(
            'Người nhận đã có quá nhiều dòng thời gian và lời mời. Hãy thử lại sau.',
          );
        const grant: TimelineGrant = {
          id: randomUUID(),
          timelineOwner: actor,
          memberId: recipient.id,
          ownerLabel: inviter.email,
          memberLabel: recipient.email,
          state: 'pending',
          showOnCalendar: true,
          revision: 0,
          createdAt: new Date().toISOString(),
        };
        await this.db.insert('timeline-grant', grant.id, actor, grant);
        await this.db.insert('timeline-member-index', grant.id, recipient.id, { id: grant.id });
        return grant;
      });
    } finally {
      for (const operation of operations.reverse()) await this.deletion.end(operation);
    }
  }
  async change(actor: string, id: string, body: unknown, remove = false) {
    const input = z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        action: z.enum(['accept', 'calendar']).optional(),
        showOnCalendar: z.boolean().optional(),
      })
      .parse(body);
    const original = await this.db.get<TimelineGrant>('timeline-grant', id);
    if (!original || (original.timelineOwner !== actor && original.memberId !== actor))
      throw new NotFoundException();
    const operations: string[] = [];
    try {
      for (const owner of [original.timelineOwner, original.memberId].sort())
        operations.push(await this.deletion.begin(owner));
      return await this.db.transaction(async () => {
        await this.lock(original.timelineOwner, original.memberId);
        const current = await this.db.get<TimelineGrant>('timeline-grant', id);
        if (!current) throw new NotFoundException();
        if (current.revision !== input.expectedRevision)
          throw new ConflictException('Lời mời vừa thay đổi. Hãy tải lại.');
        if (remove) {
          await this.db.remove('timeline-member-index', id);
          await this.db.remove('timeline-grant', id);
          return { ok: true };
        }
        if (current.memberId !== actor)
          throw new ForbiddenException(
            'Chỉ người nhận được chấp nhận lời mời hoặc đổi lịch cá nhân.',
          );
        await this.verified(actor);
        await this.verified(current.timelineOwner);
        if (
          !input.action ||
          (input.action === 'calendar' &&
            (current.state !== 'active' || input.showOnCalendar === undefined))
        )
          throw new BadRequestException('Thao tác không hợp lệ.');
        const next: TimelineGrant = {
          ...current,
          state: 'active',
          showOnCalendar:
            input.action === 'calendar' ? input.showOnCalendar! : current.showOnCalendar,
          revision: current.revision + 1,
        };
        if (
          !(await this.db.compareAndSwap(
            'timeline-grant',
            id,
            current.timelineOwner,
            input.expectedRevision,
            next,
          ))
        )
          throw new ConflictException('Lời mời vừa thay đổi. Hãy tải lại.');
        return next;
      });
    } finally {
      for (const operation of operations.reverse()) await this.deletion.end(operation);
    }
  }
}
