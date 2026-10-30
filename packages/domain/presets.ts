import { element } from './index.js';
export const textPresets = [
  {
    id: 'heading',
    name: 'Tiêu đề trang sách',
    label: 'Thêm tiêu đề',
    font: 'serif',
    size: 38,
    width: 500,
    height: 100,
    text: 'Chuyện của hai đứa',
    color: '#4f5342',
  },
  {
    id: 'hand',
    name: 'Lời nhắn viết tay',
    label: 'Một lời nhắn viết tay',
    font: 'hand',
    size: 31,
    width: 420,
    height: 150,
    text: 'Giữ lại một chút thương…',
    color: '#7b765f',
  },
  {
    id: 'quote',
    name: 'Trích dẫn dịu dàng',
    label: 'Thêm trích dẫn',
    font: 'serif',
    size: 30,
    width: 460,
    height: 170,
    text: '“Có bạn ở đây,\nlà đủ.”',
    color: '#a16e64',
  },
  {
    id: 'caption',
    name: 'Chú thích ảnh',
    label: 'Thêm chú thích',
    font: 'hand',
    size: 23,
    width: 360,
    height: 75,
    text: 'một khoảnh khắc thật đẹp',
    color: '#84765e',
  },
  {
    id: 'label',
    name: 'Nhãn nhỏ',
    label: 'Thêm nhãn nhỏ',
    font: 'sans',
    size: 18,
    width: 350,
    height: 55,
    text: 'OUR LITTLE MOMENTS',
    color: '#778568',
  },
  {
    id: 'letter',
    name: 'Lá thư ngắn',
    label: 'Thêm lá thư ngắn',
    font: 'hand',
    size: 28,
    width: 440,
    height: 220,
    text: 'Gửi người mình thương,\n\nCảm ơn vì đã cùng mình đi qua những ngày bình thường.',
    color: '#73624e',
  },
] as const;
export function textPreset(id: string) {
  const spec = textPresets.find((p) => p.id === id);
  if (!spec) throw new Error('Unknown text preset');
  return element('text', {
    font: spec.font,
    fontSize: spec.size,
    text: spec.text,
    color: spec.color,
    width: spec.width,
    height: spec.height,
    x: 130,
    y: 280,
    align: spec.id === 'letter' ? 'left' : 'center',
  });
}
export const counterPresets = [
  { id: 'card', name: 'Thẻ đếm ngày', style: 'card', mode: 'elapsed', width: 330, height: 180 },
  { id: 'ticket', name: 'Vé bên nhau', style: 'ticket', mode: 'elapsed', width: 350, height: 170 },
  { id: 'seal', name: 'Dấu tròn kỉ niệm', style: 'seal', mode: 'elapsed', width: 230, height: 230 },
  {
    id: 'calendar',
    name: 'Lịch ngày kỉ niệm',
    style: 'calendar',
    mode: 'annual',
    width: 330,
    height: 190,
  },
  {
    id: 'milestone',
    name: 'Mốc 1.000 ngày',
    style: 'card',
    mode: 'milestone',
    width: 350,
    height: 190,
  },
  {
    id: 'plain',
    name: 'Ngày bên nhau tối giản',
    style: 'plain',
    mode: 'elapsed',
    width: 350,
    height: 100,
  },
] as const;
export function counterPreset(id: string) {
  const spec = counterPresets.find((p) => p.id === id);
  if (!spec) throw new Error('Unknown counter preset');
  return element('anniversary', {
    counterStyle: spec.style,
    dateMode: spec.mode,
    milestoneDays: 1000,
    text: 'ngày bên nhau',
    font: spec.style === 'seal' ? 'serif' : 'sans',
    fontSize: spec.style === 'seal' ? 25 : 27,
    color: spec.style === 'seal' ? '#a16e64' : '#687952',
    width: spec.width,
    height: spec.height,
    x: 180,
    y: 300,
    align: 'center',
  });
}
