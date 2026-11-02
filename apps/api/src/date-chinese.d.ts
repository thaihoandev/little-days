// date-chinese 2.1.4 ships declarations but omits a types entry in its exports map.
declare module 'date-chinese' {
  export class CalendarVietnamese {
    fromGregorian(year: number, month: number, day: number): this;
    get(): [number, number, number, boolean, number];
    set(date: [number, number, number, number | boolean, number]): this;
    toGregorian(year?: number): { year: number; month: number; day: number };
  }
}
