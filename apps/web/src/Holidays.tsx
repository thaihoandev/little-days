import { useEffect, useState } from 'react';
import {
  Sparkles,
  Heart,
  Flower2,
  Flag,
  Gift,
  Moon,
  TreePine,
  Ghost,
  House,
  BookOpen,
  Leaf,
} from 'lucide-react';
import type { Holiday, HolidayIconName } from '../../../packages/domain/holidays.js';
import { api } from './api.js';
const icons = {
  sparkles: Sparkles,
  heart: Heart,
  flower: Flower2,
  flag: Flag,
  gift: Gift,
  moon: Moon,
  tree: TreePine,
  ghost: Ghost,
  home: House,
  book: BookOpen,
  leaf: Leaf,
};
export function HolidayIcon({ name, size = 16 }: { name: HolidayIconName; size?: number }) {
  const Icon = icons[name] || Sparkles;
  return <Icon size={size} aria-hidden="true" />;
}
const requests = new Map<number, Promise<Holiday[]>>();
function yearHolidays(year: number) {
  if (!requests.has(year)) {
    const promise = api<{ items: Holiday[] }>('/holidays?year=' + year)
      .then((r) => r.items)
      .catch((e) => {
        requests.delete(year);
        throw e;
      });
    requests.set(year, promise);
    if (requests.size > 8) requests.delete(requests.keys().next().value!);
  }
  return requests.get(year)!;
}
export function useHolidays(month: string, enabled: boolean) {
  const [items, setItems] = useState<Holiday[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const [year, m] = month.split('-').map(Number),
    years = [
      ...(m === 1 && year > 1900 ? [year - 1] : []),
      year,
      ...(m >= 10 && year < 2200 ? [year + 1] : []),
    ].join(',');
  useEffect(() => {
    let active = true;
    setError('');
    if (!enabled) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.all(years.split(',').map((y) => yearHolidays(Number(y))))
      .then((rows) => {
        if (active)
          setItems(
            rows.flat().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [years, enabled, attempt]);
  return { items, loading, error, retry: () => setAttempt((v) => v + 1) };
}
