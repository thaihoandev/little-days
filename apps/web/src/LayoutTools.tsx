import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  type Album,
  type Page,
  type ScrapElement,
  type LayoutTemplate,
} from '../../../packages/domain/index.js';
import {
  alignElements,
  cloneLayout,
  expandSelection,
  reorderElements,
  type Alignment,
} from '../../../packages/domain/layout.js';
import { api } from './api.js';
import { PagePreview } from './Viewer.js';
import { builtInTemplates, templatePage } from '../../../packages/domain/templates.js';

export function SelectionTools({
  page,
  ids,
  onChange,
  onSelect,
}: {
  page: Page;
  ids: string[];
  onChange: (elements: ScrapElement[]) => void;
  onSelect: (ids: string[]) => void;
}) {
  const chosen = page.elements.filter((e) => ids.includes(e.id));
  const locked = chosen.some((e) => e.locked);
  const grouped = chosen.some((e) => e.groupId);
  const apply = (patch: Partial<ScrapElement>) =>
    onChange(page.elements.map((e) => (ids.includes(e.id) ? { ...e, ...patch } : e)));
  const duplicate = () => {
    if (page.elements.length + chosen.length > 50) return;
    const copies = cloneLayout({ ...page, elements: chosen }).elements.map((e) => ({
      ...e,
      x: Math.min(2000, e.x + 20),
      y: Math.min(2500, e.y + 20),
      locked: false,
    }));
    onChange([...page.elements, ...copies]);
    onSelect(copies.map((e) => e.id));
  };
  return (
    <section className="selection-tools" aria-label="Chỉnh bố cục">
      <p className="small" role="status">
        Đã chọn {chosen.length} phần tử{locked ? ' · Có phần tử khóa' : ''}
      </p>
      <div className="layout-actions">
        <button
          className="button quiet"
          disabled={chosen.length < 2 || locked}
          onClick={() => apply({ groupId: crypto.randomUUID() })}
        >
          Nhóm
        </button>
        <button
          className="button quiet"
          disabled={!grouped || locked}
          onClick={() => apply({ groupId: null })}
        >
          Bỏ nhóm
        </button>
        <button className="button quiet" onClick={() => apply({ locked: !locked })}>
          {locked ? 'Mở khóa lựa chọn' : 'Khóa lựa chọn'}
        </button>
        <button
          className="button quiet"
          onClick={() => apply({ visible: chosen.some((e) => e.visible === false) })}
        >
          {chosen.some((e) => e.visible === false) ? 'Hiện lựa chọn' : 'Ẩn lựa chọn'}
        </button>
      </div>
      <h4>Căn chỉnh</h4>
      <div className="layout-actions">
        {(
          [
            ['left', 'Căn trái'],
            ['center', 'Căn giữa ngang'],
            ['right', 'Căn phải'],
            ['top', 'Căn trên'],
            ['middle', 'Căn giữa dọc'],
            ['bottom', 'Căn dưới'],
            ['horizontal', 'Chia đều ngang'],
            ['vertical', 'Chia đều dọc'],
            ['page-center', 'Giữa trang'],
          ] as [Alignment, string][]
        ).map(([action, label]) => (
          <button
            key={action}
            className="button quiet"
            disabled={
              locked ||
              ((action === 'horizontal' || action === 'vertical') &&
                new Set(chosen.map((e) => e.groupId || e.id)).size < 3)
            }
            onClick={() => onChange(alignElements(page.elements, ids, action))}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="muted small">
        Căn theo vùng chọn; một nhóm được căn như một khối. Chọn một phần tử để căn theo trang.
      </p>
      <div className="layout-actions">
        <button
          className="button quiet"
          disabled={locked}
          onClick={() => onChange(reorderElements(page.elements, ids, 'up'))}
        >
          Lên một lớp
        </button>
        <button
          className="button quiet"
          disabled={locked}
          onClick={() => onChange(reorderElements(page.elements, ids, 'down'))}
        >
          Xuống một lớp
        </button>
        <button
          className="button quiet"
          disabled={page.elements.length + chosen.length > 50}
          onClick={duplicate}
        >
          Nhân bản lựa chọn
        </button>
        <button
          className="button danger"
          disabled={locked}
          onClick={() => {
            onChange(page.elements.filter((e) => !ids.includes(e.id)));
            onSelect([]);
          }}
        >
          Xóa lựa chọn
        </button>
      </div>
    </section>
  );
}

export function Layers({
  page,
  selected,
  onSelect,
  onChange,
}: {
  page: Page;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onChange: (elements: ScrapElement[]) => void;
}) {
  return (
    <div className="layer-list">
      <p className="muted small">
        Lớp trên cùng nằm trước. Giữ Shift để chọn thêm. Nhóm được chọn cùng nhau.
      </p>
      <button
        className="button quiet"
        onClick={() =>
          onSelect(
            expandSelection(
              page.elements,
              page.elements.filter((e) => !e.locked && e.visible !== false).map((e) => e.id),
            ),
          )
        }
      >
        Chọn tất cả
      </button>
      {[...page.elements].reverse().map((e) => (
        <div key={e.id} className={'layer-row ' + (selected.includes(e.id) ? 'is-selected' : '')}>
          <input
            type="checkbox"
            aria-label={'Chọn lớp ' + (e.text || e.type)}
            checked={selected.includes(e.id)}
            onChange={() => {
              const ids = expandSelection(page.elements, [e.id]);
              onSelect(
                ids.every((id) => selected.includes(id))
                  ? selected.filter((id) => !ids.includes(id))
                  : [...new Set([...selected, ...ids])],
              );
            }}
          />
          <button
            className="layer-name"
            aria-pressed={selected.includes(e.id)}
            onClick={(ev) => {
              const ids = expandSelection(page.elements, [e.id]);
              onSelect(
                ev.shiftKey
                  ? ids.every((id) => selected.includes(id))
                    ? selected.filter((id) => !ids.includes(id))
                    : [...new Set([...selected, ...ids])]
                  : ids,
              );
            }}
          >
            {e.groupId ? '▦ ' : ''}
            {e.text.slice(0, 38) ||
              { image: 'Ảnh', text: 'Chữ', sticker: 'Sticker', anniversary: 'Ngày kỉ niệm' }[
                e.type
              ]}
          </button>
          <button
            className="icon-button tiny"
            aria-label={(e.visible === false ? 'Hiện ' : 'Ẩn ') + e.text}
            onClick={() =>
              onChange(
                page.elements.map((other) =>
                  other.id === e.id ? { ...other, visible: e.visible === false } : other,
                ),
              )
            }
          >
            {e.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button
            className="icon-button tiny"
            aria-label={(e.locked ? 'Mở khóa ' : 'Khóa ') + e.text}
            onClick={() => {
              const ids = expandSelection(page.elements, [e.id]);
              onChange(
                page.elements.map((other) =>
                  ids.includes(other.id) ? { ...other, locked: !e.locked } : other,
                ),
              );
            }}
          >
            {e.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
        </div>
      ))}
    </div>
  );
}

export function TemplateLibrary({
  album,
  page,
  onApply,
  onError,
}: {
  album: Album;
  page: Page;
  onApply: (page: Page) => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<LayoutTemplate[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<LayoutTemplate[]>('/templates')
      .then((items) => {
        if (active) setItems(items);
      })
      .catch((e) => {
        if (active) onError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="personal-templates">
      <h4>Mẫu có sẵn</h4>
      <div className="builtin-template-library">
        {builtInTemplates.map((template) => (
          <button
            key={template.id}
            className="builtin-template-card"
            aria-label={'Thêm trang từ mẫu ' + template.name}
            disabled={busy || album.pages.length >= 20}
            onClick={() =>
              onApply(
                templatePage(
                  template.id,
                  album.assets.map((a) => a.id),
                ),
              )
            }
          >
            <PagePreview album={{ ...album, pages: [templatePage(template.id)] }} width={85} />
            <span>
              <strong>{template.name}</strong>
              <small>{template.description}</small>
            </span>
          </button>
        ))}
      </div>
      <h4>Mẫu của bạn</h4>
      <p className="muted small">
        Lưu bố cục, chữ, nhóm và hiệu ứng. Khi thêm trang, ảnh được lấy lần lượt từ album hiện tại;
        nếu chưa có ảnh, khung ảnh sẽ để trống.
      </p>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const item = await api<LayoutTemplate>('/templates', {
              method: 'POST',
              body: JSON.stringify({ name, page }),
            });
            setItems((prev) => [item, ...prev]);
            setName('');
          });
        }}
      >
        <label>
          Tên mẫu cá nhân
          <input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="button quiet" disabled={busy || !name.trim()}>
          Lưu trang thành mẫu
        </button>
      </form>
      <div className="personal-template-list">
        {items.map((item) => {
          let photoIndex = 0;
          const preview = {
            ...item.page,
            elements: item.page.elements.map((e) => ({
              ...e,
              assetId:
                e.type === 'image'
                  ? album.assets[photoIndex++ % Math.max(1, album.assets.length)]?.id || null
                  : e.assetId,
            })),
          };
          return (
            <div className="personal-template" key={item.id}>
              <PagePreview album={{ ...album, pages: [preview] }} width={100} />
              <strong>{item.name}</strong>
              <button
                className="button quiet"
                disabled={busy || album.pages.length >= 20}
                onClick={() =>
                  onApply({
                    ...cloneLayout(
                      item.page,
                      album.assets.map((a) => a.id),
                    ),
                    title: item.name,
                  })
                }
              >
                Thêm trang từ {item.name}
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api('/templates/' + item.id, { method: 'DELETE' });
                    setItems((prev) => prev.filter((t) => t.id !== item.id));
                  })
                }
              >
                Xóa mẫu {item.name}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
