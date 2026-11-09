import { weekStartFor, shiftDate } from './weekly-recap.js';
export type RhythmDay = {
  date: string;
  state: 'empty' | 'started' | 'together' | 'future';
  contributors?: number;
};
export type RhythmView = {
  spaceId: string;
  today: string;
  weekStart: string;
  memberCount: number;
  completedDays: number;
  activeDays: number;
  streak: number;
  streakCapped: boolean;
  myToday: boolean;
  togetherToday: boolean;
  days: RhythmDay[];
  memberDays?: number;
  weeklyCapacity?: number;
  generatedAt?: string;
};
/** One contribution per member/day. Opening the app, retries and autosaves do not create contributions. */
export function summarizeRhythm(
  spaceId: string,
  today: string,
  members: string[],
  actor: string,
  activity: { date: string; author: string }[],
): RhythmView {
  const start = weekStartFor(today),
    byDay = new Map<string, Set<string>>();
  for (const a of activity) {
    if (!members.includes(a.author) || a.date > today || a.date < shiftDate(today, -59)) continue;
    const set = byDay.get(a.date) || new Set<string>();
    set.add(a.author);
    byDay.set(a.date, set);
  }
  const complete = (date: string) => members.length > 1 && byDay.get(date)?.size === members.length;
  let streak = 0,
    day = complete(today) ? today : shiftDate(today, -1);
  while (streak < 60 && complete(day)) {
    streak++;
    day = shiftDate(day, -1);
  }
  const days: RhythmDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(start, i);
    return {
      date,
      contributors: date > today ? 0 : byDay.get(date)?.size || 0,
      state:
        date > today
          ? 'future'
          : complete(date)
            ? 'together'
            : byDay.has(date)
              ? 'started'
              : 'empty',
    };
  });
  return {
    spaceId,
    today,
    weekStart: start,
    memberCount: members.length,
    memberDays: days.reduce((sum, d) => sum + (d.contributors || 0), 0),
    weeklyCapacity: members.length * 7,
    completedDays: days.filter((d) => d.state === 'together').length,
    activeDays: days.filter((d) => ['started', 'together'].includes(d.state)).length,
    streak,
    streakCapped: streak === 60,
    myToday: byDay.get(today)?.has(actor) || false,
    togetherToday: complete(today),
    days,
  };
}
