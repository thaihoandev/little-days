import { element, type Page } from './index.js';
import { decoration, type DecorationId } from './decorations.js';

/** Ordinary editable elements: same 720×900 artwork in canvas, shared viewer and MP4. */
export function invitationPage(id: string, assets: string[] = []): Page {
  const night = id === 'invite-evening',
    birthday = id === 'invite-birthday',
    garden = id === 'invite-anniversary',
    photo = !garden && !night;
  const ink = night ? '#f4dfb6' : garden ? '#446348' : '#784c46';
  const text = (
    value: string,
    y: number,
    height: number,
    size: number,
    font: 'serif' | 'hand' | 'sans' = 'serif',
  ) =>
    element('text', {
      text: value,
      x: 90,
      y,
      width: 540,
      height,
      fontSize: size,
      font,
      color: ink,
      align: 'center',
      animation: 'rise',
    });
  const art = (key: DecorationId, x: number, y: number, width: number, rotation = 0) => {
    const d = decoration(key)!;
    return element('sticker', {
      decorationId: key,
      text: d.name,
      x,
      y,
      width,
      height: (width * d.height) / d.width,
      rotation,
      animation: 'fade',
    });
  };
  return {
    id: crypto.randomUUID(),
    title: birthday ? 'Thiệp sinh nhật' : 'Một lời mời',
    background: night ? '#24364e' : garden ? '#e3eada' : birthday ? '#f9e6aa' : '#f3e3d9',
    elements: [
      art(garden ? 'leaf-sage' : night ? 'stars-gold' : 'ribbon', 25, 30, garden ? 90 : 110, -12),
      art(
        garden ? 'leaf-sage' : night ? 'stars-gold' : 'heart-pink',
        garden ? 635 : 610,
        690,
        garden ? 70 : 80,
        14,
      ),
      art(night ? 'stars-gold' : 'wax-seal', 72, 744, 54, -8),
      text('GỬI BẠN MỘT LỜI MỜI', 80, 42, 19, 'sans'),
      text(
        birthday
          ? 'Mừng ngày của bạn!'
          : garden
            ? 'Hẹn ngày yêu thương'
            : night
              ? 'Một tối dưới sao'
              : 'Hẹn nhau một chút nhé?',
        148,
        130,
        46,
      ),
      ...(photo
        ? [
            element('image', {
              assetId: assets[0] || 'demo-1',
              text: 'một ngày dành riêng cho chúng mình',
              x: 220,
              y: 285,
              width: 280,
              height: 300,
              rotation: birthday ? 5 : -4,
              animation: 'drop',
            }),
          ]
        : [
            art(garden ? 'daisy' : 'stars-gold', 280, 320, 160),
            text('Có bạn, ngày này sẽ đẹp hơn.', 505, 65, 30, 'hand'),
          ]),
      text('Minh & An', 610, 62, 34, 'hand'),
      text('19:00 · Chủ nhật, 20 tháng 12', 686, 48, 24, 'sans'),
      text('Quán nhỏ mình thương · 12 Đường Hoa', 744, 74, 24, 'sans'),
      text('Mong được gặp bạn ở đây ♡', 825, 45, 25, 'hand'),
    ],
  };
}
