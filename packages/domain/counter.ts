export const counterStyleIds = ['plain', 'card', 'ticket', 'seal', 'calendar'] as const;
export type CounterStyle = (typeof counterStyleIds)[number];
export const counterStyleNames: Record<CounterStyle, string> = {
  plain: 'Dòng chữ tối giản',
  card: 'Thẻ giấy',
  ticket: 'Vé bên nhau',
  seal: 'Dấu tròn',
  calendar: 'Tờ lịch',
};
export function counterAppearance(style: CounterStyle | undefined) {
  switch (style) {
    case 'card':
      return {
        fill: '#f1e9d8',
        stroke: '#d4c2a3',
        radius: 18,
        padding: 20,
        header: 0,
        dash: [] as number[],
      };
    case 'ticket':
      return {
        fill: '#e9efdf',
        stroke: '#a7b78e',
        radius: 6,
        padding: 18,
        header: 0,
        dash: [7, 5],
      };
    case 'seal':
      return {
        fill: '#f4e1da',
        stroke: '#c79685',
        radius: 1000,
        padding: 26,
        header: 0,
        dash: [3, 4],
      };
    case 'calendar':
      return {
        fill: '#fffaf0',
        stroke: '#d6c4a7',
        radius: 12,
        padding: 18,
        header: 22,
        dash: [] as number[],
      };
    default:
      return undefined;
  }
}
