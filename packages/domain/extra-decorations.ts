const svg = (w: number, h: number, body: string) =>
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  );
const pieces = [
  [
    'coffee-cup',
    'Cốc cà phê',
    'Một buổi cà phê',
    '<path d="M43 70H145V119Q145 165 94 165Q43 165 43 119Z" fill="#dcbfa4"/><path d="M145 83H161Q185 106 148 126" fill="none" stroke="#a58065" stroke-width="12"/><ellipse cx="94" cy="70" rx="51" ry="11" fill="#72523e"/><path d="M68 39Q48 20 68 7M100 39Q80 20 100 7M132 39Q112 20 132 7" fill="none" stroke="#c9b6a2" stroke-width="5"/><ellipse cx="100" cy="180" rx="77" ry="8" fill="#e6d8bc"/>',
  ],
  [
    'tea-pot',
    'Ấm trà chiều',
    'Một buổi cà phê',
    '<path d="M39 92Q45 47 100 47Q155 47 164 99L188 60 180 136 152 147Q96 181 43 142Z" fill="#a5b49a"/><path d="M43 77Q-12 71 12 124L43 130" fill="none" stroke="#6f8366" stroke-width="12"/><path d="M55 49H143L128 30H74Z" fill="#6f8366"/><circle cx="100" cy="27" r="10" fill="#b08c6d"/>',
  ],
  [
    'croissant',
    'Bánh buổi sáng',
    'Một buổi cà phê',
    '<path d="M17 144Q0 64 71 35L100 66 130 35Q201 65 184 144L140 126Q99 160 59 126Z" fill="#dbac67" stroke="#ad804b" stroke-width="5"/><path d="M71 35L58 126M130 35L141 126M100 66V144" stroke="#f4d7a1" stroke-width="9"/>',
  ],
  [
    'camera',
    'Máy ảnh phim',
    'Chuyến đi của mình',
    '<rect x="15" y="56" width="170" height="117" rx="15" fill="#8b9e8c"/><path d="M52 56L66 33H132L146 56" fill="#647867"/><circle cx="100" cy="114" r="46" fill="#f1e4ce"/><circle cx="100" cy="114" r="33" fill="#667883"/><circle cx="90" cy="104" r="13" fill="#a8bdc3"/><rect x="150" y="71" width="20" height="14" rx="3" fill="#e3c486"/>',
  ],
  [
    'suitcase',
    'Vali nhỏ',
    'Chuyến đi của mình',
    '<rect x="27" y="50" width="146" height="130" rx="15" fill="#c79879"/><path d="M72 51V25H128V51" fill="none" stroke="#80634d" stroke-width="10"/><path d="M58 52V177M142 52V177" stroke="#f3dec2" stroke-width="12"/><rect x="87" y="96" width="26" height="26" rx="5" fill="#8b9c78"/>',
  ],
  [
    'mountains',
    'Dãy núi xa',
    'Chuyến đi của mình',
    '<circle cx="151" cy="49" r="25" fill="#e1bf77"/><path d="M4 178L71 48 119 113 146 78 198 178Z" fill="#829c89"/><path d="M39 111L71 48 105 94 82 85 70 103 59 85Z" fill="#f0ead9"/><path d="M4 178L73 130 128 178" fill="#b4c3a2"/>',
  ],
  [
    'shell',
    'Vỏ sò bên biển',
    'Biển & nắng',
    '<path d="M100 177Q-8 116 23 57Q43 22 72 45Q100 5 128 45Q159 22 178 57Q209 117 100 177Z" fill="#e9c7b7" stroke="#be9588" stroke-width="4"/><path d="M100 177L72 45M100 177L128 45M100 177L23 57M100 177L178 57" fill="none" stroke="#be9588" stroke-width="3"/>',
  ],
  [
    'waves',
    'Sóng vỗ',
    'Biển & nắng',
    '<path d="M8 73Q37 43 68 73T128 73T188 73M8 111Q37 81 68 111T128 111T188 111M8 149Q37 119 68 149T128 149T188 149" fill="none" stroke="#83a7af" stroke-width="11" stroke-linecap="round"/><circle cx="148" cy="35" r="20" fill="#e7c67c"/>',
  ],
  [
    'sailboat',
    'Thuyền buồm',
    'Biển & nắng',
    '<path d="M98 22V139H28ZM110 52L177 139H110Z" fill="#efdfba" stroke="#b59773" stroke-width="4"/><path d="M17 150H185L158 183H48Z" fill="#a47b63"/><path d="M10 190Q55 178 98 190T190 190" fill="none" stroke="#8eafb3" stroke-width="6"/>',
  ],
  [
    'rainbow',
    'Cầu vồng dịu',
    'Mây trời',
    '<path d="M25 145V109A75 75 0 0 1 175 109V145" fill="none" stroke="#c58c83" stroke-width="20"/><path d="M48 145V109A52 52 0 0 1 152 109V145" fill="none" stroke="#d6b77e" stroke-width="17"/><path d="M70 145V109A30 30 0 0 1 130 109V145" fill="none" stroke="#8ca08a" stroke-width="16"/>',
  ],
  [
    'moon-cloud',
    'Trăng và mây',
    'Mây trời',
    '<path d="M140 15Q78 22 96 88Q113 137 175 115Q153 165 100 150Q26 131 42 68Q59 7 140 15Z" fill="#dfc58e"/><path d="M34 168Q7 135 41 120Q54 89 85 112Q121 104 133 132Q180 143 153 171Z" fill="#eee9df"/>',
  ],
  [
    'sunrise',
    'Nắng mới',
    'Mây trời',
    '<circle cx="100" cy="105" r="45" fill="#e1b47c"/><path d="M100 16V37M37 43L52 58M16 105H36M163 43L148 58M164 105H185" stroke="#c99b65" stroke-width="6" stroke-linecap="round"/><path d="M22 151H178M40 172H160" stroke="#8ea08a" stroke-width="7" stroke-linecap="round"/>',
  ],
  [
    'envelope',
    'Thư gửi người thương',
    'Hộp thư thương',
    '<rect x="14" y="56" width="172" height="119" rx="6" fill="#e6d3af"/><path d="M14 56L100 122 186 56M14 175L74 112M186 175L126 112" fill="none" stroke="#b99d77" stroke-width="4"/><path d="M100 143Q70 122 84 112Q94 105 100 118Q109 105 119 112Q130 123 100 143" fill="#b97476"/>',
  ],
  [
    'ribbon-tag',
    'Thẻ gửi thương',
    'Hộp thư thương',
    '<path d="M48 26H151L185 72V183H15V72Z" fill="#ecddc3" stroke="#c5ac83" stroke-width="3"/><circle cx="100" cy="57" r="10" fill="#fffaf0"/><path d="M100 47Q28 -5 44 30Q62 56 100 47Q169 -5 158 29Q137 57 100 47" fill="none" stroke="#c28a88" stroke-width="8"/><path d="M45 113H155M45 141H133" stroke="#b6b99b" stroke-width="5"/>',
  ],
  [
    'postmark-strokes',
    'Dấu bưu điện',
    'Hộp thư thương',
    '<g fill="none" stroke="#9b8478" stroke-width="3"><circle cx="76" cy="100" r="55"/><circle cx="76" cy="100" r="43"/><path d="M99 61Q124 49 146 61T194 61M103 84Q129 72 151 84T197 84M103 108Q129 96 151 108T197 108M99 132Q125 120 147 132T194 132"/></g><path d="M75 121Q43 96 57 85Q68 77 75 91Q85 77 96 85Q107 97 75 121" fill="#bd8d87"/>',
  ],
  [
    'tulips',
    'Bó tulip',
    'Vườn nhỏ',
    '<path d="M100 190V70M100 153L48 109M100 133L154 89" stroke="#78926f" stroke-width="7" fill="none"/><path d="M74 30L87 46 100 24 113 46 127 30V66Q100 109 74 66ZM22 74L36 86 48 67 60 86 74 74V108Q47 144 22 108ZM128 48L141 63 154 43 168 63 181 48V87Q154 121 128 87Z" fill="#d5a09e"/>',
  ],
  [
    'berries',
    'Cành quả đỏ',
    'Vườn nhỏ',
    '<path d="M93 190Q118 103 68 13M104 151L157 118M97 104L44 76" fill="none" stroke="#7b8c6a" stroke-width="6"/><g fill="#bc7979"><circle cx="65" cy="27" r="19"/><circle cx="44" cy="65" r="18"/><circle cx="160" cy="108" r="18"/><circle cx="138" cy="136" r="17"/></g><path d="M100 104Q149 51 155 85Q140 109 100 104M103 160Q39 120 56 165Q74 181 103 160" fill="#97a888"/>',
  ],
  [
    'leaf-wreath',
    'Vòng lá',
    'Vườn nhỏ',
    '<path d="M94 184Q-4 114 48 31M106 184Q204 114 152 31" fill="none" stroke="#819677" stroke-width="5"/><g fill="#a3b398"><ellipse cx="38" cy="65" rx="15" ry="30" transform="rotate(-28 38 65)"/><ellipse cx="36" cy="116" rx="14" ry="28" transform="rotate(-55 36 116)"/><ellipse cx="65" cy="159" rx="14" ry="26" transform="rotate(-65 65 159)"/><ellipse cx="162" cy="65" rx="15" ry="30" transform="rotate(28 162 65)"/><ellipse cx="164" cy="116" rx="14" ry="28" transform="rotate(55 164 116)"/><ellipse cx="135" cy="159" rx="14" ry="26" transform="rotate(65 135 159)"/></g>',
  ],
  [
    'cake',
    'Chiếc bánh nhỏ',
    'Ngày vui',
    '<path d="M39 107H161V179H39Z" fill="#e8c3b1"/><path d="M30 103Q45 78 59 100Q76 78 91 100Q107 78 123 100Q140 78 171 103V119H30Z" fill="#fff0d9"/><path d="M100 78V42" stroke="#92a58c" stroke-width="8"/><path d="M100 39Q77 17 100 4Q123 18 100 39" fill="#d4ad67"/><path d="M24 185H177" stroke="#b9ab95" stroke-width="7"/>',
  ],
  [
    'balloons',
    'Bóng bay',
    'Ngày vui',
    '<path d="M60 93Q28 145 88 194M140 78Q165 142 103 194" stroke="#a89481" stroke-width="3" fill="none"/><ellipse cx="61" cy="59" rx="38" ry="49" fill="#c99a94"/><ellipse cx="140" cy="46" rx="34" ry="44" fill="#a2b393"/><path d="M53 107L61 94 69 107M133 88L140 77 147 88" fill="#b9957c"/>',
  ],
  [
    'gift-box',
    'Món quà',
    'Ngày vui',
    '<rect x="33" y="80" width="134" height="109" rx="4" fill="#c2cdb0"/><path d="M23 65H177V94H23Z" fill="#91a27f"/><path d="M88 65H112V189H88Z" fill="#efe1bb"/><path d="M100 62Q22 73 45 31Q69 9 100 62Q182 72 156 30Q130 9 100 62" fill="none" stroke="#d2ad85" stroke-width="11"/>',
  ],
  [
    'check-ticket',
    'Vé hoàn thành',
    'Nhật ký giấy',
    '<path d="M15 43H185V82Q157 100 185 119V162H15V119Q43 100 15 82Z" fill="#dce5ce" stroke="#93a481" stroke-width="4"/><path d="M65 102L87 124 135 72" stroke="#6f8860" stroke-width="10" fill="none"/>',
  ],
  [
    'pencil',
    'Bút chì',
    'Nhật ký giấy',
    '<path d="M42 150L130 22 162 45 73 174 29 190Z" fill="#dfbd7e"/><path d="M130 22L143 4 175 27 162 45Z" fill="#d39c96"/><path d="M42 150L73 174 29 190Z" fill="#e9d5b2"/><path d="M29 190L37 167 49 181Z" fill="#7b756b"/><path d="M57 155L145 30" stroke="#c59759" stroke-width="5"/>',
  ],
  [
    'paperclip',
    'Kẹp giấy',
    'Nhật ký giấy',
    '<path d="M70 159L136 57Q164 10 133 10Q115 7 100 29L34 135Q8 184 47 191Q72 197 92 167L156 68Q176 34 152 29Q134 24 121 44L63 135Q51 155 66 159Z" fill="none" stroke="#b59876" stroke-width="7" stroke-linecap="round"/>',
  ],
] as const;
export const extraDecorations = pieces.map(([id, name, collection, body]) => ({
  id,
  name,
  collection,
  width: 200,
  height: 200,
  src: svg(200, 200, body),
}));
const marks = [
  [
    'symbol-heart',
    'Trái tim',
    'Lời thương',
    'M32 56Q4 36 10 19Q19 4 32 22Q46 4 55 19Q62 36 32 56Z',
  ],
  [
    'symbol-star',
    'Ngôi sao',
    'Lời thương',
    'M32 4L39 23 60 24 44 37 49 59 32 46 14 59 20 37 4 24 25 23Z',
  ],
  [
    'symbol-flower',
    'Bông hoa',
    'Lời thương',
    'M32 10C50 -4 65 22 47 30C70 40 48 64 34 47C20 69 -3 45 17 32C-4 18 20 -2 32 10Z',
  ],
  ['symbol-sparkle', 'Lấp lánh', 'Lời thương', 'M32 0L40 24 64 32 40 40 32 64 24 40 0 32 24 24Z'],
  [
    'symbol-pin',
    'Địa điểm',
    'Hành trình',
    'M32 60Q2 30 12 13Q32 -7 52 13Q62 30 32 60ZM32 17A9 9 0 1 0 32 35A9 9 0 1 0 32 17Z',
  ],
  ['symbol-arrow', 'Đi tiếp', 'Hành trình', 'M6 27H43L29 13 36 6 62 32 36 58 29 51 43 37H6Z'],
  [
    'symbol-moon',
    'Trăng khuyết',
    'Hành trình',
    'M44 4Q12 26 37 48Q46 55 60 49Q40 75 17 52Q-7 24 21 7Q33 0 44 4Z',
  ],
  [
    'symbol-sun',
    'Nắng',
    'Hành trình',
    'M27 0H37V12H27ZM27 52H37V64H27ZM0 27H12V37H0ZM52 27H64V37H52ZM32 16A16 16 0 1 0 32 48A16 16 0 1 0 32 16Z',
  ],
  ['symbol-check', 'Đã làm', 'Dấu ngày', 'M5 31L14 23 27 38 51 9 60 17 27 56Z'],
  [
    'symbol-note',
    'Nốt nhạc',
    'Dấu ngày',
    'M26 6L56 0V43Q56 63 39 60Q23 57 35 45Q41 40 47 44V15L35 18V49Q35 68 18 64Q2 60 14 48Q19 43 26 47Z',
  ],
  ['symbol-envelope', 'Lá thư', 'Dấu ngày', 'M4 13H60V53H4ZM8 17L32 35 56 17 52 17 32 30 12 17Z'],
  [
    'symbol-calendar',
    'Ngày hẹn',
    'Dấu ngày',
    'M12 5H19V13H45V5H52V13H60V60H4V13H12ZM11 27V53H53V27Z',
  ],
] as const;
export const smallSymbols = marks.map(([id, name, group, body], i) => ({
  id,
  name,
  group,
  collection: 'Ký hiệu · ' + group,
  width: 72,
  height: 72,
  src: svg(
    72,
    72,
    `<path transform="translate(4 4)" d="${body}" fill="${['#b27d78', '#8c9d72', '#c3a068'][i % 3]}" fill-rule="evenodd"/>`,
  ),
}));
