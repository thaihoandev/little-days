import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Album } from '../../../packages/domain/index.js';
import { occursOn } from '../../../packages/domain/journal.js';
import {
  defaultReminderPreferences,
  reminderPreferencesSchema,
  reminderContentSchema,
  reminderSourceSchema,
  localReminderClock,
  shiftCalendarDate,
  type ReminderSource,
  type ReminderPreferences,
  type ReminderRule,
  type ReminderRuleView,
  type ReminderNotification,
  type NotificationView,
  type NotificationList,
} from '../../../packages/domain/reminders.js';
import { Repository } from './database.js';
import { JournalService } from './journal.js';
import { AccountDeletion } from './account-deletion.js';
import type { Account } from './auth.js';
import { type Mailer, MailDeliveryError } from './mail.js';
import { logEvent } from './observability.js';
type SourceView = { title: string; date: string; annual: boolean; owner: string; grantId?: string };
type SchedulerState = { token: string; until: number; cursor: string; lastRunAt?: number };
type EmailReceipt = {
  ruleId: string;
  timelineOwner: string;
  attemptedAt: string;
  delivery: 'sending' | 'accepted' | 'failed' | 'unknown';
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const revisionSchema = z.object({ expectedRevision: z.number().int().min(-1) });
export class ReminderService {
  constructor(
    private db: Repository,
    private journal: JournalService,
    private deletion: AccountDeletion,
    private mailer: Mailer,
    private appOrigin: string,
    private options: { now?: () => Promise<number> } = {},
  ) {}
  private now() {
    return this.options.now ? this.options.now() : this.db.now();
  }
  private async account(actor: string) {
    if (await this.deletion.blocked(actor)) throw new NotFoundException();
    return (await this.db.list<Account>('account', actor))[0];
  }
  async preferences(actor: string): Promise<ReminderPreferences> {
    await this.journal.sharing.access(actor, actor);
    return (
      (await this.db.get<ReminderPreferences>('reminder-preferences', actor)) || {
        ...defaultReminderPreferences,
      }
    );
  }
  async settings(actor: string) {
    const prefs = await this.preferences(actor),
      account = await this.account(actor);
    const state = await this.db.get<SchedulerState>('reminder-scheduler', 'global');
    return {
      preferences: prefs,
      canEmail:
        !!account?.emailVerifiedAt && !account.deletingAt && this.mailer.kind !== 'disabled',
      lastSchedulerRunAt: state?.lastRunAt ?? null,
    };
  }
  private async guard<T>(actor: string, action: () => Promise<T>) {
    const operation = await this.deletion.begin(actor);
    try {
      return await this.db.transaction(async () => {
        await this.journal.sharing.lock(actor);
        return action();
      });
    } finally {
      await this.deletion.end(operation);
    }
  }
  async savePreferences(actor: string, body: unknown) {
    const input = z
      .object({ expectedRevision: z.number().int().min(-1), content: reminderPreferencesSchema })
      .parse(body);
    return this.guard(actor, async () => {
      if (input.content.emailEnabled) {
        const account = await this.account(actor);
        if (!account?.emailVerifiedAt || account.deletingAt || this.mailer.kind === 'disabled')
          throw new ForbiddenException('Cần tài khoản đã xác minh email và dịch vụ mail sẵn sàng.');
      }
      const next = { ...input.content, revision: input.expectedRevision + 1 };
      const ok =
        input.expectedRevision === -1
          ? await this.db.insert('reminder-preferences', actor, actor, next)
          : await this.db.compareAndSwap(
              'reminder-preferences',
              actor,
              actor,
              input.expectedRevision,
              next,
            );
      if (!ok) throw new ConflictException('Thiết lập vừa thay đổi. Hãy tải lại trước khi lưu.');
      await this.db.remove('reminder-view-state', actor);
      return next;
    });
  }
  private async resolve(actor: string, raw: ReminderSource): Promise<SourceView> {
    const source = reminderSourceSchema.parse(raw);
    if (source.kind === 'journal') {
      const owner = await this.db.owner('journal', source.id);
      if (!owner) throw new NotFoundException();
      const grant = await this.journal.sharing.access(actor, owner),
        entry = await this.journal.owned(actor, source.id);
      return {
        title: entry.title,
        date: entry.date,
        annual: entry.annual,
        owner,
        grantId: grant?.id,
      };
    }
    await this.journal.sharing.access(actor, actor);
    const album = await this.db.owned<Album>('album', source.id, actor);
    if (!album) throw new NotFoundException();
    if (source.kind === 'album-start')
      return {
        title: 'Ngày bắt đầu · ' + album.names.join(' & '),
        date: album.startDate,
        annual: album.startDateAnnual === true,
        owner: actor,
      };
    const memory = album.memories.find((m) => m.id === source.memoryId);
    if (!memory) throw new NotFoundException();
    return { title: memory.title, date: memory.date, annual: false, owner: actor };
  }
  private async withSource<T>(
    actor: string,
    source: ReminderSource,
    action: (view: SourceView) => Promise<T>,
  ) {
    const initial = await this.resolve(actor, source),
      operations: string[] = [];
    try {
      for (const owner of [...new Set([actor, initial.owner])].sort())
        operations.push(await this.deletion.begin(owner));
      return await this.db.transaction(async () => {
        await this.journal.sharing.lock(initial.owner, actor);
        return action(await this.resolve(actor, source));
      });
    } finally {
      for (const operation of operations.reverse()) await this.deletion.end(operation);
    }
  }
  private async validRule(rule: ReminderRule) {
    if (!rule.enabled) return null;
    try {
      const source = await this.resolve(rule.userId, rule.source);
      return source.grantId === rule.grantId ? source : null;
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }
  async rules(actor: string): Promise<ReminderRuleView[]> {
    await this.journal.sharing.access(actor, actor);
    const result: ReminderRuleView[] = [];
    for (const rule of await this.db.list<ReminderRule>('reminder-rule', actor)) {
      let title = 'Kỉ niệm không còn khả dụng',
        available = false;
      try {
        const source = await this.resolve(actor, rule.source);
        if (source.grantId === rule.grantId) {
          title = source.title;
          available = true;
        }
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
      const { userId: _, timelineOwner: __, grantId: ___, ...view } = rule;
      result.push({ ...view, title, available });
    }
    return result;
  }
  async saveRule(actor: string, body: unknown) {
    const input = z
      .object({ expectedRevision: z.number().int().min(-1), content: reminderContentSchema })
      .parse(body);
    const id = actor + ':' + hash(JSON.stringify(input.content.source));
    return this.withSource(actor, input.content.source, async (source) => {
      if (
        input.expectedRevision === -1 &&
        (await this.db.list('reminder-rule', actor)).length >= 100
      )
        throw new BadRequestException('Tối đa 100 lời nhắc cho mỗi tài khoản.');
      if (input.content.email) {
        const a = await this.account(actor);
        if (!a?.emailVerifiedAt || a.deletingAt || this.mailer.kind === 'disabled')
          throw new ForbiddenException('Xác minh email trước khi chọn nhắc qua email.');
      }
      const next: ReminderRule = {
        ...input.content,
        id,
        userId: actor,
        timelineOwner: source.owner,
        grantId: source.grantId,
        revision: input.expectedRevision + 1,
      };
      const ok =
        input.expectedRevision === -1
          ? await this.db.insert('reminder-rule', id, actor, next)
          : await this.db.compareAndSwap('reminder-rule', id, actor, input.expectedRevision, next);
      if (!ok) throw new ConflictException('Lời nhắc vừa thay đổi. Hãy tải lại trước khi lưu.');
      await this.db.remove('reminder-view-state', actor);
      const { userId: _, timelineOwner: __, grantId: ___, ...view } = next;
      return { ...view, title: source.title, available: true };
    });
  }
  async removeRule(actor: string, id: string, body: unknown) {
    const { expectedRevision } = revisionSchema.parse(body);
    return this.guard(actor, async () => {
      const rule = await this.db.owned<ReminderRule>('reminder-rule', id, actor);
      if (!rule) throw new NotFoundException();
      if (rule.revision !== expectedRevision)
        throw new ConflictException('Lời nhắc vừa thay đổi. Hãy tải lại.');
      await this.db.remove('reminder-rule', id);
      return { ok: true };
    });
  }
  private async materialize(rule: ReminderRule, now: number) {
    const prefs = await this.preferences(rule.userId),
      local = localReminderClock(now, prefs.timeZone);
    if (!rule.enabled || local.hour < prefs.hour) return [];
    const source = await this.validRule(rule);
    if (!source) return [];
    const due = rule.offsets.filter((offset) =>
      occursOn(source, shiftCalendarDate(local.date, offset)),
    );
    if (!due.length) return [];
    return this.withSource(rule.userId, rule.source, async (fresh) => {
      const current = await this.db.get<ReminderRule>('reminder-rule', rule.id);
      if (!current?.enabled || current.revision !== rule.revision || fresh.grantId !== rule.grantId)
        return [];
      const notices: ReminderNotification[] = [];
      for (const offset of due) {
        const occurrenceDate = shiftCalendarDate(local.date, offset),
          id = hash(JSON.stringify([rule.id, rule.grantId || 'own', occurrenceDate, offset]));
        const receipt = await this.db.owned<EmailReceipt>(
          'reminder-email-receipt',
          id,
          rule.userId,
        );
        const notification: ReminderNotification = {
          id,
          ruleId: rule.id,
          timelineOwner: fresh.owner,
          occurrenceDate,
          offset,
          createdAt: new Date(now).toISOString(),
          revision: 0,
          emailDelivery: receipt?.delivery ?? 'none',
          ...(receipt ? { attemptedAt: receipt.attemptedAt } : {}),
        };
        await this.db.insert('reminder-notification', id, rule.userId, notification);
        notices.push((await this.db.get<ReminderNotification>('reminder-notification', id))!);
      }
      const timestamp =
        this.db.driver === 'postgresql'
          ? "payload::jsonb->>'createdAt'"
          : "json_extract(payload,'$.createdAt')";
      await this.db.query(
        `DELETE FROM records WHERE kind='reminder-notification' AND owner=? AND id NOT IN (SELECT id FROM records WHERE kind='reminder-notification' AND owner=? ORDER BY ${timestamp} DESC,id DESC LIMIT 200) RETURNING id`,
        [rule.userId, rule.userId],
      );
      return notices;
    });
  }
  private async notificationSource(
    actor: string,
    notice: ReminderNotification,
    cache?: Map<string, Promise<{ rule: ReminderRule; source: SourceView } | null>>,
  ) {
    let context = cache?.get(notice.ruleId);
    if (!context) {
      context = (async () => {
        const rule = await this.db.owned<ReminderRule>('reminder-rule', notice.ruleId, actor);
        if (!rule) return null;
        const source = await this.validRule(rule);
        return source ? { rule, source } : null;
      })();
      cache?.set(notice.ruleId, context);
    }
    const value = await context;
    if (!value) return null;
    const { rule, source } = value;
    if (
      !rule.offsets.some((offset) => offset === notice.offset) ||
      !occursOn(source, notice.occurrenceDate)
    )
      return null;
    const expected = hash(
      JSON.stringify([rule.id, rule.grantId || 'own', notice.occurrenceDate, notice.offset]),
    );
    return expected === notice.id ? { rule, source } : null;
  }
  async notifications(actor: string): Promise<NotificationList> {
    await this.journal.sharing.access(actor, actor);
    const now = await this.now(),
      scan = await this.db.get<{ checkedAt: number }>('reminder-view-state', actor);
    if (!scan || now - scan.checkedAt >= 60000) {
      for (const rule of await this.db.list<ReminderRule>('reminder-rule', actor))
        try {
          await this.materialize(rule, now);
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error;
        }
      await this.guard(actor, async () => {
        await this.db.put('reminder-view-state', actor, actor, { checkedAt: now });
      });
    }
    const rows = (await this.db.list<ReminderNotification>('reminder-notification', actor)).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
    const items: NotificationView[] = [];
    const accessCache = new Map<
      string,
      Promise<{ rule: ReminderRule; source: SourceView } | null>
    >();
    for (const notice of rows.slice(0, 200)) {
      const valid = await this.notificationSource(actor, notice, accessCache);
      if (!valid) continue;
      items.push({
        id: notice.id,
        title: valid.source.title,
        occurrenceDate: notice.occurrenceDate,
        offset: notice.offset,
        createdAt: notice.createdAt,
        readAt: notice.readAt,
        emailDelivery:
          notice.emailDelivery === 'sending' &&
          notice.attemptedAt &&
          now - Date.parse(notice.attemptedAt) > 120000
            ? 'unknown'
            : notice.emailDelivery,
      });
    }
    if (rows.length > 200)
      await this.guard(actor, async () => {
        for (const row of rows.slice(200)) await this.db.remove('reminder-notification', row.id);
      });
    return { items, unread: items.filter((n) => !n.readAt).length };
  }
  async markRead(actor: string, id: string) {
    return this.guard(actor, async () => {
      const rows =
        id === 'all'
          ? await this.db.list<ReminderNotification>('reminder-notification', actor)
          : [await this.db.owned<ReminderNotification>('reminder-notification', id, actor)].filter(
              (n): n is ReminderNotification => !!n,
            );
      if (id !== 'all' && !rows.length) throw new NotFoundException();
      for (const row of rows) {
        if (row.readAt) continue;
        const next = {
          ...row,
          readAt: new Date(await this.now()).toISOString(),
          revision: row.revision + 1,
        };
        await this.db.compareAndSwap('reminder-notification', row.id, actor, row.revision, next);
      }
      return { ok: true };
    });
  }
  private async send(rule: ReminderRule, notice: ReminderNotification, schedulerToken: string) {
    if (!rule.email || notice.emailDelivery !== 'none') return false;
    const prefs = await this.preferences(rule.userId),
      local = localReminderClock(await this.now(), prefs.timeZone);
    if (
      !prefs.emailEnabled ||
      local.hour < prefs.hour ||
      shiftCalendarDate(local.date, notice.offset) !== notice.occurrenceDate
    )
      return false;
    const operations: string[] = [];
    try {
      for (const owner of [...new Set([rule.userId, rule.timelineOwner])].sort())
        operations.push(await this.deletion.begin(owner));
      const claim = await this.withSource(rule.userId, rule.source, async () => {
        if (this.db.driver === 'postgresql')
          await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', ['reminder-scheduler']);
        const scheduler = await this.db.get<SchedulerState>('reminder-scheduler', 'global');
        if (scheduler?.token !== schedulerToken || scheduler.until <= (await this.now()))
          return null;
        const a = await this.account(rule.userId),
          current = await this.db.owned<ReminderNotification>(
            'reminder-notification',
            notice.id,
            rule.userId,
          );
        const currentPrefs = await this.preferences(rule.userId),
          valid = current && (await this.notificationSource(rule.userId, current));
        const currentClock = localReminderClock(await this.now(), currentPrefs.timeZone);
        if (
          !a?.emailVerifiedAt ||
          a.deletingAt ||
          this.mailer.kind === 'disabled' ||
          !current ||
          !valid?.rule.email ||
          !currentPrefs.emailEnabled ||
          currentClock.hour < currentPrefs.hour ||
          shiftCalendarDate(currentClock.date, notice.offset) !== notice.occurrenceDate ||
          current.emailDelivery !== 'none'
        )
          return null;
        if (await this.db.get('reminder-email-receipt', notice.id)) return null;
        const next = {
          ...current,
          emailDelivery: 'sending' as const,
          attemptedAt: new Date(await this.now()).toISOString(),
          revision: current.revision + 1,
        };
        if (
          !(await this.db.compareAndSwap(
            'reminder-notification',
            current.id,
            rule.userId,
            current.revision,
            next,
          ))
        )
          return null;
        await this.db.insert('reminder-email-receipt', notice.id, rule.userId, {
          ruleId: rule.id,
          timelineOwner: rule.timelineOwner,
          attemptedAt: next.attemptedAt,
          delivery: 'sending',
        } satisfies EmailReceipt);
        return { email: a.email, notification: next };
      });
      if (!claim) return false;
      let delivery: 'accepted' | 'failed' | 'unknown' = 'accepted';
      try {
        // Keep shared titles, notes and photos out of mail; the link rechecks current access.
        if (
          !(await this.validRule(
            (await this.db.get<ReminderRule>('reminder-rule', rule.id)) ?? {
              ...rule,
              enabled: false,
            },
          ))
        )
          delivery = 'failed';
        else
          await this.mailer.send({
            to: claim.email,
            subject: 'Little Days · Có một ngày bạn muốn nhớ',
            text: `Bạn đã bật lời nhắc ${notice.offset ? `trước ${notice.offset} ngày` : 'đúng ngày'} cho một kỉ niệm vào ${notice.occurrenceDate}.\n\nMở lịch riêng tư của bạn: ${new URL('/calendar?date=' + notice.occurrenceDate, this.appOrigin).href}\n\nBạn có thể đổi hoặc tắt lời nhắc tại biểu tượng chuông → Cài đặt. Thư không chứa ảnh hoặc lời nhắn riêng tư.`,
          });
      } catch (error) {
        delivery =
          error instanceof MailDeliveryError &&
          error.status &&
          error.status >= 400 &&
          error.status < 500
            ? 'failed'
            : 'unknown';
      }
      await this.guard(rule.userId, async () => {
        const receipt = await this.db.owned<EmailReceipt>(
          'reminder-email-receipt',
          notice.id,
          rule.userId,
        );
        if (receipt)
          await this.db.put('reminder-email-receipt', notice.id, rule.userId, {
            ...receipt,
            delivery,
          });
        const current = await this.db.owned<ReminderNotification>(
          'reminder-notification',
          notice.id,
          rule.userId,
        );
        if (current?.emailDelivery === 'sending')
          await this.db.compareAndSwap(
            'reminder-notification',
            current.id,
            rule.userId,
            current.revision,
            { ...current, emailDelivery: delivery, revision: current.revision + 1 },
          );
      });
      logEvent('reminder_email_attempt', { delivery });
      return true;
    } finally {
      for (const operation of operations.reverse()) await this.deletion.end(operation);
    }
  }
  async runScheduled() {
    const token = randomUUID(),
      now = await this.now(),
      started = performance.now();
    const lock = async () => {
      if (this.db.driver === 'postgresql')
        await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', ['reminder-scheduler']);
    };
    const claim = await this.db.transaction(async () => {
      await lock();
      const old = await this.db.get<SchedulerState>('reminder-scheduler', 'global');
      if (old && old.until > now) return null;
      const next = {
        token,
        until: now + 120000,
        cursor: old?.cursor || '',
        lastRunAt: old?.lastRunAt,
      };
      await this.db.put('reminder-scheduler', 'global', 'system', next);
      return next;
    });
    if (!claim) return { busy: true, processed: 0, attempted: 0 };
    let cursor = claim.cursor,
      processed = 0,
      attempted = 0;
    try {
      const rows = await this.db.query(
        "SELECT id,payload FROM records WHERE kind='reminder-rule' AND id>? ORDER BY id LIMIT 100",
        [cursor],
      );
      for (const row of rows) {
        if (performance.now() - started > 30000 || attempted >= 5) break;
        const lease = await this.db.get<SchedulerState>('reminder-scheduler', 'global');
        if (lease?.token !== token || lease.until <= (await this.now())) break;
        const rule = JSON.parse(String(row.payload)) as ReminderRule;
        try {
          for (const notice of await this.materialize(rule, now)) {
            if (attempted < 5 && (await this.send(rule, notice, token))) attempted++;
          }
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error;
        }
        cursor = String(row.id);
        processed++;
      }
      if (processed === rows.length) cursor = '';
      return { busy: false, processed, attempted };
    } finally {
      await this.db.transaction(async () => {
        await lock();
        const current = await this.db.get<SchedulerState>('reminder-scheduler', 'global');
        if (current?.token === token)
          await this.db.put('reminder-scheduler', 'global', 'system', {
            ...current,
            cursor,
            until: 0,
            lastRunAt: await this.now(),
          });
      });
    }
  }
}
