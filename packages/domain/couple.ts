import { z } from 'zod';
import { dateString } from './index.js';
export const answerInput = z.object({
  roundId: z.uuid(),
  expectedRevision: z.number().int().min(-1),
  requestId: z.uuid(),
  text: z.string().trim().min(1).max(1200),
  date: dateString.optional(),
  promptId: z.string().max(80).optional(),
});
export const catalogAnswerInput = answerInput.extend({ promptId: z.string().min(1).max(80) });
export const revisionInput = z.object({ expectedRevision: z.number().int().nonnegative() });
export const jarModes = { 'month-end': 'Cuối tháng này', scheduled: 'Chọn ngày mở' } as const;
export const jarInput = z.object({
  requestId: z.uuid(),
  text: z.string().trim().min(1).max(1200),
  mode: z.enum(['month-end', 'scheduled']),
  openDate: dateString.optional(),
  photoUrl: z
    .string()
    .regex(/^\/api\/together\/[\w-]+\/assets\/[\w-]+$/)
    .optional(),
});
export type CoupleMember = { id: string; displayName: string; avatarUrl?: string };
export type QuestionRound = {
  id: string;
  spaceId: string;
  epoch: string;
  participants: string[];
  date: string;
  prompt: string;
  promptId?: string;
  revision: number;
  createdAt: string;
  revealedAt?: string;
  milestoneId?: string;
};
export type CoupleAnswer = {
  id: string;
  roundId: string;
  spaceId: string;
  actorId: string;
  text: string;
  requestId: string;
  createdAt: string;
};
export type QuestionView = Omit<QuestionRound, 'epoch' | 'participants'> & {
  membersChanged: boolean;
  participants: (CoupleMember & { answered: boolean; text?: string })[];
};
export type LoveNote = {
  id: string;
  spaceId: string;
  epoch: string;
  participants: string[];
  authorId: string;
  text: string;
  photoUrl?: string;
  mode: keyof typeof jarModes;
  approvals: string[];
  consentVersion?: 2;
  unlockAt: string;
  createdAt: string;
  openedAt?: string;
  revision: number;
};
export type LoveNoteView = Omit<LoveNote, 'epoch' | 'participants' | 'text' | 'approvals'> & {
  text?: string;
  photoUrl?: string;
  hasPhoto?: boolean;
  authorName: string;
  authorAvatarUrl?: string;
  mine: boolean;
  opened: boolean;
  membersChanged: boolean;
  approvalCount: number;
  participantCount: number;
  approvedByMe: boolean;
  canApprove: boolean;
  canDelete: boolean;
};
export type CoupleState = {
  questionPreferences?: import('./question-catalog.js').QuestionPreferences;
  members: CoupleMember[];
  today: string;
  daily: QuestionView | null;
  jar: LoveNoteView[];
  jarTotal: number;
  jarHasMore: boolean;
  questions: QuestionView[];
  questionsHasMore: boolean;
  timezone: string;
  limits: { noteLength: number; answerLength: number; notesPerPerson: number };
};
// Original prompts: one stable question per Vietnam calendar day, cycling after 60 days.
export const dailyQuestions = [
  'Hôm nay điều nhỏ nào khiến bạn mỉm cười?',
  'Bạn muốn mình làm gì để ngày mai của bạn dễ chịu hơn?',
  'Một điều bạn biết ơn ở chúng mình hôm nay là gì?',
  'Khoảnh khắc gần đây nào bạn muốn giữ lại?',
  'Nếu có một buổi tối rảnh, bạn muốn cùng mình làm gì?',
  'Điều gì làm bạn thấy được quan tâm nhất?',
  'Một món ăn bạn muốn cùng mình thử là gì?',
  'Một nơi gần nhà bạn muốn cùng mình khám phá?',
  'Một bài hát khiến bạn nhớ đến chúng mình?',
  'Lần đầu gặp nhau, điều gì khiến bạn nhớ nhất?',
  'Một thói quen nhỏ của mình mà bạn thấy đáng yêu?',
  'Bạn muốn được động viên như thế nào khi mệt?',
  'Một điều bạn muốn kể nhưng chưa có dịp?',
  'Ngày cuối tuần lý tưởng của bạn trông như thế nào?',
  'Nếu viết một dòng cho chúng mình hôm nay, bạn sẽ viết gì?',
  'Một điều bạn muốn chúng mình thử lần đầu?',
  'Bạn thích một buổi hẹn yên tĩnh hay một chuyến đi bất ngờ? Vì sao?',
  'Gần đây bạn tự hào về bản thân ở điều gì?',
  'Một điều mình đã làm khiến bạn thấy ấm lòng?',
  'Một kỉ niệm khiến bạn bật cười mỗi khi nhớ lại?',
  'Bạn muốn góc nhỏ của hai đứa có thêm điều gì?',
  'Nếu chọn một màu cho hôm nay, bạn chọn màu gì?',
  'Một điều bạn đang mong chờ trong tháng này?',
  'Bạn muốn nhận lời yêu thương bằng cách nào?',
  'Món quà không cần mua nào bạn muốn dành cho mình?',
  'Chúng mình có thể chăm sóc bản thân tốt hơn bằng cách nào?',
  'Một điều bình thường mà bạn muốn làm cùng mình?',
  'Bạn muốn chúng mình chụp một tấm ảnh như thế nào?',
  'Hôm nay có điều gì khiến bạn thấy bình yên?',
  'Một điều bạn muốn cảm ơn chính mình?',
  'Nếu có một ngày không phải lo việc gì, bạn muốn làm gì?',
  'Một bộ phim bạn muốn xem cùng mình?',
  'Điều gì khiến bạn cảm thấy thoải mái khi ở bên nhau?',
  'Một công thức món ăn chúng mình nên thử nấu?',
  'Bạn muốn cùng mình tạo một truyền thống nhỏ nào?',
  'Một nơi trong chuyến đi cũ bạn muốn quay lại?',
  'Lúc buồn, bạn muốn mình lắng nghe hay cùng tìm cách giải quyết?',
  'Một điều chúng mình đã cùng vượt qua mà bạn muốn ghi nhớ?',
  'Bạn muốn dành thêm thời gian cho điều gì?',
  'Bạn thấy chúng mình giống nhau ở điểm nào?',
  'Một khác biệt của chúng mình mà bạn trân trọng?',
  'Một lời hẹn nhỏ bạn muốn dành cho tuần tới?',
  'Bạn muốn được hỏi thăm như thế nào vào cuối ngày?',
  'Một mùi hương hay âm thanh khiến bạn nhớ đến một kỉ niệm?',
  'Nếu gửi một tấm bưu thiếp cho mình, bạn sẽ viết gì?',
  'Một bức ảnh bạn muốn in ra để giữ?',
  'Hôm nay bạn cần một cái ôm hay một khoảng yên tĩnh?',
  'Một điều bạn muốn học cùng mình?',
  'Bạn muốn chuyến đi tiếp theo có cảm giác như thế nào?',
  'Một điều ngẫu nhiên bạn vừa nghĩ đến và muốn kể?',
  'Mình có thể giúp bạn nghỉ ngơi tốt hơn như thế nào?',
  'Bạn muốn chúng mình giữ thói quen nào trong nhiều năm nữa?',
  'Một điều bạn thấy chúng mình đã làm tốt hơn trước?',
  'Một câu nói của mình mà bạn còn nhớ?',
  'Một trò chơi bạn muốn chơi cùng mình?',
  'Bạn muốn lưu lại âm thanh nào của cuộc sống hiện tại?',
  'Một điều dễ thương bạn nhận ra về chúng mình gần đây?',
  'Nếu đặt tên cho chương hiện tại của chúng mình, bạn sẽ đặt gì?',
  'Bạn muốn nhắn gì với chúng mình của một năm sau?',
  'Hôm nay bạn muốn dành cho mình một lời thương nào?',
] as const;
