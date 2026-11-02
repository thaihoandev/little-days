export type HolidayIconName =
  | 'sparkles'
  | 'heart'
  | 'flower'
  | 'flag'
  | 'gift'
  | 'moon'
  | 'tree'
  | 'ghost'
  | 'home'
  | 'book'
  | 'leaf';
export type Holiday = {
  id: string;
  key: string;
  date: string;
  title: string;
  icon: HolidayIconName;
  category: 'holiday' | 'traditional' | 'occasion';
  hint: string;
};
export const holidayCategoryNames = {
  holiday: 'Ngày lễ',
  traditional: 'Dịp truyền thống',
  occasion: 'Dịp kỷ niệm',
};
