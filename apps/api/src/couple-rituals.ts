import { createHash, randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  answerInput,
  jarInput,
  revisionInput,
  dailyQuestions,
  type QuestionRound,
  type CoupleAnswer,
  type QuestionView,
  type LoveNote,
  type LoveNoteView,
} from '../../../packages/domain/couple.js';
import { todayIn, dateString } from '../../../packages/domain/index.js';
import type { Repository } from './database.js';
import type { JournalService } from './journal.js';
import type { AccountDeletion } from './account-deletion.js';
import type { ResourcePolicy } from './resource-policy.js';
const TZ = 'Asia/Ho_Chi_Minh';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
// Legacy sealed notes included an implicit author vote. Require fresh explicit votes.
const explicitApprovals = (n: LoveNote) =>
  n.consentVersion === 2 || n.openedAt ? n.approvals : [];
function uuid(s: string) {
  const x = digest(s).slice(0, 32).split('');
  x[12] = '5';
  x[16] = '8';
  const h = x.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export class CoupleRituals {
  constructor(
    private db: Repository,
    private journal: JournalService,
    private deletion: AccountDeletion,
    private resources: ResourcePolicy,
    private clock = () => new Date(),
  ) {}
  private now() {
    return this.clock().toISOString();
  }
  private async context(actor: string, spaceId: string) {
    z.uuid().parse(spaceId);
    const space = await this.journal.sharing.space(actor, spaceId);
    if (!space.shared)
      throw new BadRequestException('Chọn không gian chung để cùng lưu những điều thương.');
    const state = await this.journal.sharing.state(spaceId);
    const ids = space.members.map((m) => m.id).sort();
    const grants = state.grants
      .filter(
        (g) => g.timelineOwner === spaceId && g.state === 'active' && ids.includes(g.memberId),
      )
      .map((g) => g.id)
      .sort();
    return { spaceId, members: space.members, ids, epoch: digest(JSON.stringify([ids, grants])) };
  }
  private async write<T>(
    actor: string,
    spaceId: string,
    action: (c: Awaited<ReturnType<CoupleRituals['context']>>) => Promise<T>,
  ) {
    const original = await this.context(actor, spaceId),
      operations: string[] = [];
    try {
      for (const id of [...new Set([...original.ids, actor, spaceId])].sort())
        operations.push(await this.deletion.begin(id));
      return await this.db.transaction(async () => {
        if (this.db.driver === 'postgresql')
          for (const id of [...new Set([...original.ids, actor, spaceId])].sort())
            await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [
              'owner-operation:' + id,
            ]);
        await this.journal.sharing.lock(spaceId, actor);
        const current = await this.context(actor, spaceId);
        if (current.epoch !== original.epoch)
          throw new ConflictException('Thành viên vừa thay đổi. Hãy tải lại không gian.');
        return action(current);
      });
    } finally {
      for (const operation of operations.reverse()) await this.deletion.end(operation);
    }
  }
  private virtual(
    c: Awaited<ReturnType<CoupleRituals['context']>>,
    forDate?: string,
  ): QuestionRound {
    const date = forDate || todayIn(TZ, this.clock()),
      day = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
    return {
      id: uuid(c.spaceId + ':' + c.epoch + ':' + date),
      spaceId: c.spaceId,
      epoch: c.epoch,
      participants: c.ids,
      date,
      prompt:
        dailyQuestions[(day + parseInt(digest(c.spaceId).slice(0, 6), 16)) % dailyQuestions.length],
      revision: -1,
      createdAt: this.now(),
    };
  }
  private async answers(round: QuestionRound) {
    return (
      await this.db.query("SELECT payload FROM records WHERE kind='couple-answer' AND id LIKE ?", [
        round.id + ':%',
      ])
    ).map((r) => JSON.parse(String(r.payload)) as CoupleAnswer);
  }
  private async question(
    actor: string,
    round: QuestionRound,
    c: Awaited<ReturnType<CoupleRituals['context']>>,
  ): Promise<QuestionView> {
    if (!round.participants.includes(actor)) throw new NotFoundException();
    const answers = await this.answers(round),
      { epoch: _, participants: __, ...view } = round;
    return {
      ...view,
      membersChanged: round.epoch !== c.epoch,
      participants: round.participants.map((id) => {
        const member = c.members.find((m) => m.id === id),
          answer = answers.find((a) => a.actorId === id);
        return {
          id,
          displayName: member?.displayName || 'Thành viên trước đây',
          avatarUrl: member?.avatarUrl,
          answered: !!answer,
          ...(answer && (round.revealedAt || id === actor) ? { text: answer.text } : {}),
        };
      }),
    };
  }
  private note(
    actor: string,
    n: LoveNote,
    c: Awaited<ReturnType<CoupleRituals['context']>>,
  ): LoveNoteView {
    const changed = n.epoch !== c.epoch,
      opened = !!n.openedAt || this.now() >= n.unlockAt,
      author = c.members.find((m) => m.id === n.authorId);
    const { epoch: _, participants: __, text, approvals: _approvals, ...view } = n;
    const approvals = explicitApprovals(n);
    return {
      ...view,
      opened,
      membersChanged: changed,
      mine: n.authorId === actor,
      authorName: author?.displayName || 'Thành viên trước đây',
      authorAvatarUrl: author?.avatarUrl,
      ...(opened || n.authorId === actor ? { text } : {}),
      approvalCount: approvals.length,
      participantCount: n.participants.length,
      approvedByMe: approvals.includes(actor),
      canApprove: !changed && !opened,
      canDelete: actor === n.authorId,
    };
  }
  private async listNotes(spaceId: string) {
    return (
      await this.db.query(
        "SELECT payload FROM records WHERE kind='love-note' AND id LIKE ? ORDER BY id",
        [spaceId + ':%'],
      )
    ).map((r) => JSON.parse(String(r.payload)) as LoveNote);
  }
  private async pageRecords<T>(
    kind: 'love-note' | 'couple-round',
    spaceId: string,
    actor: string,
    page: number,
    exclude?: string,
  ) {
    const pg = this.db.driver === 'postgresql';
    const membership = pg
      ? "payload::jsonb->'participants' @> ?::jsonb"
      : "EXISTS(SELECT 1 FROM json_each(records.payload,'$.participants') p WHERE p.value=?)";
    const where =
      'kind=? AND ' +
      (kind === 'love-note' ? 'id LIKE ?' : 'owner=?') +
      ' AND ' +
      membership +
      (exclude ? ' AND id<>?' : '');
    const values = [
      kind,
      kind === 'love-note' ? spaceId + ':%' : spaceId,
      pg ? JSON.stringify([actor]) : actor,
      ...(exclude ? [exclude] : []),
    ];
    const count = (
      await this.db.query('SELECT COUNT(*) AS count FROM records WHERE ' + where, values)
    )[0];
    const field = kind === 'couple-round' ? 'date' : 'createdAt';
    const order = pg ? `payload::jsonb->>'${field}'` : `json_extract(payload,'$.${field}')`;
    const rows = await this.db.query(
      'SELECT payload FROM records WHERE ' +
        where +
        ' ORDER BY ' +
        order +
        ' DESC,id DESC LIMIT ? OFFSET ?',
      [...values, 12, page * 12],
    );
    return {
      items: rows.map((r) => JSON.parse(String(r.payload)) as T),
      total: Number(count.count),
    };
  }
  async state(actor: string, spaceId: string, raw: unknown = {}) {
    const { page, questionPage } = z
      .object({
        page: z.coerce.number().int().min(0).max(100).default(0),
        questionPage: z.coerce.number().int().min(0).max(200).default(0),
      })
      .parse(raw);
    const c = await this.context(actor, spaceId),
      v = this.virtual(c),
      round = await this.db.owned<QuestionRound>('couple-round', v.id, spaceId);
    const all = await this.pageRecords<LoveNote>('love-note', spaceId, actor, page);
    const rounds = await this.pageRecords<QuestionRound>(
      'couple-round',
      spaceId,
      actor,
      questionPage,
      v.id,
    );
    return {
      members: c.members,
      today: v.date,
      daily: c.ids.length === 2 ? await this.question(actor, round || v, c) : null,
      jar: all.items.map((n) => this.note(actor, n, c)),
      jarTotal: all.total,
      jarHasMore: all.total > (page + 1) * 12,
      questions: await Promise.all(rounds.items.map((r) => this.question(actor, r, c))),
      questionsHasMore: rounds.total > (questionPage + 1) * 12,
      timezone: TZ,
      limits: { noteLength: 1200, answerLength: 1200, notesPerPerson: 500 },
    };
  }
  async answer(actor: string, spaceId: string, body: unknown) {
    const input = answerInput.parse(body);
    return this.write(actor, spaceId, async (c) => {
      if (c.ids.length !== 2)
        throw new BadRequestException(
          'Câu hỏi hằng ngày dành cho không gian có đúng hai thành viên.',
        );
      const today = todayIn(TZ, this.clock());
      const date = input.date || today;
      let round = await this.db.owned<QuestionRound>('couple-round', input.roundId, spaceId);
      if (!round) {
        const earliest = new Date(Date.parse(today + 'T00:00:00Z') - 7 * 86400000)
          .toISOString()
          .slice(0, 10);
        if (date > today || date < earliest)
          throw new BadRequestException('Bản nháp câu hỏi đã quá hạn bảy ngày.');
        const draft = this.virtual(c, date);
        if (input.roundId !== draft.id) throw new NotFoundException();
        round = draft;
      }
      if (!round.participants.includes(actor) || round.epoch !== c.epoch)
        throw new ForbiddenException('Thành viên đã thay đổi; lượt trả lời cũ vẫn được giữ kín.');
      const existing = await this.db.owned<CoupleAnswer>(
        'couple-answer',
        round.id + ':' + actor,
        actor,
      );
      if (existing?.requestId === input.requestId && existing.text === input.text)
        return this.question(actor, round, c);
      if (round.revision !== input.expectedRevision)
        throw new ConflictException(
          'Có câu trả lời mới. Nội dung bạn đang viết được giữ; hãy kiểm tra rồi gửi lại.',
        );
      if (round.revealedAt || existing)
        throw new BadRequestException(
          'Bạn đã gửi câu trả lời. Có thể rút lại trước khi cả hai cùng mở.',
        );
      await this.resources.admitTextRecord(actor, 'couple-answer', 2000);
      if (round.revision === -1) {
        await this.resources.admitTextRecord(spaceId, 'couple-round', 2000);
        if (!(await this.db.insert('couple-round', round.id, spaceId, { ...round, revision: 0 })))
          throw new ConflictException();
        round = { ...round, revision: 0 };
      }
      await this.db.insert('couple-answer', round.id + ':' + actor, actor, {
        id: round.id + ':' + actor,
        roundId: round.id,
        spaceId,
        actorId: actor,
        text: input.text,
        requestId: input.requestId,
        createdAt: this.now(),
      } satisfies CoupleAnswer);
      const answers = await this.answers(round),
        next = {
          ...round,
          revision: round.revision + 1,
          ...(round.participants.every((id) => answers.some((a) => a.actorId === id))
            ? { revealedAt: this.now() }
            : {}),
        };
      if (!(await this.db.compareAndSwap('couple-round', round.id, spaceId, round.revision, next)))
        throw new ConflictException();
      return this.question(actor, next, c);
    });
  }
  async withdraw(actor: string, spaceId: string, id: string, body: unknown) {
    const input = revisionInput.parse(body);
    return this.write(actor, spaceId, async (c) => {
      const round = await this.db.owned<QuestionRound>('couple-round', z.uuid().parse(id), spaceId);
      if (!round || !round.participants.includes(actor)) throw new NotFoundException();
      if (round.revision !== input.expectedRevision)
        throw new ConflictException('Câu hỏi vừa thay đổi. Hãy tải lại.');
      if (round.revealedAt)
        throw new BadRequestException('Câu trả lời đã cùng mở, không thể rút lại.');
      const next = { ...round, revision: round.revision + 1 };
      if (!(await this.db.compareAndSwap('couple-round', id, spaceId, round.revision, next)))
        throw new ConflictException();
      await this.db.remove('couple-answer', id + ':' + actor);
      return this.question(actor, next, c);
    });
  }
  async saveMemory(actor: string, spaceId: string, id: string, body: unknown) {
    const input = revisionInput.parse(body);
    return this.write(actor, spaceId, async (c) => {
      const round = await this.db.owned<QuestionRound>('couple-round', z.uuid().parse(id), spaceId);
      if (!round || !round.participants.includes(actor)) throw new NotFoundException();
      if (round.milestoneId) return { id: round.milestoneId, date: round.date };
      if (!round.revealedAt || round.epoch !== c.epoch)
        throw new BadRequestException('Chỉ lưu khi đã cùng mở và thành viên không thay đổi.');
      if (round.revision !== input.expectedRevision) throw new ConflictException();
      const view = await this.question(actor, round, c),
        entry = await this.journal.create(actor, {
          title: 'Câu hỏi của chúng mình · ' + round.date,
          date: round.date,
          kind: 'memory',
          annual: false,
          timelineId: spaceId,
          note:
            round.prompt +
            '\n\n' +
            view.participants
              .map((p) => p.displayName + ': ' + (p.text || 'Nội dung đã xóa'))
              .join('\n\n'),
        });
      if (
        !(await this.db.compareAndSwap('couple-round', id, spaceId, round.revision, {
          ...round,
          milestoneId: entry.id,
          revision: round.revision + 1,
        }))
      )
        throw new ConflictException();
      return { id: entry.id, date: round.date };
    });
  }
  async addNote(actor: string, spaceId: string, body: unknown) {
    const input = jarInput.parse(body);
    return this.write(actor, spaceId, async (c) => {
      if (c.ids.length < 2)
        throw new BadRequestException('Cần ít nhất hai thành viên để cùng giữ lọ điều thương.');
      const id = spaceId + ':' + input.requestId,
        existing = await this.db.get<LoveNote>('love-note', id);
      if (existing) {
        if (existing.authorId !== actor) throw new ForbiddenException();
        if (
          existing.text !== input.text ||
          existing.mode !== input.mode ||
          (input.openDate &&
            existing.unlockAt !== new Date(input.openDate + 'T00:00:00+07:00').toISOString())
        )
          throw new ConflictException('Mã gửi đã được sử dụng.');
        return this.note(actor, existing, c);
      }
      await this.resources.admitTextRecord(actor, 'love-note', 500);
      if ((await this.listNotes(spaceId)).length >= 1000)
        throw new BadRequestException(
          'Lọ đã có 1.000 lời nhắn. Hãy dọn những điều không còn cần giữ.',
        );
      const today = todayIn(TZ, this.clock()),
        [year, month] = today.split('-').map(Number),
        lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
        openDate = dateString.parse(input.mode === 'month-end' ? lastDay : input.openDate);
      if (openDate < today || openDate > String(year + 5) + today.slice(4))
        throw new BadRequestException('Chọn ngày mở từ hôm nay đến tối đa 5 năm tới.');
      const unlockAt = new Date(openDate + 'T00:00:00+07:00').toISOString();
      const note: LoveNote = {
        id,
        spaceId,
        epoch: c.epoch,
        participants: c.ids,
        authorId: actor,
        text: input.text,
        mode: input.mode,
        approvals: [],
        consentVersion: 2,
        unlockAt,
        createdAt: this.now(),
        revision: 0,
      };
      await this.db.insert('love-note', id, actor, note);
      return this.note(actor, note, c);
    });
  }
  async draw(actor: string, spaceId: string) {
    return this.write(actor, spaceId, async (c) => {
      const notes = (await this.listNotes(spaceId)).filter(
        (n) => n.participants.includes(actor) && (!!n.openedAt || this.now() >= n.unlockAt),
      );
      if (!notes.length)
        throw new BadRequestException(
          'Chưa có lời nhắn đủ điều kiện mở. Chờ ngày hẹn hoặc cùng đồng ý mở trước nhé.',
        );
      return this.note(actor, notes[randomInt(notes.length)], c);
    });
  }
  async vote(actor: string, spaceId: string, id: string, body: unknown) {
    const input = revisionInput.extend({ approve: z.boolean() }).parse(body);
    return this.write(actor, spaceId, async (c) => {
      const n = await this.db.get<LoveNote>('love-note', id);
      if (!n || n.spaceId !== spaceId || !n.participants.includes(actor))
        throw new NotFoundException();
      if (n.revision !== input.expectedRevision)
        throw new ConflictException('Lời nhắn vừa thay đổi; hãy tải lại.');
      if (n.epoch !== c.epoch || n.openedAt || this.now() >= n.unlockAt)
        throw new BadRequestException('Lời nhắn này không thể thay đổi biểu quyết.');
      const approvals = input.approve
          ? [...new Set([...explicitApprovals(n), actor])]
          : explicitApprovals(n).filter((x) => x !== actor),
        next = {
          ...n,
          approvals,
          consentVersion: 2 as const,
          revision: n.revision + 1,
          ...(n.participants.every((p) => approvals.includes(p)) ? { openedAt: this.now() } : {}),
        };
      if (!(await this.db.compareAndSwap('love-note', id, n.authorId, n.revision, next)))
        throw new ConflictException();
      return this.note(actor, next, c);
    });
  }
  async removeNote(actor: string, spaceId: string, id: string, body: unknown) {
    const input = revisionInput.parse(body);
    return this.write(actor, spaceId, async () => {
      const n = await this.db.owned<LoveNote>('love-note', id, actor);
      if (!n || n.spaceId !== spaceId) throw new NotFoundException();
      if (n.revision !== input.expectedRevision) throw new ConflictException();
      await this.db.remove('love-note', id);
      return { ok: true };
    });
  }
}
