import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type {
  TimelineGrant,
  TimelineSharingState,
  TimelineSpace,
} from '../../../packages/domain/journal.js';
import { Repository } from './database.js';
import { AccountDeletion } from './account-deletion.js';
import { authHash, type Account } from './auth.js';
import { profileView } from './profile-view.js';
import { privateSpaceId, hasSharedHistory, freezeLegacyPrivate } from './journal-privacy.js';

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
  async createPair(actor: string) {
    await this.verified(actor);
    const operation = await this.deletion.begin(actor);
    try {
      return await this.db.transaction(async () => {
        await this.lock(actor);
        await this.verified(actor);
        for (const row of await this.db.query(
          "SELECT id FROM records WHERE kind='timeline-pair' AND owner=?",
          [actor],
        ))
          await this.db.remove('timeline-pair', String(row.id));
        const token = randomBytes(32).toString('hex'),
          expiresAt = (await this.db.now()) + 15 * 60000;
        await this.db.insert('timeline-pair', authHash(token), actor, {
          owner: actor,
          expiresAt,
          revision: 0,
        });
        return { token, expiresAt: new Date(expiresAt).toISOString() };
      });
    } finally {
      await this.deletion.end(operation);
    }
  }
  async revokePair(actor: string) {
    const operation = await this.deletion.begin(actor);
    try {
      return await this.db.transaction(async () => {
        await this.lock(actor);
        await this.db.query(
          "DELETE FROM records WHERE kind='timeline-pair' AND owner=? RETURNING id",
          [actor],
        );
        return { ok: true };
      });
    } finally {
      await this.deletion.end(operation);
    }
  }
  async pairing(actor: string, body: unknown, accept = false) {
    const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(body),
      key = authHash(token);
    type Pair = {
      owner: string;
      expiresAt: number;
      revision: number;
      acceptedBy?: string;
      grantId?: string;
    };
    const initial = await this.db.get<Pair>('timeline-pair', key);
    if (!initial || initial.expiresAt <= (await this.db.now()))
      throw new NotFoundException('Mã kết đôi đã hết hạn hoặc đã được thu hồi.');
    await this.verified(initial.owner);
    if (!accept) {
      if (initial.acceptedBy) throw new NotFoundException('Mã kết đôi đã được sử dụng.');
      return {
        displayName: (await profileView(this.db, initial.owner, 'Người thương')).displayName,
        expiresAt: new Date(initial.expiresAt).toISOString(),
        own: actor === initial.owner,
      };
    }
    const member = await this.verified(actor);
    if (actor === initial.owner)
      throw new BadRequestException('Hãy gửi mã này cho người thương của bạn.');
    const operations: string[] = [];
    try {
      for (const id of [actor, initial.owner].sort())
        operations.push(await this.deletion.begin(id));
      return await this.db.transaction(async () => {
        await this.lock(initial.owner, actor);
        const pair = await this.db.get<Pair>('timeline-pair', key);
        if (
          !pair ||
          pair.expiresAt <= (await this.db.now()) ||
          (pair.acceptedBy && pair.acceptedBy !== actor)
        )
          throw new NotFoundException('Mã kết đôi đã hết hạn hoặc đã được sử dụng.');
        if (pair.acceptedBy === actor) {
          const grant = await this.db.get<TimelineGrant>('timeline-grant', pair.grantId!);
          if (!grant || grant.memberId !== actor || grant.state !== 'active')
            throw new NotFoundException('Lời mời này không còn hiệu lực.');
          return { spaceId: grant.timelineOwner };
        }
        const grant = await this.invite(pair.owner, { email: member.email });
        if (grant.state !== 'active')
          await this.change(actor, grant.id, {
            expectedRevision: grant.revision,
            action: 'accept',
          });
        if (
          !(await this.db.compareAndSwap('timeline-pair', key, pair.owner, pair.revision, {
            ...pair,
            revision: pair.revision + 1,
            acceptedBy: actor,
            grantId: grant.id,
          }))
        )
          throw new ConflictException('Mã kết đôi vừa thay đổi.');
        return { spaceId: pair.owner };
      });
    } finally {
      for (const op of operations.reverse()) await this.deletion.end(op);
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
      if ((await this.account(grant.timelineOwner)) && (await this.account(grant.memberId))) {
        const owner = await profileView(this.db, grant.timelineOwner, grant.ownerLabel),
          member = await profileView(this.db, grant.memberId, grant.memberLabel);
        visible.push({
          ...grant,
          ownerLabel: owner.displayName,
          memberLabel: member.displayName,
          ...(grant.state === 'active'
            ? { ownerAvatarUrl: owner.avatarUrl, memberAvatarUrl: member.avatarUrl }
            : {}),
        });
      }
    const ids = [
      ...new Set([
        actor,
        ...visible
          .filter((g) => g.memberId === actor && g.state === 'active')
          .map((g) => g.timelineOwner),
      ]),
    ];
    ids.sort();
    const spaces = await Promise.all(
      ids.filter((id) => id !== actor).map((id) => this.space(actor, id)),
    );
    if (await hasSharedHistory(this.db, actor)) spaces.push(await this.space(actor, actor));
    spaces.sort((a, b) => a.id.localeCompare(b.id));
    spaces.unshift(await this.space(actor, privateSpaceId(actor)));
    return {
      ownId: actor,
      grants: visible,
      spaces,
    };
  }
  async space(actor: string, id: string): Promise<TimelineSpace> {
    if (id === privateSpaceId(actor)) {
      await this.access(actor, actor);
      return {
        id,
        title: 'Không gian riêng',
        shared: false,
        members: [{ id: actor, ...(await profileView(this.db, actor, 'Bạn')) }],
      };
    }
    await this.access(actor, id);
    const active = (await this.db.list<TimelineGrant>('timeline-grant', id)).filter(
      (g) => g.state === 'active',
    );
    const ids = [id];
    for (const grant of active) if (await this.account(grant.memberId)) ids.push(grant.memberId);
    const members = await Promise.all(
      [...new Set(ids)].sort().map(async (member) => ({
        id: member,
        ...(await profileView(this.db, member, 'Thành viên')),
      })),
    );
    const metadata = await this.db.owned<{ title: string }>('timeline-space', id, id);
    return {
      id,
      title: metadata?.title || 'Không gian chung',
      shared: true,
      members,
    };
  }
  async profileAccess(actor: string, owner: string) {
    if ((await this.deletion.blocked(actor)) || (await this.deletion.blocked(owner)))
      throw new NotFoundException();
    if (actor === owner) return;
    if (!(await this.account(actor)) || !(await this.account(owner))) throw new NotFoundException();
    const grants = [
      ...(await this.db.list<TimelineGrant>('timeline-grant', actor)),
      ...(await this.db.list<TimelineGrant>('timeline-grant', owner)),
    ];
    if (
      !grants.some(
        (g) =>
          g.state === 'active' &&
          ((g.timelineOwner === actor && g.memberId === owner) ||
            (g.timelineOwner === owner && g.memberId === actor)),
      )
    ) {
      const membership = async (id: string) => [
        id,
        ...(await this.db.list<{ id: string }>('timeline-member-index', id)).map((i) => i.id),
      ];
      // Two collaborators may belong to the same space without owning either account.
      const spaces = async (id: string) => {
        const owners = [id];
        for (const key of await membership(id)) {
          const grant = await this.db.get<TimelineGrant>('timeline-grant', key);
          if (
            grant?.memberId === id &&
            grant.state === 'active' &&
            (await this.account(grant.timelineOwner))
          )
            owners.push(grant.timelineOwner);
        }
        return owners;
      };
      const [a, b] = await Promise.all([spaces(actor), spaces(owner)]);
      if (!a.some((id) => b.includes(id))) throw new NotFoundException();
    }
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
        await freezeLegacyPrivate(this.db, actor);
        await this.db.insert('timeline-grant', grant.id, actor, grant);
        await this.db.insert('timeline-space', actor, actor, {
          id: actor,
          title: 'Không gian chung',
        });
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
          ...(input.action === 'accept' && current.state === 'pending'
            ? { acceptedAt: new Date().toISOString() }
            : {}),
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
