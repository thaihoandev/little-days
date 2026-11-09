import { useEffect, useState } from 'react';
import {
  questionTopics,
  type QuestionPreferences,
} from '../../../packages/domain/question-catalog.js';
import { api } from './api.js';
export function QuestionTopics({
  space,
  value,
  onSaved,
}: {
  space: string;
  value: QuestionPreferences;
  onSaved: () => Promise<void>;
}) {
  const [excluded, setExcluded] = useState(value.excluded),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => setExcluded(value.excluded), [value.revision]);
  return (
    <details className="question-topics">
      <summary>Chủ đề của hai đứa</summary>
      <p>Chủ đề được chọn dùng chung từ ngày mai. Câu đã có người trả lời luôn giữ nguyên.</p>
      <fieldset disabled={busy}>
        <legend>Chọn chủ đề muốn nhận</legend>
        {(Object.keys(questionTopics) as (keyof typeof questionTopics)[]).map((topic) => (
          <label key={topic}>
            <input
              type="checkbox"
              checked={!excluded.includes(topic)}
              onChange={(e) =>
                setExcluded((old) =>
                  e.target.checked ? old.filter((x) => x !== topic) : [...old, topic],
                )
              }
            />
            {questionTopics[topic]}
          </label>
        ))}
      </fieldset>
      <button
        className="button quiet"
        disabled={busy || excluded.length === 4}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await api('/together/' + space + '/question-preferences', {
              method: 'PATCH',
              body: JSON.stringify({ expectedRevision: value.revision, excluded }),
            });
            await onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Lưu chủ đề từ ngày mai
      </button>
      {value.effectiveDate && (
        <p>Đợt chọn gần nhất áp dụng từ {value.effectiveDate.split('-').reverse().join('/')}.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
