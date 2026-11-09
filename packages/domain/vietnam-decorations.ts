import { vietnamWashiPaths } from './vietnam-washi.js';
const doodle = (body: string) =>
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><g stroke="#775c4d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`,
  );
const designs = [
  [
    'vn-iced-coffee',
    'Cà phê sữa đá',
    '<path d="M48 45H152L138 179H62Z" fill="#ad7751"/><path d="M59 135H142L138 179H62Z" fill="#f2d2a0"/><path d="M113 68L140 12" fill="none"/><g fill="#e5f2ef" opacity=".8"><rect x="66" y="63" width="25" height="25" rx="5"/><rect x="105" y="83" width="25" height="25" rx="5"/></g>',
  ],
  [
    'vn-bubble-tea',
    'Trà sữa trân châu',
    '<path d="M47 49H153L136 177H64Z" fill="#e8c8a5"/><path d="M43 48H157M110 68L133 12" fill="none"/><g fill="#584338"><circle cx="78" cy="149" r="9"/><circle cx="101" cy="159" r="9"/><circle cx="125" cy="145" r="9"/><circle cx="103" cy="133" r="9"/></g>',
  ],
  [
    'vn-scooter',
    'Chở nhau qua phố',
    '<g fill="#e8bcc3"><circle cx="47" cy="157" r="24" fill="#fff8e7"/><circle cx="151" cy="157" r="24" fill="#fff8e7"/><path d="M41 143L66 108H116L140 64H160L148 143H97L78 126L64 143Z"/><path d="M132 65L125 47H144" fill="none"/><circle cx="101" cy="43" r="17" fill="#e4c8a6"/><circle cx="62" cy="52" r="15" fill="#e4c8a6"/><path d="M92 64L119 100H76L61 74M61 74L47 105" fill="none" stroke-width="12"/></g>',
  ],
  [
    'vn-conical-hat',
    'Nón lá',
    '<path d="M16 142L101 30L184 142Q103 186 16 142Z" fill="#f4dfab"/><path d="M16 142Q100 112 184 142M101 30L68 133M101 30L134 133" fill="none"/><path d="M66 153Q96 195 139 153" fill="none" stroke="#c78394" stroke-width="8"/>',
  ],
  [
    'vn-lotus',
    'Sen hồng',
    '<path d="M100 179V126" fill="none" stroke="#879b70" stroke-width="8"/><path d="M100 140Q25 136 22 76Q79 70 100 124Q124 67 180 76Q174 139 100 140Z" fill="#dca6b5"/><path d="M100 137Q52 88 100 21Q149 88 100 137Z" fill="#efc5cd"/>',
  ],
] as const;
export const vietnamDecorations = [
  ...designs.map(([id, name, body]) => ({
    id,
    name,
    collection: 'Đời thường Việt',
    width: 200,
    height: 200,
    src: doodle(body),
  })),
  ...(
    ['Lần đầu gặp', 'Hôm nay trời đẹp', 'Ăn sập phố xá', 'Giận hờn vu vơ', 'Mãi bên nhau'] as const
  ).map((name, index) => ({
    id: `vn-washi-${index + 1}`,
    name,
    collection: 'Washi lời thương',
    width: 300,
    height: 80,
    src:
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80" viewBox="0 0 300 80"><path d="M7 6L291 2 284 19 296 36 286 52 293 75 3 77 11 59 2 42 12 25Z" fill="${['#ead1c8', '#dce3cc', '#f0dfb2', '#dfd5e9', '#e8c8d2'][index]}"/><path d="M18 13H280M18 66H279" stroke="#fff" stroke-dasharray="4 5"/>${vietnamWashiPaths[index]}</svg>`,
      ),
  })),
] as const;
