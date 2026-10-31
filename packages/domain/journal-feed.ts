import type { JournalEntry } from './journal.js';
export function groupJournalDays<
  T extends Pick<JournalEntry, 'id' | 'date' | 'kind' | 'createdAt'> & {
    album?: unknown;
    occurrenceDate?: string;
  },
>(entries: T[]) {
  const groups = new Map<string, T[]>(),
    order = { anniversary: 1, memory: 2, plan: 3, note: 4 };
  for (const entry of entries) {
    const date = entry.occurrenceDate || entry.date;
    const group = groups.get(date);
    if (group) group.push(entry);
    else groups.set(date, [entry]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      items: items.sort(
        (a, b) =>
          (a.album && a.id.startsWith('start-') ? 0 : order[a.kind]) -
            (b.album && b.id.startsWith('start-') ? 0 : order[b.kind]) ||
          b.createdAt.localeCompare(a.createdAt),
      ),
    }));
}
