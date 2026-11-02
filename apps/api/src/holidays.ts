import { CalendarVietnamese } from 'date-chinese';
import { z } from 'zod';
import type { Holiday, HolidayIconName } from '../../../packages/domain/holidays.js';
import { shiftCalendarDate } from '../../../packages/domain/reminders.js';
type Definition = {
  key: string;
  month: number;
  day: number;
  title: string;
  icon: HolidayIconName;
  category: Holiday['category'];
  hint: string;
};
const solar: Definition[] = [
  {
    key: 'new-year',
    month: 1,
    day: 1,
    title: 'Tết Dương lịch',
    icon: 'sparkles',
    category: 'holiday',
    hint: 'Dành một khoảng thời gian cho kế hoạch năm mới.',
  },
  {
    key: 'valentine',
    month: 2,
    day: 14,
    title: 'Valentine',
    icon: 'heart',
    category: 'occasion',
    hint: 'Chuẩn bị một lời nhắn, món quà hoặc cuộc hẹn.',
  },
  {
    key: 'women-day',
    month: 3,
    day: 8,
    title: 'Ngày Quốc tế Phụ nữ',
    icon: 'flower',
    category: 'occasion',
    hint: 'Gửi lời yêu thương đến những người phụ nữ quan trọng.',
  },
  {
    key: 'reunification',
    month: 4,
    day: 30,
    title: 'Ngày Giải phóng miền Nam',
    icon: 'flag',
    category: 'holiday',
    hint: 'Lên kế hoạch nghỉ ngơi hoặc một chuyến đi cùng nhau.',
  },
  {
    key: 'labour',
    month: 5,
    day: 1,
    title: 'Ngày Quốc tế Lao động',
    icon: 'leaf',
    category: 'holiday',
    hint: 'Dành thời gian nghỉ ngơi và làm điều hai bạn thích.',
  },
  {
    key: 'children',
    month: 6,
    day: 1,
    title: 'Ngày Quốc tế Thiếu nhi',
    icon: 'gift',
    category: 'occasion',
    hint: 'Chuẩn bị một hoạt động nhỏ cho gia đình.',
  },
  {
    key: 'family',
    month: 6,
    day: 28,
    title: 'Ngày Gia đình Việt Nam',
    icon: 'home',
    category: 'occasion',
    hint: 'Giữ một buổi dành riêng cho người thân.',
  },
  {
    key: 'national',
    month: 9,
    day: 2,
    title: 'Quốc khánh Việt Nam',
    icon: 'flag',
    category: 'holiday',
    hint: 'Có thể chuẩn bị kế hoạch gặp gỡ hoặc du lịch từ sớm.',
  },
  {
    key: 'vietnam-women',
    month: 10,
    day: 20,
    title: 'Ngày Phụ nữ Việt Nam',
    icon: 'flower',
    category: 'occasion',
    hint: 'Một lời cảm ơn hoặc bất ngờ nhỏ cho người thương.',
  },
  {
    key: 'halloween',
    month: 10,
    day: 31,
    title: 'Halloween',
    icon: 'ghost',
    category: 'occasion',
    hint: 'Thử một buổi hóa trang hoặc một bộ ảnh vui.',
  },
  {
    key: 'teachers',
    month: 11,
    day: 20,
    title: 'Ngày Nhà giáo Việt Nam',
    icon: 'book',
    category: 'occasion',
    hint: 'Chuẩn bị lời tri ân dành cho thầy cô.',
  },
  {
    key: 'christmas-eve',
    month: 12,
    day: 24,
    title: 'Đêm Giáng sinh',
    icon: 'tree',
    category: 'occasion',
    hint: 'Hẹn nhau đi dạo, ăn tối hoặc chụp một bộ ảnh.',
  },
  {
    key: 'christmas',
    month: 12,
    day: 25,
    title: 'Giáng sinh',
    icon: 'gift',
    category: 'occasion',
    hint: 'Dành một món quà và thời gian cho người thương.',
  },
  {
    key: 'year-end',
    month: 12,
    day: 31,
    title: 'Đêm cuối năm',
    icon: 'sparkles',
    category: 'occasion',
    hint: 'Nhìn lại những kỉ niệm của năm và đón năm mới.',
  },
];
const lunar: Definition[] = [
  {
    key: 'tet',
    month: 1,
    day: 1,
    title: 'Tết Nguyên đán',
    icon: 'flower',
    category: 'holiday',
    hint: 'Chuẩn bị quà Tết, lịch về nhà và những cuộc hẹn đầu năm.',
  },
  {
    key: 'tet-2',
    month: 1,
    day: 2,
    title: 'Mùng 2 Tết',
    icon: 'home',
    category: 'traditional',
    hint: 'Dành thời gian thăm hỏi người thân.',
  },
  {
    key: 'tet-3',
    month: 1,
    day: 3,
    title: 'Mùng 3 Tết',
    icon: 'flower',
    category: 'traditional',
    hint: 'Giữ lại một khoảnh khắc đầu xuân.',
  },
  {
    key: 'first-full-moon',
    month: 1,
    day: 15,
    title: 'Rằm tháng Giêng',
    icon: 'moon',
    category: 'traditional',
    hint: 'Chuẩn bị một ngày sum họp cùng gia đình.',
  },
  {
    key: 'hung-kings',
    month: 3,
    day: 10,
    title: 'Giỗ Tổ Hùng Vương',
    icon: 'flag',
    category: 'holiday',
    hint: 'Có thể sắp xếp thời gian nghỉ ngơi cùng người thân.',
  },
  {
    key: 'doan-ngo',
    month: 5,
    day: 5,
    title: 'Tết Đoan Ngọ',
    icon: 'leaf',
    category: 'traditional',
    hint: 'Cùng chuẩn bị một bữa ăn theo nếp nhà.',
  },
  {
    key: 'that-tich',
    month: 7,
    day: 7,
    title: 'Thất Tịch',
    icon: 'heart',
    category: 'traditional',
    hint: 'Dành một cuộc hẹn nhỏ cho hai bạn.',
  },
  {
    key: 'vu-lan',
    month: 7,
    day: 15,
    title: 'Lễ Vu Lan',
    icon: 'flower',
    category: 'traditional',
    hint: 'Gửi lời yêu thương và dành thời gian cho cha mẹ.',
  },
  {
    key: 'mid-autumn',
    month: 8,
    day: 15,
    title: 'Tết Trung thu',
    icon: 'moon',
    category: 'traditional',
    hint: 'Chuẩn bị bánh, trà và một buổi tối bên nhau.',
  },
  {
    key: 'kitchen-gods',
    month: 12,
    day: 23,
    title: 'Ông Công Ông Táo',
    icon: 'home',
    category: 'traditional',
    hint: 'Bắt đầu chuẩn bị và sắp xếp lịch đón Tết.',
  },
];
const cache = new Map<number, Holiday[]>();
export function holidaysForYear(raw: unknown): Holiday[] {
  const year = z.coerce.number().int().min(1900).max(2200).parse(raw);
  const cached = cache.get(year);
  if (cached) return cached;
  const items: Holiday[] = [];
  const add = (definition: Definition, date: string) => {
    if (date.startsWith(year + '-'))
      items.push({
        id: date + ':' + definition.key,
        key: definition.key,
        date,
        title: definition.title,
        icon: definition.icon,
        category: definition.category,
        hint: definition.hint,
      });
  };
  for (const definition of solar)
    add(
      definition,
      `${year}-${String(definition.month).padStart(2, '0')}-${String(definition.day).padStart(2, '0')}`,
    );
  for (const lunarYear of [year - 1, year]) {
    const cal = new CalendarVietnamese().fromGregorian(lunarYear, 7, 1),
      [cycle, cycleYear] = cal.get();
    for (const definition of lunar) {
      const g = cal
        .set([cycle, cycleYear, definition.month, 0, definition.day])
        .toGregorian(lunarYear);
      const date = `${g.year}-${String(g.month).padStart(2, '0')}-${String(g.day).padStart(2, '0')}`;
      add(definition, date);
      if (definition.key === 'tet' && date.startsWith(year + '-'))
        add(
          {
            ...definition,
            key: 'tet-eve',
            title: 'Giao thừa Tết Nguyên đán',
            category: 'traditional',
            icon: 'sparkles',
          },
          shiftCalendarDate(date, -1),
        );
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  cache.set(year, items);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return items;
}
