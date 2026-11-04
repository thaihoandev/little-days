import { element as createElement, type Page } from './index.js';
/** Continuous sections keep the same 720 × 900 editing and video coordinates. */
export function longInvitation(cover: Page): Page[] {
  const section = (title: string, heading: string, text: string): Page => ({
    ...cover,
    id: crypto.randomUUID(),
    title,
    elements: [
      createElement('text', {
        x: 70,
        y: 110,
        width: 580,
        height: 120,
        text: heading,
        fontSize: 46,
        align: 'center',
      }),
      createElement('image', {
        x: 110,
        y: 275,
        width: 500,
        height: 340,
        assetId: 'demo-2',
        photoStyle: 'arch',
      }),
      createElement('text', {
        x: 90,
        y: 680,
        width: 540,
        height: 155,
        text,
        fontSize: 24,
        align: 'center',
      }),
    ],
  });
  return [
    cover,
    section(
      'Chuyện của mình',
      'Hẹn gặp ở một ngày thật đẹp',
      'Một chút về câu chuyện, địa điểm và những điều mình muốn chia sẻ.',
    ),
    section(
      'Lời hẹn',
      'Mong có bạn ở đây',
      'Thời gian · Địa điểm\nThêm lời nhắn và cách xác nhận tham dự của bạn tại đây.',
    ),
  ];
}
