export const counterStyleIds = [
  'plain',
  'card',
  'ticket',
  'seal',
  'calendar',
  'postcard',
  'midnight',
  'stamp',
  'notebook',
  'ribbon',
] as const;
export type CounterStyle = (typeof counterStyleIds)[number];
// Self-contained vector accents, shared by canvas, viewer and video.
export function counterMotif(
  style: CounterStyle | undefined,
  width: number,
  height: number,
  accent: string,
) {
  if (!style || !['postcard', 'midnight', 'stamp', 'notebook', 'ribbon'].includes(style)) return;
  const w = Math.max(1, width),
    h = Math.max(1, height);
  const body =
    style === 'midnight'
      ? `<path d="M25 19v12m-6-6h12M${w - 28} ${h - 34}v12m-6-6h12"/><circle cx="${w - 44}" cy="25" r="3"/><circle cx="38" cy="${h - 24}" r="2"/><path d="M${w - 24} 18q-12 7 0 14q-19 0-14-13q5-9 14-1Z" fill="${accent}"/>`
      : style === 'postcard'
        ? `<rect x="${w - 48}" y="16" width="28" height="31" stroke-dasharray="3 3"/><path d="M18 ${h - 18}h52m-52-6h34M${w - 44} 35l9-12 9 12Z"/>`
        : style === 'stamp'
          ? `<rect x="10" y="10" width="${Math.max(1, w - 20)}" height="${Math.max(1, h - 20)}" rx="2" stroke-dasharray="2 4"/><path d="M22 22h15m-15 0v15M${w - 22} ${h - 22}h-15m15 0v-15"/>`
          : style === 'notebook'
            ? `<path d="M34 20v${Math.max(0, h - 30)}"/>` +
              [0.36, 0.54, 0.72, 0.9]
                .map((y) => `<path d="M12 ${h * y}H${w - 12}" opacity=".28"/>`)
                .join('') +
              [24, 50, 76]
                .filter((y) => y < h - 10)
                .map((y) => `<circle cx="17" cy="${y}" r="3"/>`)
                .join('')
            : `<path d="M17 9v28l14-8 14 8V9" fill="${accent}"/><path d="M${w - 45} ${h - 18}h25m-12-6v12"/>`;
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g stroke="${accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none">${body}</g></svg>`,
    )
  );
}
export const counterStyleNames: Record<CounterStyle, string> = {
  plain: 'Dòng chữ tối giản',
  card: 'Thẻ giấy',
  ticket: 'Vé bên nhau',
  seal: 'Dấu tròn',
  calendar: 'Tờ lịch',
  postcard: 'Bưu thiếp',
  midnight: 'Bầu trời đêm',
  stamp: 'Tem kỉ niệm',
  notebook: 'Trang vở',
  ribbon: 'Dải ruy băng',
};
function counterBase(style: CounterStyle | undefined) {
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
      return style === 'postcard'
        ? {
            fill: '#f8ead8',
            stroke: '#c4a282',
            radius: 5,
            padding: 23,
            header: 6,
            dash: [] as number[],
          }
        : style === 'midnight'
          ? { fill: '#334452', stroke: '#d7ba78', radius: 24, padding: 22, header: 0, dash: [2, 5] }
          : style === 'stamp'
            ? {
                fill: '#e9dfed',
                stroke: '#aa8dae',
                radius: 4,
                padding: 24,
                header: 0,
                dash: [4, 7],
              }
            : style === 'notebook'
              ? {
                  fill: '#e6efed',
                  stroke: '#95b1ad',
                  radius: 8,
                  padding: 18,
                  header: 14,
                  dash: [] as number[],
                }
              : style === 'ribbon'
                ? {
                    fill: '#f3e0df',
                    stroke: '#c28c8b',
                    radius: 5,
                    padding: 18,
                    header: 28,
                    dash: [] as number[],
                  }
                : undefined;
  }
}
export function counterAppearance(
  style: CounterStyle | undefined,
  colors?: { counterFill?: string; counterStroke?: string; counterAccent?: string },
) {
  const base = counterBase(style);
  return base
    ? {
        ...base,
        fill: colors?.counterFill || base.fill,
        stroke: colors?.counterStroke || base.stroke,
        accent: colors?.counterAccent || '#ad7b6b',
      }
    : undefined;
}
export const counterThemes = [
  {
    id: 'rose',
    name: 'Hồng phấn',
    fill: '#f3e0df',
    stroke: '#c28c8b',
    accent: '#b1787b',
    color: '#854f56',
  },
  {
    id: 'sage',
    name: 'Vườn xanh',
    fill: '#e7edda',
    stroke: '#9aaf83',
    accent: '#7e946a',
    color: '#566b45',
  },
  {
    id: 'lavender',
    name: 'Tím mây',
    fill: '#e9dfed',
    stroke: '#aa8dae',
    accent: '#997caa',
    color: '#755e86',
  },
  {
    id: 'sky',
    name: 'Xanh trời',
    fill: '#e1edf0',
    stroke: '#91acb8',
    accent: '#7294a5',
    color: '#4e7185',
  },
  {
    id: 'lemon',
    name: 'Vàng nắng',
    fill: '#f7edcc',
    stroke: '#c5b27b',
    accent: '#c7a45d',
    color: '#8c713d',
  },
  {
    id: 'coffee',
    name: 'Cà phê',
    fill: '#ecdfd0',
    stroke: '#b3987c',
    accent: '#a7856a',
    color: '#775a43',
  },
  {
    id: 'night',
    name: 'Đêm sao',
    fill: '#334452',
    stroke: '#d7ba78',
    accent: '#bb9863',
    color: '#f4e7c6',
  },
  {
    id: 'ink',
    name: 'Giấy & mực',
    fill: '#f4f0e6',
    stroke: '#858780',
    accent: '#666e66',
    color: '#414b45',
  },
] as const;
