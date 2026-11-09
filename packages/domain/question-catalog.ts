import { z } from 'zod';
import { dailyQuestions } from './couple.js';
export const questionTopics = {
  everyday: 'Điều nhỏ mỗi ngày',
  gratitude: 'Biết ơn',
  memories: 'Kỉ niệm',
  plans: 'Dự định',
} as const;
export const questionPreferencesInput = z.object({
  expectedRevision: z.number().int().min(-1),
  excluded: z.array(z.enum(['everyday', 'gratitude', 'memories', 'plans'])).max(3),
});
export type QuestionPreferences = {
  revision: number;
  excluded: (keyof typeof questionTopics)[];
  effectiveDate?: string;
};
const originals = {
  gratitude: [
    'Bạn muốn cảm ơn mình về điều gì trong tuần này?',
    'Điều bình thường nào của hai đứa mà bạn trân trọng?',
    'Ai đã giúp ngày của bạn nhẹ hơn hôm nay?',
    'Một việc nhỏ bạn muốn làm để đáp lại sự quan tâm?',
    'Khi nào bạn cảm thấy lời cảm ơn được lắng nghe?',
    'Bạn muốn tự cảm ơn bản thân vì điều gì?',
    'Một điều ở người thương khiến bạn yên tâm?',
    'Bạn trân trọng buổi sáng hay buổi tối bên nhau hơn? Vì sao?',
    'Một hành động âm thầm của mình mà bạn đã nhận ra?',
    'Bạn muốn hai đứa giữ thói quen tốt nào?',
    'Điều gì gần đây khiến bạn thấy mình được tôn trọng?',
    'Một điều tử tế bạn muốn cùng mình làm trong tháng này?',
  ],
  memories: [
    'Nếu đặt tên cho tuần vừa qua, bạn sẽ chọn tên gì?',
    'Có tấm ảnh cũ nào bạn muốn cùng xem lại?',
    'Một con đường gắn với câu chuyện của hai đứa?',
    'Bạn nhớ âm thanh nào trong một chuyến đi cùng nhau?',
    'Một món đồ nhỏ nào đang giữ kỉ niệm lớn?',
    'Bữa ăn nào của hai đứa khiến bạn nhớ nhất?',
    'Một lần cả hai làm sai mà giờ nhớ lại thấy vui?',
    'Có câu nói nào của mình bạn vẫn còn nhớ?',
    'Một ngày mưa của hai đứa có điều gì đặc biệt?',
    'Nếu viết chú thích cho ảnh đầu tiên, bạn sẽ viết gì?',
    'Một điều về buổi hẹn đầu mà bạn chưa kể?',
    'Kỉ niệm nào bạn muốn lưu bằng một trang sổ hôm nay?',
  ],
  plans: [
    'Cuối tuần tới, mình có thể dành cho nhau khoảng thời gian nào?',
    'Một buổi hẹn gần nhà bạn muốn thử?',
    'Nếu có một giờ không dùng điện thoại, mình sẽ làm gì?',
    'Một công việc bạn muốn hai đứa chia sẻ dễ dàng hơn?',
    'Bạn muốn học điều gì mới cùng mình?',
    'Một món ăn mình có thể cùng nấu trong tuần tới?',
    'Bạn muốn dành một góc nhà cho điều gì của hai đứa?',
    'Một dự định nhỏ có thể bắt đầu trong mười phút?',
    'Chuyến đi ngắn nào mình có thể để dành ý tưởng?',
    'Nếu tuần tới bận, bạn muốn giữ khoảng riêng nào cho nhau?',
    'Bạn muốn ngày kỉ niệm sắp tới giản dị như thế nào?',
    'Một điều hai đứa có thể chuẩn bị hôm nay để ngày mai thảnh thơi?',
  ],
};
export const questionCatalog = [
  ...dailyQuestions.map((prompt, i) => ({
    id: `daily-v1-${i + 1}`,
    topic: 'everyday' as const,
    prompt,
  })),
  ...Object.entries(originals).flatMap(([topic, prompts]) =>
    prompts.map((prompt, i) => ({
      id: `${topic}-v1-${i + 1}`,
      topic: topic as keyof typeof questionTopics,
      prompt,
    })),
  ),
];
export function catalogQuestion(day: number, offset: number, excluded: string[]) {
  const pool = questionCatalog.filter((q) => !excluded.includes(q.topic));
  if (!pool.length) throw Error('Cần giữ ít nhất một chủ đề.');
  return pool[(((day + offset) % pool.length) + pool.length) % pool.length];
}
