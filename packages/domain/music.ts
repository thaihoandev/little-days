export const musicCatalog = [
  {
    id: 'piano-postcard',
    name: 'Bưu thiếp ngày nắng',
    mood: 'Piano nhẹ · không lời',
    file: 'piano-postcard.wav',
  },
  {
    id: 'acoustic-sunday',
    name: 'Chủ nhật bên nhau',
    mood: 'Acoustic tổng hợp · không lời',
    file: 'acoustic-sunday.wav',
  },
  { id: 'gentle', name: 'Chuông gió dịu dàng', mood: 'Nhẹ nhàng', file: 'gentle.wav' },
  { id: 'warm-piano', name: 'Nắng qua ô cửa', mood: 'Ấm áp · phím đàn', file: 'warm-piano.wav' },
  {
    id: 'little-waltz',
    name: 'Điệu nhảy của hai đứa',
    mood: 'Vui tươi · nhịp ba',
    file: 'little-waltz.wav',
  },
  { id: 'evening', name: 'Một chiều bình yên', mood: 'Êm dịu · ambient', file: 'evening.wav' },
] as const;
export const builtInMusic = (id: string) => musicCatalog.find((track) => track.id === id);
