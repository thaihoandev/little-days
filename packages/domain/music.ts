export const musicCatalog = [
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
