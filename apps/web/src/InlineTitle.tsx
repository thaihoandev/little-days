import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
export function InlineTitle({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(value);
  const canceled = useRef(false);
  if (!editing)
    return (
      <button
        className="inline-album-title"
        title="Đổi tên sổ"
        aria-label="Đổi tên sổ"
        onClick={() => {
          setDraft(value);
          canceled.current = false;
          setEditing(true);
        }}
      >
        <strong>{value}</strong>
        <Pencil size={14} />
      </button>
    );
  const save = () => {
    if (!canceled.current && draft.trim() && draft.trim() !== value) onSave(draft.trim());
    setEditing(false);
  };
  return (
    <input
      className="inline-title-input"
      aria-label="Tên sổ trên header"
      autoFocus
      maxLength={120}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          canceled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
