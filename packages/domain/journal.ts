import { z } from 'zod';
import { dateString, nextAnnual, type Asset } from './index.js';
export const journalContentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  date: dateString,
  note: z.string().max(5000),
  kind: z.enum(['memory', 'anniversary', 'plan', 'note']),
  annual: z.boolean(),
});
export type JournalContent = z.infer<typeof journalContentSchema>;
export type JournalEntry = JournalContent & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  assets: Asset[];
};
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
