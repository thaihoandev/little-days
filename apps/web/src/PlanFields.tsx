import { Plus, Trash2, CheckCheck } from 'lucide-react';
import type { JournalContent, TimelineSpace } from '../../../packages/domain/journal.js';

export function PlanFields({
  value,
  members,
  onChange,
}: {
  value: NonNullable<JournalContent['plan']>;
  members: TimelineSpace['members'];
  onChange: (value: NonNullable<JournalContent['plan']>) => void;
}) {
  const update = (id: string, patch: Partial<(typeof value.checklist)[number]>) =>
    onChange({
      ...value,
      checklist: value.checklist.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    });
  return (
    <section className="plan-editor" aria-label="Kế hoạch dành cho hai người">
      <header>
        <CheckCheck size={19} />
        <strong>Cùng chuẩn bị</strong>
        <span>
          {value.checklist.filter((t) => t.done).length}/{value.checklist.length}
        </span>
      </header>
      <label>
        Trạng thái kế hoạch
        <select
          aria-label="Trạng thái kế hoạch"
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as typeof value.status })}
        >
          <option value="planned">Dự định</option>
          <option value="completed">Đã hoàn thành</option>
        </select>
      </label>
      <div className="plan-tasks">
        {value.checklist.map((task, index) => (
          <div className="plan-task-editor" key={task.id}>
            <input
              type="checkbox"
              aria-label={'Hoàn thành công việc ' + (index + 1)}
              checked={task.done}
              onChange={(e) => update(task.id, { done: e.target.checked })}
            />
            <input
              required
              aria-label={'Công việc ' + (index + 1)}
              value={task.text}
              maxLength={200}
              placeholder="Chuẩn bị điều gì?"
              onChange={(e) => update(task.id, { text: e.target.value })}
            />
            <select
              aria-label={'Người phụ trách công việc ' + (index + 1)}
              value={task.assigneeId || ''}
              onChange={(e) => update(task.id, { assigneeId: e.target.value || null })}
            >
              <option value="">Cả hai / chưa phân công</option>
              {task.assigneeId && !members.some((m) => m.id === task.assigneeId) && (
                <option value={task.assigneeId}>Thành viên không còn tham gia</option>
              )}
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button"
              aria-label={'Xóa công việc ' + (index + 1)}
              onClick={() =>
                onChange({ ...value, checklist: value.checklist.filter((t) => t.id !== task.id) })
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="button quiet"
        disabled={value.checklist.length >= 50}
        onClick={() =>
          onChange({
            ...value,
            checklist: [
              ...value.checklist,
              { id: crypto.randomUUID(), text: '', done: false, assigneeId: null },
            ],
          })
        }
      >
        <Plus size={15} />
        Thêm công việc
      </button>
      <p className="muted small">
        Hai người cùng cập nhật danh sách này. Sau buổi hẹn, thêm ảnh và lưu thành kỉ niệm.
      </p>
    </section>
  );
}
