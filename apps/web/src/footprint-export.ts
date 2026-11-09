import type { JournalEntry } from '../../../packages/domain/journal.js';
import {
  VIETNAM_PROVINCES,
  groupFootprintsByProvince,
} from '../../../packages/domain/vietnam-provinces.js';
export async function footprintImage(
  source: SVGSVGElement,
  entries: JournalEntry[],
  story = false,
): Promise<Blob> {
  const snapshot = source.cloneNode(true) as SVGSVGElement;
  snapshot.setAttribute('width', '420');
  snapshot.setAttribute('height', '930');
  snapshot.querySelectorAll('[aria-pressed]').forEach((node) => {
    node.setAttribute('stroke', '#fffdf7');
    node.setAttribute('stroke-width', '.7');
  });
  snapshot.querySelectorAll('path[aria-hidden="true"]').forEach((node) => node.remove());
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(snapshot)], { type: 'image/svg+xml' }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    await Promise.race([
      document.fonts.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(Error('Font chưa sẵn sàng. Thử lại sau.')), 8000),
      ),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = story ? 1080 : 800;
    canvas.height = story ? 1920 : 1100;
    const context = canvas.getContext('2d');
    if (!context) throw Error('Thiết bị chưa hỗ trợ xuất ảnh.');
    const groups = groupFootprintsByProvince(entries),
      count = VIETNAM_PROVINCES.filter((p) => (groups.get(p.id) || []).length).length;
    context.fillStyle = '#fff8f3';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.fillStyle = '#b44760';
    context.font = `600 ${story ? 20 : 13}px "Plus Jakarta Sans",sans-serif`;
    context.fillText('LITTLE DAYS · DẤU CHÂN ĐÔI MÌNH', canvas.width / 2, story ? 80 : 35);
    context.fillStyle = '#332a31';
    context.font = `600 ${story ? 44 : 28}px "Plus Jakarta Sans",sans-serif`;
    context.fillText('Những nơi mình đã cùng đi', canvas.width / 2, story ? 145 : 75);
    context.font = `${story ? 25 : 16}px "Plus Jakarta Sans",sans-serif`;
    context.fillStyle = '#7c6b72';
    context.fillText(
      `${count}/34 tỉnh thành · ${Math.round((count / 34) * 100)}% hành trình`,
      canvas.width / 2,
      story ? 193 : 105,
    );
    const height = story ? 1260 : 900,
      width = (height * 420) / 930;
    context.drawImage(image, (canvas.width - width) / 2, story ? 240 : 120, width, height);
    if (story) {
      const items = VIETNAM_PROVINCES.flatMap((p) =>
        (groups.get(p.id) || []).map((entry) => ({ entry, province: p.name })),
      )
        .sort(
          (a, b) =>
            b.entry.date.localeCompare(a.entry.date) || a.entry.id.localeCompare(b.entry.id),
        )
        .slice(0, 4);
      context.textAlign = 'left';
      context.fillStyle = '#5d4650';
      context.font = '600 23px "Plus Jakarta Sans",sans-serif';
      context.fillText(
        items.length ? 'MỘT CHÚT NHỚ TRÊN ĐƯỜNG' : 'CHUYẾN ĐI TIẾP THEO ĐANG CHỜ',
        70,
        1560,
      );
      context.font = '23px "Plus Jakarta Sans",sans-serif';
      items.forEach(({ entry, province }, i) => {
        let line =
          entry.date.split('-').reverse().join('/') + ' · ' + province + ' · ' + entry.title;
        while (context.measureText(line).width > 940) line = line.slice(0, -2);
        context.fillText(line + (line.endsWith(entry.title) ? '' : '…'), 70, 1610 + i * 49);
      });
    }
    context.textAlign = 'center';
    context.fillStyle = '#8d7a80';
    context.font = `${story ? 17 : 10}px "Plus Jakarta Sans",sans-serif`;
    context.fillText(
      'geoBoundaries · Nhóm tỉnh 2025 · Ranh giới và đảo minh họa',
      canvas.width / 2,
      canvas.height - (story ? 58 : 18),
    );
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error('Chưa tạo được ảnh.'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
