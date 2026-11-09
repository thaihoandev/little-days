import { createPage, element, type Page, type Theme } from './index.js';
import { decoration, type DecorationId } from './decorations.js';
import { invitationPage } from './invitations.js';
export const builtInTemplates = [
  {
    id: 'invite-date',
    name: 'Một cuộc hẹn',
    theme: 'letter',
    color: '#f3e3d9',
    description: 'Thiệp hẹn hò với nét giấy mộc và một tấm ảnh.',
  },
  {
    id: 'invite-birthday',
    name: 'Mừng ngày của bạn',
    theme: 'polaroid',
    color: '#f9e6aa',
    description: 'Thiệp sinh nhật tươi vui, ảnh và những ngôi sao.',
  },
  {
    id: 'invite-anniversary',
    name: 'Hẹn ngày yêu thương',
    theme: 'letter',
    color: '#e3eada',
    description: 'Thiệp kỉ niệm trang nhã với hoa và lời mời.',
  },
  {
    id: 'invite-evening',
    name: 'Một tối dưới sao',
    theme: 'letter',
    color: '#24364e',
    description: 'Thiệp bữa tối màu xanh đêm và ánh vàng.',
  },
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
  {
    id: 'sunset',
    name: 'Hoàng hôn rực rỡ',
    theme: 'polaroid',
    color: '#ffc5a1',
    description: 'Cam đào và đỏ gạch, hai khung ảnh như nắng cuối ngày.',
  },
  {
    id: 'lavender',
    name: 'Hẹn dưới trời tím',
    theme: 'letter',
    color: '#d9ccff',
    description: 'Tím lilac, hoa nhỏ và một lá thư nằm cạnh ảnh.',
  },
  {
    id: 'ocean',
    name: 'Ngày xanh biển',
    theme: 'timeline',
    color: '#a7e4ed',
    description: 'Xanh biển trong trẻo, ba tấm ảnh xếp theo hành trình.',
  },
  {
    id: 'midnight',
    name: 'Bầu trời hai đứa',
    theme: 'letter',
    color: '#192c50',
    description: 'Nền xanh đêm, ánh vàng và một khoảnh khắc thật lớn.',
  },
  {
    id: 'pop',
    name: 'Yêu thật nhiều màu',
    theme: 'polaroid',
    color: '#ffda53',
    description: 'Vàng nắng, hồng pop và collage ảnh vui tươi.',
  },
  {
    id: 'photobooth',
    name: 'Photobooth 4 ô',
    theme: 'polaroid',
    color: '#f5f0ea',
    description: 'Dải photobooth 4 khung dọc phong cách Hàn Quốc.',
  },
  {
    id: 'wooden-clips',
    name: 'Kẹp gỗ dây thừng',
    theme: 'polaroid',
    color: '#efe9df',
    description: 'Dây thừng mộc và kẹp gỗ treo ảnh polaroid.',
  },
  {
    id: 'ticket-stubs',
    name: 'Cuống vé kỉ niệm',
    theme: 'timeline',
    color: '#eae4d9',
    description: 'Vé xem phim và chuyến bay đầu tiên cùng nhau.',
  },
] as const;
export const featuredTemplateIds = ['photobooth', 'wooden-clips', 'ticket-stubs'] as const;
export const isFeaturedTemplate = (id: string) => featuredTemplateIds.some((value) => value === id);
export const featuredTemplates = [...builtInTemplates].sort((a, b) => {
  const rank = (id: string) => {
    const index = featuredTemplateIds.findIndex((value) => value === id);
    return index < 0 ? featuredTemplateIds.length : index;
  };
  return rank(a.id) - rank(b.id);
});
export type BuiltInTemplateId = (typeof builtInTemplates)[number]['id'];
export function templatePage(id: string, assets: string[] = []): Page {
  const spec = builtInTemplates.find((t) => t.id === id);
  if (!spec) throw new Error('Unknown template.');
  if (id.startsWith('invite-')) return invitationPage(id, assets);
  const decor = (
    id: DecorationId,
    x: number,
    y: number,
    width: number,
    rotation = 0,
    locked = false,
  ) => {
    const art = decoration(id)!;
    return element('sticker', {
      decorationId: id,
      text: art.name,
      x,
      y,
      width,
      height: (width * art.height) / art.width,
      rotation,
      locked,
    });
  };
  if (['sunset', 'lavender', 'ocean', 'midnight', 'pop'].includes(id)) {
    const ink =
      id === 'midnight'
        ? '#fff0bf'
        : id === 'lavender'
          ? '#553d86'
          : id === 'ocean'
            ? '#095767'
            : '#7c3241';
    const text = (
      value: string,
      x: number,
      y: number,
      width: number,
      height: number,
      fontSize: number,
    ) => element('text', { text: value, x, y, width, height, fontSize, color: ink });
    const photo = (i: number, x: number, y: number, width: number, height: number, rotation = 0) =>
      element('image', {
        assetId: assets.length ? assets[i % assets.length] : `demo-${(i % 3) + 1}`,
        text: 'ngày mình muốn giữ',
        x,
        y,
        width,
        height,
        rotation,
      });
    const accents = [
      decor('tape-sand', 260, 160, 180, -4),
      decor(
        'daisy',
        id === 'ocean' ? 70 : 565,
        id === 'ocean' ? 830 : 720,
        id === 'ocean' ? 60 : 90,
        6,
      ),
      decor('postage', 35, 155, 65, -7),
    ];
    let elements: Page['elements'];
    if (id === 'sunset')
      elements = [
        text('Nắng cuối ngày, có bạn.', 55, 55, 610, 90, 44),
        photo(0, 65, 200, 360, 410, -6),
        photo(1, 370, 405, 285, 320, 7),
        text('Mình gom những ấm áp bé xíu\nthành một ngày thật đáng nhớ.', 70, 740, 450, 110, 28),
      ];
    else if (id === 'lavender')
      elements = [
        text('Một cuộc hẹn màu tím', 65, 65, 590, 95, 42),
        decor('paper-cream', 340, 265, 300, 4, true),
        photo(0, 65, 205, 335, 440, -4),
        text(
          'Gửi người mình thương,\n\nCảm ơn vì đã ở đây,\ncùng mình qua những\nngày thật bình thường.',
          415,
          335,
          205,
          335,
          25,
        ),
        text('mình cứ dịu dàng với nhau như thế.', 80, 800, 550, 60, 24),
      ];
    else if (id === 'ocean')
      elements = [
        text('Chuyến đi màu xanh', 65, 50, 590, 90, 44),
        photo(0, 55, 180, 395, 265, -3),
        photo(1, 260, 430, 395, 265, 3),
        photo(2, 65, 600, 265, 220, -5),
        text('Cùng nhau đi xa,\ncùng nhau trở về.', 375, 735, 280, 110, 28),
      ];
    else if (id === 'midnight')
      elements = [
        text('Dưới cùng một bầu trời', 60, 60, 600, 100, 41),
        photo(0, 95, 215, 530, 450, -1),
        text('Giữa bao la,\nmình tìm thấy nhau.', 95, 725, 520, 115, 35),
      ];
    else
      elements = [
        text('Hôm nay vui hết cỡ!', 60, 55, 600, 100, 47),
        photo(0, 65, 205, 330, 340, -7),
        photo(1, 365, 180, 285, 310, 6),
        photo(2, 230, 510, 335, 310, -3),
        text('LOVE / LAUGH / REPEAT', 55, 835, 610, 40, 24),
      ];
    return {
      id: crypto.randomUUID(),
      title: spec.name,
      background: spec.color,
      elements: [...elements, ...accents],
    };
  }
  if (['photobooth', 'wooden-clips', 'ticket-stubs'].includes(id)) {
    const text = (
      value: string,
      x: number,
      y: number,
      width: number,
      height: number,
      fontSize: number,
      color = '#38342e',
      font: 'sans' | 'serif' | 'hand' = 'sans',
    ) => element('text', { text: value, x, y, width, height, fontSize, color, font });
    const photo = (i: number, x: number, y: number, width: number, height: number, rotation = 0) =>
      element('image', {
        assetId: assets.length ? assets[i % assets.length] : `demo-${(i % 3) + 1}`,
        text: 'khoảnh khắc đôi mình',
        photoStyle: id === 'photobooth' ? 'minimal' : 'polaroid',
        x,
        y,
        width,
        height,
        rotation,
      });

    let elements: Page['elements'] = [];
    if (id === 'photobooth') {
      elements = [
        decor('photobooth-paper', 185, 30, 350, 0, true),
        text('LIFE 4 CUTS', 200, 50, 320, 40, 22, '#2d2d2d'),
        photo(0, 215, 100, 290, 140, 0),
        photo(1, 215, 255, 290, 140, 0),
        photo(2, 215, 410, 290, 140, 0),
        photo(3, 215, 565, 290, 140, 0),
        text('OUR SPECIAL STORY ♡', 200, 720, 320, 30, 14, '#767067'),
        decor('photobooth-logo', 260, 760, 200, 0),
        decor('tape-rose', 300, 4, 120, 2),
        decor('tape-sand', 60, 250, 120, -15),
        decor('tape-sage', 540, 480, 120, 15),
        text('Một dải ảnh,\nngàn nụ cười.', 50, 400, 120, 80, 18, '#827768', 'hand'),
      ];
    } else if (id === 'wooden-clips') {
      elements = [
        text('Treo từng khoảnh khắc ♡', 65, 45, 590, 70, 36, '#464034', 'serif'),
        decor('rope-rustic', 40, 185, 640, 0, true),
        // 3 hanging polaroids
        photo(0, 55, 215, 195, 245, -5),
        photo(1, 262, 205, 195, 245, 3),
        photo(2, 470, 220, 195, 245, -3),
        // wooden clips pinning each polaroid to the rope
        decor('clip-wood', 130, 160, 45, -5),
        decor('clip-wood', 337, 150, 45, 3),
        decor('clip-wood', 545, 165, 45, -3),
        decor('leaf-olive', 30, 520, 120, 15),
        decor('daisy', 570, 520, 95, -10),
        text(
          'Gom những điều bình dị,\ntreo vào góc nhỏ yêu thương.',
          120,
          710,
          480,
          95,
          27,
          '#62594a',
          'hand',
        ),
      ];
    } else if (id === 'ticket-stubs') {
      elements = [
        text('Chuyến đi đầu tiên của mình', 65, 45, 590, 70, 36, '#3a3e35', 'serif'),
        decor('boarding-pass', 65, 130, 590, -1),
        photo(0, 80, 280, 280, 250, -4),
        photo(1, 365, 335, 285, 255, 4),
        decor('ticket-cinema', 65, 560, 270, 3),
        decor('postmark', 475, 620, 190, -6),
        decor('tape-sand', 390, 315, 170, 4),
        text(
          'Từ lần hẹn đầu tiên, cho đến vạn dặm cùng nhau.',
          80,
          810,
          560,
          50,
          24,
          '#586150',
          'hand',
        ),
      ];
    }
    return {
      id: crypto.randomUUID(),
      title: spec.name,
      background: spec.color,
      elements,
    };
  }
  if (['polaroid', 'letter', 'timeline'].includes(id)) {
    if (id === 'timeline')
      return {
        id: crypto.randomUUID(),
        title: spec.name,
        background: spec.color,
        elements: [
          decor('paper-grid', 55, 95, 600, 0, true),
          element('text', {
            text: 'Những ngày thành câu chuyện',
            font: 'serif',
            fontSize: 35,
            x: 70,
            y: 50,
            width: 580,
            height: 90,
          }),
          ...[0, 1, 2].flatMap((i) => [
            element('image', {
              assetId: assets.length ? assets[i % assets.length] : `demo-${i + 1}`,
              text: ['lần đầu', 'cùng nhau', 'về sau'][i],
              x: 90,
              y: 175 + i * 185,
              width: 275,
              height: 180,
              rotation: i % 2 ? 3 : -3,
            }),
            element('text', {
              text: [
                '01 / Một lần gặp gỡ',
                '02 / Những ngày rong chơi',
                '03 / Một lời hẹn dài lâu',
              ][i],
              font: 'hand',
              fontSize: 29,
              color: '#677952',
              x: 395,
              y: 215 + i * 185,
              width: 235,
              height: 105,
            }),
          ]),
          element('anniversary', {
            text: 'ngày bên nhau',
            font: 'sans',
            fontSize: 22,
            color: '#677952',
            x: 100,
            y: 790,
            width: 400,
            height: 65,
          }),
          decor('leaf-sage', 25, 570, 80, -4),
          decor('ticket', 490, 780, 150, 4),
          decor('tape-rose', 150, 150, 170, -3),
        ],
      };
    const page = createPage(
      id as Theme,
      assets.length ? Array.from({ length: 4 }, (_, i) => assets[i % assets.length]) : [],
    );
    const backgrounds =
      id === 'letter'
        ? [decor('paper-cream', 50, 40, 620, 0, true)]
        : [
            decor('paper-grid', 45, 170, 305, -3, true),
            decor('paper-rose', 380, 340, 280, 4, true),
          ];
    const accents =
      id === 'letter'
        ? [decor('postage', 555, 170, 105, 4), decor('wax-seal', 540, 735, 100, -7)]
        : [
            decor('leaf-sage', 535, 640, 120, 5),
            decor('daisy', 36, 435, 100, -8),
            decor('ticket', 410, 650, 205, -5),
          ];
    if (id === 'letter' || id === 'polaroid') {
      const footer = page.elements.find((e) => e.type === 'text' && e.y === 770);
      if (footer) {
        footer.width = id === 'letter' ? 400 : 430;
        footer.fontSize = 26;
      }
    }
    return {
      ...page,
      elements: [...backgrounds, ...page.elements.filter((e) => e.type !== 'sticker'), ...accents],
    };
  }
  const text = (value: string, x: number, y: number, width: number, height: number, size = 32) =>
    element('text', { text: value, x, y, width, height, fontSize: size });
  const photo = (i: number, x: number, y: number, width: number, height: number, rotation = 0) =>
    element('image', {
      assetId: assets.length ? assets[i % assets.length] : `demo-${(i % 3) + 1}`,
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
  const backgrounds =
    id === 'bloom'
      ? [decor('paper-rose', 130, 190, 440, -3, true)]
      : id === 'celebration'
        ? [decor('confetti', 35, 180, 650, 0, true), decor('paper-cream', 145, 215, 420, 0, true)]
        : id === 'minimal'
          ? [decor('paper-cream', 145, 180, 430, 0, true)]
          : [decor('paper-grid', 38, 130, 620, 0, true)];
  const accents =
    id === 'postcard'
      ? [
          decor('postage', 565, 45, 100, 5),
          decor('postmark', 470, 770, 180, -8),
          decor('tape-sand', 245, 153, 210, -4),
        ]
      : id === 'filmstrip'
        ? [
            decor('tape-sage', 245, 132, 190, -3),
            decor('leaf-olive', 25, 500, 95, -9),
            decor('ticket', 480, 780, 170, 4),
          ]
        : id === 'bloom'
          ? [
              decor('leaf-olive', 35, 520, 125, -8),
              decor('leaf-sage', 535, 160, 120, 8),
              decor('daisy', 520, 710, 95),
              decor('flower-rose', 50, 180, 90, 7),
            ]
          : id === 'celebration'
            ? [
                decor('ribbon', 295, 155, 140),
                decor('stars-gold', 540, 260, 120, 5),
                decor('wax-seal', 565, 690, 95, -5),
              ]
            : id === 'minimal'
              ? [
                  decor('leaf-sage', 500, 480, 110, 9),
                  decor('tape-sand', 250, 218, 190, -3),
                  decor('daisy', 135, 185, 75),
                ]
              : [
                  decor('tape-rose', 110, 155, 180, -8),
                  decor('tape-sage', 420, 485, 160, 7),
                  decor('leaf-olive', 565, 660, 105, 6),
                  decor('heart-pink', 315, 400, 90, -9),
                ];
  if (id === 'postcard') elements[0] = { ...elements[0], width: 475, fontSize: 38 };
  if (id === 'filmstrip')
    elements[elements.length - 1] = { ...elements[elements.length - 1], width: 390, fontSize: 22 };
  if (id === 'bloom')
    elements[elements.length - 1] = {
      ...elements[elements.length - 1],
      x: 90,
      y: 765,
      width: 420,
      height: 75,
      fontSize: 28,
    };
  if (id === 'celebration') {
    const caption = elements.find((e) => e.type === 'text' && e.y === 705);
    if (caption) caption.width = 465;
  }
  if (id === 'collage')
    elements[elements.length - 1] = { ...elements[elements.length - 1], width: 500, fontSize: 21 };
  return {
    id: crypto.randomUUID(),
    title: spec.name,
    background: spec.color,
    elements: [...backgrounds, ...elements.filter((e) => e.type !== 'sticker'), ...accents],
  };
}
