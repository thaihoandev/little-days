import { createHash } from 'node:crypto';
import type { Account } from './auth.js';
import type { TimelineGrant } from '../../../packages/domain/journal.js';
import { Repository } from './database.js';
import { AccountDeletion } from './account-deletion.js';
import { MailDeliveryError, type Mail, type Mailer } from './mail.js';
import { mailContent } from './mail-templates.js';
import { logEvent } from './observability.js';

type Purpose = 'timeline-invite' | 'password-changed';
export type ActivityDelivery =
  'accepted' | 'failed' | 'unknown' | 'skipped' | 'disabled' | 'throttled';
type Receipt = {
  id: string;
  purpose: Purpose;
  timelineOwner: string;
  recipientId: string;
  createdAt: number;
  delivery: ActivityDelivery | 'sending';
  revision: number;
};

// A committed receipt reserves one attempt. An ambiguous result is never blindly retried.
// This is intentionally not a retry queue and does not send on API startup or backup restore.
export class ActivityMail {
  constructor(
    private db: Repository,
    private deletion: AccountDeletion,
    private mailer: Mailer,
    private origin: string,
  ) {}
  private async account(owner: string) {
    const account = (await this.db.list<Account>('account', owner))[0];
    return account?.emailVerifiedAt && !account.deletingAt && !(await this.deletion.blocked(owner))
      ? account
      : undefined;
  }
  async invitation(grant: TimelineGrant): Promise<ActivityDelivery> {
    const valid = async () => {
      const current = await this.db.owned<TimelineGrant>(
        'timeline-grant',
        grant.id,
        grant.timelineOwner,
      );
      if (
        !current ||
        current.memberId !== grant.memberId ||
        current.state !== 'pending' ||
        Date.now() - Date.parse(current.createdAt) > 30 * 86400000
      )
        return;
      const [sender, recipient] = await Promise.all([
        this.account(grant.timelineOwner),
        this.account(grant.memberId),
      ]);
      return sender && recipient ? recipient : undefined;
    };
    return this.deliver(
      'timeline-invite',
      grant.id,
      grant.timelineOwner,
      grant.memberId,
      valid,
      () => ({
        subject: 'Little Days · Một lời mời cùng giữ kỉ niệm',
        ...mailContent({
          eyebrow: 'MÌNH CÙNG VIẾT TIẾP NHÉ',
          title: 'Có một lời mời dành cho bạn',
          paragraphs: [
            'Một người đã mời bạn cùng xây dựng không gian kỉ niệm trên Little Days. Bạn có thể xem lời mời và quyết định có tham gia hay không.',
          ],
          action: 'Xem lời mời',
          url: new URL('/timeline?sharing=1', this.origin).href,
          note: 'Đăng nhập bằng tài khoản nhận thư để xem. Bấm liên kết không tự chấp nhận lời mời; ảnh và lời nhắn riêng tư không được đưa vào email.',
        }),
      }),
    );
  }
  async passwordChanged(account: Account): Promise<ActivityDelivery> {
    return this.deliver(
      'password-changed',
      `${account.id}:${account.credentialVersion ?? 0}`,
      account.id,
      account.id,
      async () => {
        const current = await this.account(account.id);
        return current?.credentialVersion === account.credentialVersion ? current : undefined;
      },
      () => ({
        subject: 'Little Days · Mật khẩu của bạn vừa thay đổi',
        ...mailContent({
          eyebrow: 'BẢO VỆ GÓC RIÊNG CỦA BẠN',
          title: 'Mật khẩu vừa được cập nhật',
          paragraphs: [
            'Mật khẩu tài khoản Little Days của bạn đã thay đổi thành công. Nếu chính bạn thực hiện, bạn không cần làm gì thêm.',
            'Nếu không nhận ra thao tác này, hãy mở Little Days và dùng Quên mật khẩu ở phần đăng nhập để lấy lại quyền kiểm soát tài khoản.',
          ],
          action: 'Mở Little Days',
          url: new URL('/today', this.origin).href,
          note: 'Little Days không bao giờ yêu cầu bạn gửi mật khẩu qua email. Thông báo này không chứa mật khẩu hay liên kết tự đăng nhập.',
        }),
      }),
    );
  }
  private async deliver(
    purpose: Purpose,
    event: string,
    sender: string,
    recipientId: string,
    valid: () => Promise<Account | undefined>,
    content: () => Omit<Mail, 'to'>,
  ): Promise<ActivityDelivery> {
    if (this.mailer.kind === 'disabled') return 'disabled';
    const operations: string[] = [];
    const id = createHash('sha256').update(`${purpose}:${event}`).digest('hex');
    try {
      for (const owner of [...new Set([sender, recipientId])].sort())
        operations.push(await this.deletion.begin(owner));
      const claim = await this.db.transaction(async () => {
        if (this.db.driver === 'postgresql') {
          for (const owner of [...new Set([sender, recipientId])].sort())
            await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [
              'owner-operation:' + owner,
            ]);
          await this.db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [
            'activity-mail:' + recipientId,
          ]);
        }
        const account = await valid();
        if (!account) return { result: 'skipped' as const };
        const now = await this.db.now();
        const receipts = await this.db.list<Receipt>('activity-mail', recipientId);
        for (const receipt of receipts)
          if (receipt.createdAt < now - 30 * 86400000)
            await this.db.remove('activity-mail', receipt.id);
        const previous = receipts.find(
          (receipt) => receipt.id === id && receipt.createdAt >= now - 30 * 86400000,
        );
        if (previous)
          return {
            result: previous.delivery === 'sending' ? ('unknown' as const) : previous.delivery,
          };
        const day = Math.floor(now / 86400000);
        if (
          receipts.filter(
            (receipt) =>
              receipt.purpose === purpose && Math.floor(receipt.createdAt / 86400000) === day,
          ).length >= 5
        )
          return { result: 'throttled' as const };
        const receipt: Receipt = {
          id,
          purpose,
          recipientId,
          timelineOwner: sender,
          createdAt: now,
          delivery: 'sending',
          revision: 0,
        };
        if (!(await this.db.insert('activity-mail', id, recipientId, receipt)))
          return { result: 'unknown' as const };
        return { account, receipt };
      });
      if ('result' in claim) return claim.result!;
      let delivery: ActivityDelivery = 'accepted';
      try {
        if (!(await valid())) delivery = 'skipped';
        else await this.mailer.send({ to: claim.account.email, ...content() });
      } catch (error) {
        delivery =
          error instanceof MailDeliveryError &&
          error.status &&
          error.status >= 400 &&
          error.status < 500
            ? 'failed'
            : 'unknown';
      }
      await this.db.compareAndSwap('activity-mail', id, recipientId, 0, {
        ...claim.receipt,
        delivery,
        revision: 1,
      });
      logEvent('activity_mail_delivery', { purpose, provider: this.mailer.kind, delivery });
      return delivery;
    } catch {
      logEvent('activity_mail_delivery', {
        purpose,
        provider: this.mailer.kind,
        delivery: 'unknown',
      });
      return 'unknown';
    } finally {
      for (const operation of operations.reverse())
        await this.deletion.end(operation).catch(() => {});
    }
  }
}
