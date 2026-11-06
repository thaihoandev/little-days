import { z } from 'zod';
import { dateString } from './index.js';
export const reminderSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('journal'), id: z.uuid() }),
  z.object({ kind: z.literal('album-start'), id: z.uuid() }),
  z.object({ kind: z.literal('album-memory'), id: z.uuid(), memoryId: z.uuid() }),
]);
export type ReminderSource = z.infer<typeof reminderSourceSchema>;
export const reminderPreferencesSchema = z.object({
  timeZone: z
    .string()
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('vi', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Múi giờ không hợp lệ.'),
  hour: z.number().int().min(0).max(23),
  emailEnabled: z.boolean(),
  showHolidays: z.boolean(),
});
export type ReminderPreferences = z.infer<typeof reminderPreferencesSchema> & { revision: number };
export const defaultReminderPreferences: ReminderPreferences = {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: 9,
  emailEnabled: false,
  showHolidays: true,
  revision: -1,
};
export const reminderContentSchema = z.object({
  source: reminderSourceSchema,
  offsets: z
    .array(z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(7)]))
    .min(1)
    .max(4)
    .transform((a) => [...new Set(a)].sort((a, b) => a - b)),
  enabled: z.boolean(),
  email: z.boolean(),
});
export type ReminderRule = z.infer<typeof reminderContentSchema> & {
  id: string;
  revision: number;
  userId: string;
  timelineOwner: string;
  grantId?: string;
};
export type ReminderRuleView = Omit<ReminderRule, 'userId' | 'timelineOwner' | 'grantId'> & {
  title: string;
  available: boolean;
};
export type EmailDelivery = 'none' | 'sending' | 'accepted' | 'failed' | 'unknown';
export type ReminderNotification = {
  id: string;
  ruleId: string;
  timelineOwner: string;
  occurrenceDate: string;
  offset: number;
  createdAt: string;
  revision: number;
  readAt?: string;
  emailDelivery: EmailDelivery;
  attemptedAt?: string;
};
export type NotificationView = {
  kind?: 'memory' | 'photo' | 'love-note' | 'invite' | 'accepted';
  target?: string;
  id: string;
  title: string;
  occurrenceDate: string;
  offset: number;
  createdAt: string;
  readAt?: string;
  emailDelivery: EmailDelivery;
};
export type NotificationList = { items: NotificationView[]; unread: number };
export function shiftCalendarDate(date: string, days: number) {
  dateString.parse(date);
  return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
export function localReminderClock(now: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: part('year') + '-' + part('month') + '-' + part('day'),
    hour: Number(part('hour')),
  };
}
