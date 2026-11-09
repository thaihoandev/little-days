import { extraDecorations, smallSymbols } from './extra-decorations.js';
import { vietnamDecorations } from './vietnam-decorations.js';
const art = (width: number, height: number, body: string) =>
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );
const tape = (color: string) =>
  art(
    240,
    70,
    `<path d="M5 4L235 0 229 12 238 22 231 34 237 47 230 58 236 68 2 65 9 52 2 39 8 28 1 16Z" fill="${color}" fill-opacity=".8"/><path d="M15 15H225M12 34H226M15 53H225" stroke="#fff" opacity=".2" stroke-dasharray="4 5"/>`,
  );
const paper = (color: string, grid = false) =>
  art(
    240,
    290,
    `<path d="M3 8L39 3 65 9 105 2 140 8 178 2 216 7 236 3 232 45 239 80 233 117 238 151 233 191 239 227 232 281 201 287 163 280 130 289 95 282 60 288 28 281 3 287 7 249 1 210 7 171 2 130 8 90Z" fill="${color}"/>${grid ? '<defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#9caa94" stroke-opacity=".3"/></pattern></defs><rect x="10" y="15" width="220" height="260" fill="url(#g)"/>' : '<path d="M28 56H213M28 91H213M28 126H213M28 161H213M28 196H213M28 231H213" stroke="#b6a386" stroke-opacity=".2"/>'}`,
  );
const sprig = (color: string) =>
  art(
    150,
    250,
    `<g fill="${color}" stroke="${color}" stroke-width="3"><path d="M78 242Q48 139 86 14" fill="none"/><path d="M72 191Q9 183 22 143Q69 143 72 191M64 147Q112 132 119 91Q71 91 64 147M69 103Q22 91 32 52Q76 59 69 103M78 58Q119 45 107 10Q78 18 78 58"/></g>`,
  );
const daisy = art(
  180,
  180,
  `<g fill="#fbf6e6" stroke="#d6c7a7" stroke-width="1.5">${Array.from({ length: 10 }, (_, i) => `<ellipse cx="90" cy="47" rx="15" ry="34" transform="rotate(${i * 36} 90 90)"/>`).join('')}</g><circle cx="90" cy="90" r="25" fill="#d8ad64"/><circle cx="83" cy="84" r="3" fill="#eac98e"/>`,
);
const heart = art(
  180,
  170,
  '<path d="M91 149C62 128 8 92 13 51C18 9 68 9 90 42C112 9 161 10 168 50C178 91 122 132 91 149Z" fill="#e9b9b1" stroke="#a96d66" stroke-width="4"/><path d="M30 53Q35 31 58 34" fill="none" stroke="#fff7e8" stroke-width="6" stroke-linecap="round"/>',
);
const seal = art(
  160,
  160,
  `<path d="M80 5L96 15 116 15 125 32 143 42 143 62 154 80 143 98 143 118 125 128 116 145 96 145 80 155 64 145 44 145 35 128 17 118 17 98 6 80 17 62 17 42 35 32 44 15 64 15Z" fill="#a95f60"/><circle cx="80" cy="80" r="54" fill="none" stroke="#d89b91" stroke-width="3"/><path d="M80 106Q40 80 53 65Q69 51 80 70Q94 51 107 65Q120 81 80 106" fill="#e8b8a8"/>`,
);
const stamp = art(
  170,
  210,
  '<path d="M7 7H163V203H7Z" fill="#fbf4df" stroke="#b49678" stroke-width="9" stroke-dasharray="8 9"/><rect x="24" y="25" width="122" height="135" fill="#a9baad"/><circle cx="111" cy="58" r="18" fill="#f3d59d"/><path d="M24 148L67 77 101 130 125 102 146 145V160H24Z" fill="#66816f"/><path d="M40 181H130" stroke="#a58d70" stroke-width="3"/>',
);
const ribbon = art(
  200,
  160,
  '<path d="M87 78L38 152 39 114 8 119 65 65M112 79L160 152 161 114 192 119 135 65" fill="#bd7f84"/><path d="M96 76Q1 117 8 40Q28 4 97 64M104 76Q199 117 192 40Q172 4 103 64" fill="#dfa3a6" stroke="#b7777e" stroke-width="3"/><ellipse cx="100" cy="72" rx="18" ry="23" fill="#b8757f"/>',
);
const stars = art(
  200,
  200,
  '<g fill="#d1aa67"><path d="M95 8L111 65 166 80 111 96 95 153 79 96 24 80 79 65Z"/><path d="M160 126L168 151 193 159 168 167 160 193 152 167 127 159 152 151Z"/><path d="M35 135L41 153 59 159 41 165 35 183 29 165 11 159 29 153Z"/></g>',
);
const woodenClip = art(
  70,
  140,
  '<path d="M22 6H48V50L44 80L48 134H38L35 88L32 134H22L26 80L22 50Z" fill="#c49a6c" stroke="#936d43" stroke-width="2"/><circle cx="35" cy="65" r="7" fill="#b0b5b3" stroke="#787e7c" stroke-width="2"/><path d="M25 61H45M25 69H45" stroke="#787e7c" stroke-width="2"/>',
);
const rope = art(
  300,
  40,
  '<path d="M2 20 C 50 14, 100 26, 150 18 C 200 12, 250 24, 298 18" stroke="#a3825a" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M2 20 C 50 14, 100 26, 150 18 C 200 12, 250 24, 298 18" stroke="#d5be9b" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="6 4"/>',
);
const photoboothLogo = art(
  200,
  70,
  '<rect x="4" y="4" width="192" height="62" rx="10" fill="#2d2d2d"/><text x="100" y="32" font-family="sans-serif" font-weight="900" font-size="16" fill="#fff" text-anchor="middle" letter-spacing="3">LIFE 4 CUTS</text><text x="100" y="52" font-family="sans-serif" font-weight="500" font-size="11" fill="#f0c2c2" text-anchor="middle" letter-spacing="1">♡ PHOTO STUDIO ♡</text>',
);
const boardingPass = art(
  280,
  120,
  '<rect x="4" y="4" width="272" height="112" rx="8" fill="#fdfbf7" stroke="#70877f" stroke-width="2"/><path d="M200 4V116" stroke="#9cb5ab" stroke-width="2" stroke-dasharray="4 4"/><circle cx="200" cy="4" r="9" fill="#e8dfd5"/><circle cx="200" cy="116" r="9" fill="#e8dfd5"/><text x="20" y="30" font-family="sans-serif" font-weight="bold" font-size="13" fill="#2d4a3e" letter-spacing="1">BOARDING PASS</text><text x="20" y="55" font-family="sans-serif" font-size="11" fill="#667f74">FROM: US  →  TO: FOREVER</text><text x="20" y="78" font-family="sans-serif" font-size="11" fill="#667f74">FLIGHT: LD-520 · SEAT: 01A</text><path d="M20 92H180" stroke="#70877f" stroke-width="2" stroke-linecap="round"/><path d="M215 28H265M215 36H265M215 44H265M215 52H265M215 60H265M215 68H265M215 76H265M215 84H265M215 92H265" stroke="#333" stroke-width="2" stroke-dasharray="2 3"/>',
);
const cinemaTicket = art(
  220,
  100,
  '<path d="M4 4H216V30C202 30 202 46 216 46V96H4V46C18 46 18 30 4 30Z" fill="#ffebd2" stroke="#d49a6a" stroke-width="2"/><line x1="68" y1="4" x2="68" y2="96" stroke="#d49a6a" stroke-width="2" stroke-dasharray="4 4"/><text x="36" y="55" font-family="sans-serif" font-size="10" font-weight="bold" fill="#b06d3b" transform="rotate(-90 36 55)" text-anchor="middle">CINEMA</text><text x="82" y="34" font-family="sans-serif" font-size="12" font-weight="bold" fill="#914d1b">BUỔI HẸN ĐẦU</text><text x="82" y="56" font-family="sans-serif" font-size="10" fill="#a86e44">HÀNG GHẾ: SWEETBOX</text><text x="82" y="78" font-family="sans-serif" font-size="10" fill="#a86e44">DATE: OUR SPECIAL DAY</text>',
);
export const decorationCatalog = [
  {
    id: 'tape-sand',
    name: 'Washi mật ong',
    collection: 'Giấy & washi',
    width: 240,
    height: 70,
    src: tape('#d6ba85'),
  },
  {
    id: 'tape-rose',
    name: 'Washi hồng phấn',
    collection: 'Giấy & washi',
    width: 240,
    height: 70,
    src: tape('#d9a6a1'),
  },
  {
    id: 'tape-sage',
    name: 'Washi xanh lá',
    collection: 'Giấy & washi',
    width: 240,
    height: 70,
    src: tape('#a7b792'),
  },
  {
    id: 'paper-cream',
    name: 'Giấy xé màu kem',
    collection: 'Giấy & washi',
    width: 240,
    height: 290,
    src: paper('#eee2c9'),
  },
  {
    id: 'paper-rose',
    name: 'Giấy xé hồng',
    collection: 'Giấy & washi',
    width: 240,
    height: 290,
    src: paper('#edd3cb'),
  },
  {
    id: 'paper-grid',
    name: 'Giấy ô vuông',
    collection: 'Giấy & washi',
    width: 240,
    height: 290,
    src: paper('#e4e9d7', true),
  },
  {
    id: 'leaf-sage',
    name: 'Nhành lá sage',
    collection: 'Khu vườn',
    width: 150,
    height: 250,
    src: sprig('#879d77'),
  },
  {
    id: 'leaf-olive',
    name: 'Nhành ô liu',
    collection: 'Khu vườn',
    width: 150,
    height: 250,
    src: sprig('#657b58'),
  },
  { id: 'daisy', name: 'Cúc nhỏ', collection: 'Khu vườn', width: 180, height: 180, src: daisy },
  {
    id: 'flower-rose',
    name: 'Hoa hồng giấy',
    collection: 'Khu vườn',
    width: 180,
    height: 180,
    src: daisy
      .replaceAll(encodeURIComponent('#fbf6e6'), encodeURIComponent('#dca4a7'))
      .replaceAll(encodeURIComponent('#d8ad64'), encodeURIComponent('#a77466')),
  },
  {
    id: 'heart-pink',
    name: 'Trái tim màu nước',
    collection: 'Lời thương',
    width: 180,
    height: 170,
    src: heart,
  },
  {
    id: 'wax-seal',
    name: 'Dấu sáp tình yêu',
    collection: 'Lời thương',
    width: 160,
    height: 160,
    src: seal,
  },
  {
    id: 'postage',
    name: 'Tem chuyến đi',
    collection: 'Chuyến đi',
    width: 170,
    height: 210,
    src: stamp,
  },
  {
    id: 'postmark',
    name: 'Dấu bưu điện',
    collection: 'Chuyến đi',
    width: 240,
    height: 120,
    src: art(
      240,
      120,
      '<g fill="none" stroke="#9d8873" stroke-width="3" opacity=".8"><circle cx="62" cy="60" r="50"/><circle cx="62" cy="60" r="42"/><path d="M110 25Q140 10 170 25T234 25M110 48Q140 33 170 48T234 48M110 71Q140 56 170 71T234 71M110 94Q140 79 170 94T234 94"/></g>',
    ),
  },
  {
    id: 'ticket',
    name: 'Vé hẹn hò',
    collection: 'Chuyến đi',
    width: 260,
    height: 110,
    src: art(
      260,
      110,
      '<path d="M8 8H252V35Q225 55 252 75V102H8V75Q35 55 8 35Z" fill="#d7dfcb" stroke="#97a889" stroke-width="2"/><path d="M74 13V97M186 13V97" stroke="#9eae8f" stroke-width="2" stroke-dasharray="4 5"/><path d="M126 30L134 47 153 49 139 63 142 82 126 73 109 82 112 63 98 49 118 47Z" fill="#8c9c77"/>',
    ),
  },
  {
    id: 'ribbon',
    name: 'Nơ lụa hồng',
    collection: 'Ngày đặc biệt',
    width: 200,
    height: 160,
    src: ribbon,
  },
  {
    id: 'stars-gold',
    name: 'Ánh sao vàng',
    collection: 'Ngày đặc biệt',
    width: 200,
    height: 200,
    src: stars,
  },
  {
    id: 'confetti',
    name: 'Confetti dịu dàng',
    collection: 'Ngày đặc biệt',
    width: 260,
    height: 200,
    src: art(
      260,
      200,
      '<g fill="none" stroke-width="7" stroke-linecap="round"><path d="M22 28L29 42M101 19L91 31M214 30L221 45M158 116L171 121" stroke="#c78d8c"/><path d="M60 93L51 107M232 135L224 146M88 174L101 181" stroke="#9aaf88"/><path d="M141 49L151 41M30 156L38 169M188 184L201 174" stroke="#d7b66f"/></g><g fill="#d5bb87"><circle cx="174" cy="25" r="5"/><circle cx="127" cy="145" r="5"/><circle cx="204" cy="87" r="4"/></g>',
    ),
  },
  {
    id: 'clip-wood',
    name: 'Kẹp gỗ mộc',
    collection: 'Giấy & washi',
    width: 70,
    height: 140,
    src: woodenClip,
  },
  {
    id: 'rope-rustic',
    name: 'Dây thừng hoài niệm',
    collection: 'Giấy & washi',
    width: 300,
    height: 40,
    src: rope,
  },
  {
    id: 'photobooth-paper',
    width: 350,
    height: 840,
    name: 'Giấy dải ảnh',
    collection: 'Những ngày nhỏ',
    src: art(
      350,
      840,
      '<rect x="1" y="1" width="348" height="838" rx="10" fill="#fffdf8" stroke="#ded8c9"/>',
    ),
  },
  {
    id: 'photobooth-logo',
    name: 'Logo Photobooth',
    collection: 'Chuyến đi',
    width: 200,
    height: 70,
    src: photoboothLogo,
  },
  {
    id: 'boarding-pass',
    name: 'Vé máy bay kỉ niệm',
    collection: 'Chuyến đi',
    width: 280,
    height: 120,
    src: boardingPass,
  },
  {
    id: 'ticket-cinema',
    name: 'Cuống vé xem phim',
    collection: 'Chuyến đi',
    width: 220,
    height: 100,
    src: cinemaTicket,
  },
  ...extraDecorations,
  ...vietnamDecorations,
  ...smallSymbols,
] as const;
export type DecorationId = (typeof decorationCatalog)[number]['id'];
export const decorationIds = decorationCatalog.map((d) => d.id) as [
  DecorationId,
  ...DecorationId[],
];
export const decoration = (id: string | undefined) => decorationCatalog.find((d) => d.id === id);
