import type { Page } from './index.js';
export const paperPalettes = [
  { name: 'Giấy kem', paper: '#f8f1e5', ink: '#655345', accent: '#a85b45' },
  { name: 'Đào hoàng hôn', paper: '#ffc5a1', ink: '#70343b', accent: '#b83c48' },
  { name: 'Tím mộng mơ', paper: '#d9ccff', ink: '#503b80', accent: '#8b4696' },
  { name: 'Xanh đại dương', paper: '#a7e4ed', ink: '#095767', accent: '#196e9b' },
  { name: 'Bầu trời đêm', paper: '#192c50', ink: '#fff0bf', accent: '#ffc96e' },
  { name: 'Hồng kẹo', paper: '#ffb8d0', ink: '#702746', accent: '#ae3268' },
  { name: 'Vàng pop', paper: '#ffda53', ink: '#5a343e', accent: '#a73367' },
  { name: 'Vườn xanh', paper: '#cfe7bb', ink: '#34573b', accent: '#756238' },
] as const;
export function recolorPage(page: Page, palette: (typeof paperPalettes)[number]): Page {
  return {
    ...page,
    background: palette.paper,
    elements: page.elements.map((e) =>
      e.type === 'text' ||
      (e.type === 'sticker' && !e.decorationId) ||
      (e.type === 'anniversary' && (!e.counterStyle || e.counterStyle === 'plain'))
        ? {
            ...e,
            color:
              e.type === 'sticker'
                ? palette.accent
                : page.elements.some(
                      (p) =>
                        p.decorationId?.startsWith('paper-') &&
                        p.x <= e.x + e.width / 2 &&
                        p.x + p.width >= e.x + e.width / 2 &&
                        p.y <= e.y + e.height / 2 &&
                        p.y + p.height >= e.y + e.height / 2,
                    )
                  ? '#514534'
                  : palette.ink,
          }
        : e,
    ),
  };
}
