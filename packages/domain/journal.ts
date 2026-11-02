import { z } from 'zod';
import { dateString, nextAnnual, type Asset } from './index.js';
export const locationSchema = z.object({
  label: z.string().trim().max(200),
  latitude: z.number().finite().min(-85).max(85),
  longitude: z.number().finite().min(-180).max(180),
});
export type MilestoneLocation = z.infer<typeof locationSchema>;
export const journalContentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  date: dateString,
  note: z.string().max(5000),
  kind: z.enum(['memory', 'anniversary', 'plan', 'note']),
  annual: z.boolean(),
  location: locationSchema.nullable().optional(),
});
export type JournalContent = z.infer<typeof journalContentSchema>;
export const timelineHeadingSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600),
});
export const defaultTimelineHeading = {
  title: 'Dòng thời gian của mình.',
  description: 'Kỉ niệm có ảnh, lời nhắn có ngày. Những điều quan trọng luôn ở đây.',
  revision: -1,
};
export type TimelineHeading = z.infer<typeof timelineHeadingSchema> & { revision: number };
export type JournalEntry = JournalContent & {
  deletedAt?: string;
  timelineId?: string;
  timelineLabel?: string;
  calendarVisible?: boolean;
  timelineAvatarUrl?: string;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  assets: Asset[];
};
export type JournalVersion = {
  id: string;
  entryId: string;
  actorId: string;
  action: string;
  createdAt: string;
  snapshot: JournalEntry;
  actorName?: string;
};
export type JournalComment = {
  id: string;
  entryId: string;
  timelineOwner: string;
  actorId: string;
  text: string;
  createdAt: string;
  displayName?: string;
  avatarUrl?: string;
  canDelete?: boolean;
};
export type JournalReaction = {
  id: string;
  entryId: string;
  timelineOwner: string;
  actorId: string;
  emoji: string;
};
export type TimelineGrant = {
  ownerAvatarUrl?: string;
  memberAvatarUrl?: string;
  id: string;
  timelineOwner: string;
  memberId: string;
  ownerLabel: string;
  memberLabel: string;
  state: 'pending' | 'active';
  showOnCalendar: boolean;
  revision: number;
  createdAt: string;
};
export type TimelineSharingState = { ownId: string; grants: TimelineGrant[] };
export function occursOn(entry: Pick<JournalContent, 'date' | 'annual'>, date: string) {
  return entry.annual ? nextAnnual(entry.date, date).date === date : entry.date === date;
}
export function nextOccurrence(entry: Pick<JournalContent, 'date' | 'annual'>, today: string) {
  return entry.annual
    ? nextAnnual(entry.date, today).date
    : entry.date >= today
      ? entry.date
      : null;
}
export function monthDays(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1)),
    offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) =>
    new Date(Date.UTC(year, month, 1 - offset + i)).toISOString().slice(0, 10),
  );
}
export const journalKindNames = {
  memory: 'Kỉ niệm',
  anniversary: 'Ngày quan trọng',
  plan: 'Hẹn cùng nhau',
  note: 'Ghi chú',
} as const;
export function memoriesOnThisDay<T extends Pick<JournalEntry, 'date' | 'kind' | 'deletedAt'>>(
  entries: T[],
  today: string,
) {
  return entries
    .filter(
      (entry) =>
        !entry.deletedAt &&
        entry.kind !== 'plan' &&
        entry.date < today &&
        entry.date.slice(5) === today.slice(5),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}
