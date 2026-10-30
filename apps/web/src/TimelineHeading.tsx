import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  defaultTimelineHeading,
  type TimelineHeading as Heading,
} from '../../../packages/domain/journal.js';
import { api } from './api.js';
export function TimelineHeading() {
  const [heading, setHeading] = useState<Heading>(defaultTimelineHeading),
    [draft, setDraft] = useState(defaultTimelineHeading),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const load = async () => {
    setBusy(true);
    try {
      const value = await api<Heading>('/timeline-heading');
      setHeading(value);
      setDraft(value);
      setReady(true);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    api<Heading>('/timeline-heading')
      .then((value) => {
        if (active) {
          setHeading(value);
          setDraft(value);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="timeline-heading-edit">
      {editing ? (
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const saved = await api<Heading>('/timeline-heading', {
                method: 'PATCH',
                body: JSON.stringify({
                  expectedRevision: heading.revision,
                  content: { title: draft.title, description: draft.description },
                }),
              });
              setHeading(saved);
              setEditing(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Tiêu đề dòng thời gian
            <input
              aria-label="Tiêu đề dòng thời gian"
              autoFocus
              required
              maxLength={160}
              disabled={busy}
              value={draft.title}
              onChange={(e) => setDraft((old) => ({ ...old, title: e.target.value }))}
            />
          </label>
          <label>
            Mô tả dòng thời gian
            <textarea
              aria-label="Mô tả dòng thời gian"
              rows={3}
              maxLength={600}
              disabled={busy}
              value={draft.description}
              onChange={(e) => setDraft((old) => ({ ...old, description: e.target.value }))}
            />
          </label>
          <div className="row">
            <button className="button primary" disabled={busy || !draft.title.trim()}>
              Lưu tiêu đề timeline
            </button>
            <button
              type="button"
              className="button quiet"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError('');
              }}
            >
              Hủy
            </button>
          </div>
        </form>
      ) : (
        <>
          <h1>{heading.title}</h1>
          <p>{heading.description}</p>
          <button
            className="text-button"
            disabled={busy || !ready}
            onClick={() => {
              setDraft(heading);
              setEditing(true);
            }}
          >
            <Pencil size={14} />
            Sửa tiêu đề và mô tả
          </button>
        </>
      )}
      {error && (
        <div role="alert">
          <p className="error">{error}</p>
          <button type="button" className="text-button" disabled={busy} onClick={() => void load()}>
            Tải lại nội dung mới
          </button>
        </div>
      )}
    </div>
  );
}
