import { useState, type FormEvent } from 'react';
import { Check, LoaderCircle, Plus } from 'lucide-react';
import { Modal } from './Modal.js';
import { api } from './api.js';
import { type Album, type Theme, createAlbumContent } from '../../../packages/domain/index.js';
import { builtInTemplates, templatePage } from '../../../packages/domain/templates.js';
import { PagePreview } from './Viewer.js';

export function CreateModal({
  onClose,
  onCreated,
  presentationEnabled,
  designExperienceEnabled,
}: {
  onClose: () => void;
  onCreated: (album: Album) => void;
  presentationEnabled: boolean;
  designExperienceEnabled: boolean;
}) {
  const [title, setTitle] = useState('Ngày mình bên nhau');
  const [theme, setTheme] = useState<Theme>('polaroid');
  const [templateId, setTemplateId] = useState('polaroid');
  const [kind, setKind] = useState<'album' | 'invitation'>('album');
  const [readingMode, setReadingMode] = useState<'book' | 'scroll'>('book');
  const previewAlbum: Album = {
    ...createAlbumContent(),
    id: 'preview',
    revision: 0,
    createdAt: '',
    updatedAt: '',
    assets: [],
    schemaVersion: 1,
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      onCreated(
        await api<Album>('/albums', {
          method: 'POST',
          body: JSON.stringify({
            title,
            theme,
            templateId,
            ...(presentationEnabled ? { documentKind: kind } : {}),
            ...(designExperienceEnabled
              ? { readingMode: kind === 'invitation' ? readingMode : 'book' }
              : {}),
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Bắt đầu một cuốn sổ" onClose={onClose} className="create-album-modal">
      <form onSubmit={(e) => void submit(e)} className="form-stack">
        <div className="create-album-fields">
          {designExperienceEnabled && kind === 'invitation' && (
            <label>
              Cách đọc thiệp
              <select
                aria-label="Cách đọc thiệp"
                value={readingMode}
                onChange={(e) => setReadingMode(e.target.value as 'book' | 'scroll')}
              >
                <option value="book">Lật từng trang</option>
                <option value="scroll">Thiệp dài · cuộn dọc</option>
              </select>
            </label>
          )}
          {presentationEnabled && (
            <div className="document-kind-picker" role="group" aria-label="Loại thiết kế">
              {(['album', 'invitation'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => {
                    setKind(value);
                    setTemplateId(value === 'album' ? 'polaroid' : 'invite-date');
                    setTheme(value === 'album' ? 'polaroid' : 'letter');
                    setTitle(value === 'album' ? 'Ngày mình bên nhau' : 'Một lời mời dành cho bạn');
                  }}
                >
                  {value === 'album' ? 'Sổ kỉ niệm' : 'Thiệp mời'}
                </button>
              ))}
            </div>
          )}
          <label>
            Tên cuốn sổ
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>Chọn một phong cách</label>
          <div className="template-picker">
            {builtInTemplates
              .filter((t) => t.id.startsWith('invite-') === (kind === 'invitation'))
              .map((t) => (
                <button
                  type="button"
                  key={t.id}
                  aria-label={t.name}
                  aria-pressed={templateId === t.id}
                  className={templateId === t.id ? 'chosen' : ''}
                  onClick={() => {
                    setTheme(t.theme);
                    setTemplateId(t.id);
                  }}
                >
                  <span className="built-in-preview">
                    <PagePreview
                      album={{ ...previewAlbum, pages: [templatePage(t.id)] }}
                      width={105}
                    />
                  </span>
                  <span className="template-name">{t.name}</span>
                  {templateId === t.id && <Check size={15} />}
                </button>
              ))}
          </div>
          <p className="muted small">
            Bạn có thể đổi ảnh, chữ và bố cục từng trang sau khi chọn mẫu.
          </p>
          {error && <p className="error">{error}</p>}
        </div>
        <button className="button primary full" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}Tạo cuốn sổ của
          mình
        </button>
      </form>
    </Modal>
  );
}
