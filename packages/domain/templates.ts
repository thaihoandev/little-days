import { createPage, element, type Page, type Theme } from './index.js';
export const builtInTemplates = [
  {
    id: 'polaroid',
    name: 'Nhật ký Polaroid',
    theme: 'polaroid',
    color: '#eee4cf',
    description: 'Ảnh nghiêng và những lời thương.',
  },
  {
    id: 'letter',
    name: 'Thư gửi người thương',
    theme: 'letter',
    color: '#f1dfd6',
    description: 'Một bức thư viết riêng cho nhau.',
  },
  {
    id: 'timeline',
    name: 'Những ngày bên nhau',
    theme: 'timeline',
    color: '#e4e8d9',
    description: 'Những dấu mốc nối thành câu chuyện.',
  },
  {
    id: 'postcard',
    name: 'Bưu thiếp chuyến đi',
    theme: 'polaroid',
    color: '#dce8e7',
    description: 'Một khung ảnh lớn cho ngày đi xa.',
  },
  {
    id: 'filmstrip',
    name: 'Thước phim nhỏ',
    theme: 'timeline',
    color: '#e8dfd5',
    description: 'Ba khoảnh khắc như một đoạn phim.',
  },
  {
    id: 'bloom',
    name: 'Vườn hoa của mình',
    theme: 'letter',
    color: '#e7e9d9',
    description: 'Màu lá và những bông hoa nhỏ.',
  },
  {
    id: 'celebration',
    name: 'Một ngày đặc biệt',
    theme: 'polaroid',
    color: '#f1dedb',
    description: 'Sinh nhật, kỉ niệm và điều đáng mừng.',
  },
  {
    id: 'minimal',
    name: 'Chút bình yên',
    theme: 'letter',
    color: '#eeebe4',
    description: 'Nhiều khoảng thở, một lời nhắn giản dị.',
  },
  {
    id: 'collage',
    name: 'Gom từng chút nhớ',
    theme: 'polaroid',
    color: '#e8dfd1',
    description: 'Bốn khung ảnh cho một ngày trọn vẹn.',
  },
] as const;
export type BuiltInTemplateId = (typeof builtInTemplates)[number]['id'];
export function templatePage(id: string, assets: string[] = []): Page {
  const spec = builtInTemplates.find((t) => t.id === id);
  if (!spec) throw new Error('Unknown template.');
  if (['polaroid', 'letter', 'timeline'].includes(id)) return createPage(id as Theme, assets);
  const text = (value: string, x: number, y: number, width: number, height: number, size = 32) =>
    element('text', { text: value, x, y, width, height, fontSize: size });
  const photo = (i: number, x: number, y: number, width: number, height: number, rotation = 0) =>
    element('image', {
      assetId: assets[i] ?? `demo-${(i % 3) + 1}`,
      text: 'một ngày để nhớ',
      x,
      y,
      width,
      height,
      rotation,
    });
  let elements: Page['elements'];
  switch (id) {
    case 'postcard':
      elements = [
        text('Gửi từ một ngày rất đẹp', 60, 55, 600, 90, 42),
        photo(0, 75, 170, 570, 440, -2),
        text('Ở đâu cũng được, miễn là cùng nhau.', 90, 660, 540, 125, 34),
        text('POSTCARD · OUR LITTLE DAYS', 100, 825, 520, 35, 17),
      ];
      break;
    case 'filmstrip':
      elements = [
        text('Những khoảnh khắc của mình', 65, 45, 590, 80, 36),
        ...Array.from({ length: 3 }, (_, i) =>
          photo(i, 100 + (i % 2) * 55, 155 + i * 225, 460, 205, i % 2 ? 2 : -2),
        ),
        text('Một thước phim, nhiều điều thương.', 80, 835, 560, 45, 23),
      ];
      break;
    case 'bloom':
      elements = [
        text('Mình cùng nhau lớn lên', 75, 65, 570, 110, 41),
        photo(0, 90, 225, 290, 355, -5),
        photo(1, 350, 400, 275, 330, 5),
        element('sticker', {
          text: '✿',
          x: 490,
          y: 175,
          width: 140,
          height: 140,
          fontSize: 130,
          color: '#76865f',
        }),
        text('Nhẹ nhàng như một khu vườn.', 65, 745, 590, 85, 30),
      ];
      break;
    case 'celebration':
      elements = [
        text('Mừng một ngày có nhau ♡', 60, 65, 600, 130, 44),
        photo(0, 160, 235, 400, 405, 3),
        text('Thêm một tuổi. Thêm một điều thương.', 70, 705, 580, 100, 31),
        element('sticker', {
          text: '✦',
          x: 60,
          y: 260,
          width: 80,
          height: 80,
          fontSize: 75,
          color: '#bd8964',
        }),
        element('sticker', {
          text: '♡',
          x: 560,
          y: 565,
          width: 90,
          height: 90,
          fontSize: 82,
          color: '#b26b76',
        }),
      ];
      break;
    case 'minimal':
      elements = [
        text('một chút bình yên', 90, 75, 540, 70, 32),
        photo(0, 190, 240, 340, 370),
        text('Có bạn ở đây,\nlà đủ.', 130, 680, 460, 125, 39),
      ];
      break;
    default:
      elements = [
        text('Gom từng chút nhớ', 75, 45, 570, 90, 42),
        photo(0, 60, 180, 280, 275, -5),
        photo(1, 375, 160, 280, 275, 5),
        photo(2, 80, 510, 280, 275, 3),
        photo(3, 390, 505, 265, 275, -4),
        text('những điều bé xíu làm nên chúng mình', 65, 825, 590, 45, 22),
      ];
  }
  return { id: crypto.randomUUID(), title: spec.name, background: spec.color, elements };
}
