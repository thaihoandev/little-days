import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Album as AlbumIcon,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  Film,
  Flower2,
  Heart,
  History,
  HelpCircle,
  ImagePlus,
  Images,
  LayoutTemplate,
  LoaderCircle,
  Lock,
  LogOut,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  Type,
  Unlock,
  UserRound,
  X,
} from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import {
  type Album,
  type Memory,
  type Page,
  type ScrapElement,
  type Theme,
  assetUrl,
  createAlbumContent,
  daysTogether,
  element,
  nextAnnual,
  stickerOptions,
  themeNames,
  todayIn,
} from '../../../packages/domain/index.js';
import { api, ApiError } from './api.js';
import { SelectionTools, Layers, TemplateLibrary } from './LayoutTools.js';
import {
  expandSelection,
  translated,
  cloneLayout,
  alignElements,
} from '../../../packages/domain/layout.js';
import { useDocument } from './useDocument.js';
import AccountDeletionStatus, { readDeletionReceipt } from './AccountDeletionStatus.js';
import { readAuthLink } from './auth-link.js';
import { TextOverflowWarning } from './TextOverflowWarning.js';
import JournalDashboard from './JournalDashboard.js';
import { ConfirmDialog, PhotoLightbox } from './Overlays.js';
import { decorationCatalog } from '../../../packages/domain/decorations.js';
import {
  counterPresets,
  counterPreset,
  textPresets,
  textPreset,
} from '../../../packages/domain/presets.js';
import { counterStyleNames } from '../../../packages/domain/counter.js';
import { ElementContent } from '../../../packages/scrapbook-renderer/index.js';
import { LegalLinks } from './LegalLinks.js';
import { builtInTemplates, templatePage } from '../../../packages/domain/templates.js';
import type { PublicUser } from './AccountSettings.js';
const AccountSettings = lazy(() => import('./AccountSettings.js'));
const AuthLinkPage = lazy(() => import('./AuthLinkPage.js'));
const CanvasEditor = lazy(() =>
  import('./CanvasEditor.js').then((m) => ({ default: m.CanvasEditor })),
);
import { PagePreview, Viewer } from './Viewer.js';
const VideoModal = lazy(() => import('./VideoModal.js'));
const VersionHistory = lazy(() => import('./VersionHistory.js'));
type User = PublicUser;

function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const first = ref.current?.querySelector<HTMLElement>('input,button,textarea,select');
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,textarea,select,a[href]',
          ) || [],
        );
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className={`modal ${wide ? 'wide' : ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Đóng">
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [deletionReceipt, setDeletionReceipt] = useState(readDeletionReceipt);
  const [authLink, setAuthLink] = useState(readAuthLink);
  const [accountMode, setAccountMode] = useState<'register' | 'login'>('register');
  const [user, setUser] = useState<User | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [active, setActive] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState<'create' | 'account' | 'help' | null>(null);
  const [section, setSection] = useState<'home' | 'timeline' | 'calendar' | 'albums' | 'photos'>(
    'home',
  );
  const [shared, setShared] = useState<Album | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{
    photos: Album['assets'];
    index: number;
  } | null>(null);
  const token = new URLSearchParams(location.search).get('share');
  const notify = (message: string) => setToast(message);
  const load = async () => {
    setError('');
    try {
      if (token) {
        setShared(await api<Album>(`/shared/${encodeURIComponent(token)}`));
        return;
      }
      const session = await api<User>('/session');
      const library = await api<Album[]>('/albums');
      setUser(session);
      setAlbums(library);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!authLink) void load();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  if (authLink)
    return (
      <Suspense fallback={<div className="loading-screen">Đang mở tài khoản…</div>}>
        <AuthLinkPage
          link={authLink}
          onContinue={() => {
            setAuthLink(null);
            setAccountMode('login');
            setModal('account');
            void load();
          }}
        />
      </Suspense>
    );
  if (loading)
    return (
      <div className="loading-screen">
        <span className="wordmark">
          little days<span>♡</span>
        </span>
        <LoaderCircle className="spin" />
        <p>Đang mở cuốn sổ của bạn…</p>
      </div>
    );
  if (token)
    return shared ? (
      <MotionConfig reducedMotion="user">
        <Viewer album={shared} />
      </MotionConfig>
    ) : (
      <div className="loading-screen">
        <Heart />
        <h2>Chưa mở được cuốn sổ này</h2>
        <p>{error}</p>
        <a href="/" className="button primary">
          Về trang chủ
        </a>
      </div>
    );
  if (active && user)
    return (
      <MotionConfig reducedMotion="user">
        <Editor
          key={active.id}
          initial={active}
          userId={user.id}
          notify={notify}
          onBack={() => {
            setActive(null);
            void load();
          }}
        />
        {toast && (
          <div className="toast" role="status">
            <Check size={16} />
            {toast}
          </div>
        )}
      </MotionConfig>
    );
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <aside className="sidebar">
          <a href="/" className="wordmark">
            little days<span>♡</span>
          </a>
          <div className="workspace-label">GÓC NHỎ CỦA BẠN</div>
          <nav>
            <button
              className={section === 'home' ? 'nav-item active' : 'nav-item'}
              onClick={() => setSection('home')}
            >
              <Heart size={19} />
              Hôm nay
            </button>
            <button
              className={section === 'timeline' ? 'nav-item active' : 'nav-item'}
              onClick={() => setSection('timeline')}
            >
              <History size={19} />
              Dòng thời gian
            </button>
            <button
              className={section === 'calendar' ? 'nav-item active' : 'nav-item'}
              onClick={() => setSection('calendar')}
            >
              <CalendarDays size={19} />
              Lịch của mình
            </button>
            <button
              className={section === 'albums' ? 'nav-item active' : 'nav-item'}
              onClick={() => setSection('albums')}
            >
              <AlbumIcon size={19} />
              Album của mình<span>{albums.length}</span>
            </button>
            <button
              className={section === 'photos' ? 'nav-item active' : 'nav-item'}
              onClick={() => setSection('photos')}
            >
              <Images size={19} />
              Ảnh đã lưu
            </button>
          </nav>
          <div className="sidebar-note">
            <Flower2 size={30} />
            <p>
              Điều nhỏ xíu hôm nay,
              <br />
              kỉ niệm thật lâu sau này.
            </p>
            <span className="hand">giữ lại một chút thương ♡</span>
          </div>
          <div className="sidebar-bottom">
            <button className="nav-item" onClick={() => setModal('help')}>
              <HelpCircle size={18} />
              Một chút hướng dẫn
            </button>
            <button
              className="account-button"
              aria-label="Tài khoản cá nhân"
              onClick={() => setModal('account')}
            >
              <span className="avatar">
                <UserRound size={19} />
              </span>
              <span>
                <strong>{user?.email?.split('@')[0] || 'Góc riêng của bạn'}</strong>
                <small>{user?.email ? 'Tài khoản cá nhân' : 'Đăng ký để giữ tài khoản'}</small>
              </span>
              <ChevronDown size={15} />
            </button>
          </div>
        </aside>
        <main className="dashboard">
          {deletionReceipt && (
            <AccountDeletionStatus
              receipt={deletionReceipt}
              onDismiss={() => {
                setDeletionReceipt(null);
                try {
                  sessionStorage.removeItem('scrapbook-deletion-receipt');
                } catch {}
              }}
            />
          )}
          <header className="dashboard-top">
            <span>Mỗi ngày bên nhau đều đáng nhớ.</span>
            <button
              className="icon-button"
              aria-label="Tài khoản"
              onClick={() => setModal('account')}
            >
              <UserRound size={19} />
            </button>
          </header>
          {user && ['home', 'timeline', 'calendar'].includes(section) && (
            <JournalDashboard
              key={user.id}
              albums={albums}
              mode={section as 'home' | 'timeline' | 'calendar'}
              onOpenAlbum={setActive}
              onCreatedAlbum={(album) => {
                setAlbums((items) => [album, ...items]);
                setActive(album);
              }}
            />
          )}
          {section === 'albums' || section === 'home' ? (
            <>
              <motion.section
                className={section === 'home' ? 'welcome welcome-secondary' : 'welcome'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="welcome-copy">
                  <span className="eyebrow">
                    <span className="little-line" /> CHUYỆN CỦA CHÚNG MÌNH
                  </span>
                  <h1>
                    Những ngày bình thường,
                    <br />
                    <em>thương thật nhiều.</em>
                  </h1>
                  <p>
                    Gói ghém ảnh, lời nhắn và những lần cùng nhau.
                    <br />
                    Một cuốn scrapbook, một câu chuyện của riêng hai bạn.
                  </p>
                  <button className="button primary" onClick={() => setModal('create')}>
                    <Plus size={18} />
                    Bắt đầu một cuốn sổ
                  </button>
                  <div className="welcome-foot">
                    <Heart size={13} /> Tự tay sắp xếp. Tự mình kể chuyện.
                  </div>
                </div>
                <div className="hero-collage" aria-label="Minh họa scrapbook">
                  <span className="tape tape-one" />
                  <div className="hero-photo photo-back">
                    <img src="/illustrations/demo-2.svg" alt="Minh họa một buổi chiều bên biển" />
                    <span>một chiều bên nhau</span>
                  </div>
                  <div className="hero-photo photo-front">
                    <img src="/illustrations/demo-1.svg" alt="Minh họa một chuyến đi trên đồi" />
                    <span>đi đâu cũng được, cùng bạn.</span>
                  </div>
                  <span className="hero-doodle">✿</span>
                  <span className="hero-heart">♡</span>
                  <span className="hero-note">
                    our little
                    <br />
                    happy things
                  </span>
                  <span className="sample-label">Ảnh minh họa · thay bằng ảnh của hai bạn</span>
                </div>
              </motion.section>
              <section className="albums-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      Cuốn sổ của mình <span>{albums.length.toString().padStart(2, '0')}</span>
                    </h2>
                    <p>Mở một trang cũ, hay bắt đầu một câu chuyện mới.</p>
                  </div>
                  <button className="button quiet" onClick={() => setModal('create')}>
                    <Plus size={16} />
                    Tạo album
                  </button>
                </div>
                {error && (
                  <div className="error-banner">
                    {error}
                    <button onClick={() => void load()}>Thử lại</button>
                  </div>
                )}
                <div className="album-grid">
                  {albums.map((album) => (
                    <article className="album-card" key={album.id}>
                      <button
                        className="album-cover"
                        onClick={() => setActive(album)}
                        aria-label={`Mở ${album.title}`}
                      >
                        <div className="cover-preview">
                          <PagePreview album={album} width={246} />
                        </div>
                        <span className="cover-tag">{themeNames[album.theme]}</span>
                      </button>
                      <div className="album-info">
                        <button onClick={() => setActive(album)}>
                          <h3>{album.title}</h3>
                          <p>
                            {album.names.join(' & ')} <span>·</span> {album.pages.length} trang
                          </p>
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => setActive(album)}
                          aria-label="Mở album"
                        >
                          <ArrowRight size={18} />
                        </button>
                      </div>
                    </article>
                  ))}
                  <button className="new-album-card" onClick={() => setModal('create')}>
                    <span>
                      <Plus size={25} />
                    </span>
                    <h3>Một câu chuyện mới</h3>
                    <p>Chừa một chỗ cho những ngày đẹp.</p>
                    <small>
                      Tạo cuốn sổ đầu tiên <ArrowRight size={14} />
                    </small>
                  </button>
                </div>
              </section>
              <section className="recap-banner">
                <div className="recap-icon">
                  <Film size={29} />
                </div>
                <div>
                  <h3>Một cuốn sổ. Cả một thước phim.</h3>
                  <p>Biến những trang kỉ niệm thành video ngắn để xem lại, gửi nhau, giữ mãi.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => (albums.length ? setActive(albums[0]) : setModal('create'))}
                >
                  Khám phá <ArrowRight size={16} />
                </button>
              </section>
              <footer className="dashboard-footer">
                <span>Made for the little things.</span>
                <span>
                  Gom một chút thương, giữ một chút nhớ. <Heart size={13} />
                </span>
              </footer>
            </>
          ) : section === 'photos' ? (
            <section className="photos-dashboard">
              <span className="eyebrow">MỖI TẤM ẢNH, MỘT CÂU CHUYỆN</span>
              <h1>Ảnh đã lưu</h1>
              <p className="muted">Ảnh gốc của những ngày đáng nhớ, được tối ưu và lưu riêng tư.</p>
              <div className="photo-grid">
                {albums.flatMap((a) =>
                  a.assets.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() =>
                        setPhotoPreview({
                          photos: a.assets,
                          index: a.assets.findIndex((p) => p.id === asset.id),
                        })
                      }
                    >
                      <img src={asset.url} alt={asset.name} />
                      <span>{asset.name}</span>
                    </button>
                  )),
                )}
              </div>
              {!albums.some((a) => a.assets.length) && (
                <div className="empty-state">
                  <Images />
                  <h3>Chưa có ảnh nào ở đây</h3>
                  <p>Mở một album và thêm ảnh đầu tiên của hai bạn.</p>
                  <button className="button primary" onClick={() => setSection('albums')}>
                    Về album của mình
                  </button>
                </div>
              )}
            </section>
          ) : null}
          <div className="dashboard-legal">
            <LegalLinks />
          </div>
        </main>
      </div>
      {photoPreview && (
        <PhotoLightbox
          {...photoPreview}
          onIndex={(index) => setPhotoPreview({ ...photoPreview, index })}
          onClose={() => setPhotoPreview(null)}
        />
      )}
      {modal === 'create' && (
        <CreateModal
          onClose={() => setModal(null)}
          onCreated={(album) => {
            setAlbums((a) => [album, ...a]);
            setActive(album);
            setModal(null);
          }}
        />
      )}
      {modal === 'account' && (
        <AccountModal
          user={user}
          initialMode={accountMode}
          onClose={() => setModal(null)}
          onChange={(message, receipt) => {
            if (receipt) {
              setDeletionReceipt(receipt);
              try {
                sessionStorage.setItem('scrapbook-deletion-receipt', receipt);
              } catch {}
            }
            setUser(null);
            setActive(null);
            setAlbums([]);
            setLoading(true);
            setModal(null);
            if (message) notify(message);
            void load();
          }}
        />
      )}
      {modal === 'help' && (
        <Modal title="Một chút hướng dẫn" onClose={() => setModal(null)}>
          <div className="help-content">
            <p>
              <strong>1. Tạo cuốn sổ.</strong> Chọn mẫu và điền ngày bắt đầu của hai bạn.
            </p>
            <p>
              <strong>2. Kể chuyện theo cách của mình.</strong> Thêm ảnh, chữ, sticker; kéo, xoay và
              sắp xếp từng món trên trang.
            </p>
            <p>
              <strong>3. Giữ lại.</strong> Thay đổi tự lưu. Bạn có thể xem album, tạo link chỉ đọc
              hoặc xuất video 15–60 giây.
            </p>
            <p className="notice">
              Phiên khách gắn với trình duyệt. Hãy đăng ký tài khoản trước khi đổi thiết bị hoặc xóa
              dữ liệu trình duyệt.
            </p>
            <p className="small muted">
              Ảnh trong mẫu là tranh minh họa. Hãy thay bằng ảnh của hai bạn để cuốn sổ trở thành
              của riêng mình.
            </p>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </MotionConfig>
  );
}

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (album: Album) => void;
}) {
  const [title, setTitle] = useState('Ngày mình bên nhau');
  const [theme, setTheme] = useState<Theme>('polaroid');
  const [templateId, setTemplateId] = useState('polaroid');
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
          body: JSON.stringify({ title, theme, templateId }),
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
            {builtInTemplates.map((t) => (
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

function AccountModal({
  user,
  onClose,
  onChange,
  initialMode,
}: {
  user: User | null;
  onClose: () => void;
  onChange: (message?: string, receipt?: string) => void;
  initialMode: 'register' | 'login';
}) {
  return (
    <Modal
      title={user?.email ? 'Tài khoản của bạn' : 'Giữ lại góc riêng của mình'}
      onClose={onClose}
    >
      <Suspense fallback={<p>Đang mở tài khoản…</p>}>
        <AccountSettings user={user} onChange={onChange} initialMode={initialMode} />
      </Suspense>
    </Modal>
  );
}

function Editor({
  initial,
  userId,
  onBack,
  notify,
}: {
  initial: Album;
  userId: string;
  onBack: () => void;
  notify: (s: string) => void;
}) {
  const doc = useDocument(initial, userId);
  const { album } = doc;
  const [pageId, setPageId] = useState(album.pages[0].id);
  const page = album.pages.find((p) => p.id === pageId) || album.pages[0];
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsHere = selectedIds.filter((id) => page.elements.some((e) => e.id === id));
  const selected = selectedIdsHere.length === 1 ? selectedIdsHere[0] : null;
  const selectedElement = page.elements.find((e) => e.id === selected);
  const setSelected = (id: string | null) => setSelectedIds(id ? [id] : []);
  useEffect(() => {
    setSelectedIds([]);
  }, [page.id]);
  const changeElements = (elements: ScrapElement[]) =>
    doc.edit((a) => ({
      ...a,
      pages: a.pages.map((p) => (p.id === page.id ? { ...p, elements } : p)),
    }));
  const [panel, setPanel] = useState<
    'pages' | 'photos' | 'decorations' | 'memories' | 'settings' | 'layers'
  >('pages');
  const [zoom, setZoom] = useState(1);
  const [viewer, setViewer] = useState(false);
  const [video, setVideo] = useState<Album | null>(null);
  const [share, setShare] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [localError, setLocalError] = useState('');
  const localMaintenanceError = useRef<string | null>(null);
  const reportLocalError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Có lỗi xử lý. Vui lòng thử lại.';
    localMaintenanceError.current =
      error instanceof ApiError && error.status === 503 && error.code === 'BACKUP_IN_PROGRESS'
        ? message
        : null;
    setLocalError(message);
  };
  useEffect(() => {
    if (doc.status !== 'saved' || !localMaintenanceError.current) return;
    const message = localMaintenanceError.current;
    localMaintenanceError.current = null;
    setLocalError((previous) => (previous === message ? '' : previous));
  }, [doc.status]);
  const [editText, setEditText] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pageToDelete, setPageToDelete] = useState<string | null>(null);
  const [decorationCollection, setDecorationCollection] = useState('Tất cả');
  const [reference, setReference] = useState(todayIn(album.timezone));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setReference(todayIn(album.timezone)), 30000);
    return () => clearInterval(timer);
  }, [album.timezone]);
  const patch = (id: string, patch: Partial<ScrapElement>, group?: string) =>
    doc.edit(
      (a) => ({
        ...a,
        pages: a.pages.map((p) =>
          p.id === page.id
            ? { ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }
            : p,
        ),
      }),
      group,
    );
  const add = (e: ScrapElement) => {
    if (page.elements.length >= 50) {
      notify('Mỗi trang tối đa 50 phần tử.');
      return;
    }
    doc.edit((a) => ({
      ...a,
      pages: a.pages.map((p) => (p.id === page.id ? { ...p, elements: [...p.elements, e] } : p)),
    }));
    setSelected(e.id);
  };
  const remove = () => {
    if (page.elements.some((e) => selectedIdsHere.includes(e.id) && e.locked)) return;
    changeElements(page.elements.filter((e) => !selectedIdsHere.includes(e.id)));
    setSelectedIds([]);
  };
  const deletePage = (id: string) => {
    if (album.pages.length <= 1) return;
    const target = album.pages.find((p) => p.id === id);
    if (!target) return;
    const remaining = album.pages.filter((p) => p.id !== id);
    doc.edit((a) => ({ ...a, pages: a.pages.filter((p) => p.id !== id) }));
    if (page.id === id) {
      setPageId(
        remaining[
          Math.min(
            album.pages.findIndex((p) => p.id === id),
            remaining.length - 1,
          )
        ].id,
      );
      setSelectedIds([]);
    }
    setPageToDelete(null);
  };
  const duplicateSelected = () => {
    const chosen = page.elements.filter((e) => selectedIdsHere.includes(e.id));
    if (!chosen.length) return;
    if (page.elements.length + chosen.length > 50) {
      notify('Mỗi trang tối đa 50 phần tử.');
      return;
    }
    const copies = cloneLayout({ ...page, elements: chosen }).elements.map((e) => ({
      ...e,
      x: Math.min(2000, e.x + 20),
      y: Math.min(2500, e.y + 20),
      locked: false,
    }));
    changeElements([...page.elements, ...copies]);
    setSelectedIds(copies.map((e) => e.id));
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (uploading || historyOpen || pageToDelete || document.querySelector('dialog[open]'))
        return;
      const tag = (e.target as HTMLElement).tagName;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ||
        (e.target as HTMLElement).isContentEditable ||
        viewer ||
        video ||
        editText
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedIdsHere.length) {
        e.preventDefault();
        duplicateSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? doc.redo() : doc.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doc.flush().catch(reportLocalError);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(
          expandSelection(
            page.elements,
            page.elements.filter((e) => e.visible !== false && !e.locked).map((e) => e.id),
          ),
        );
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (
          selectedIdsHere.length > 1 &&
          !page.elements.some((el) => selectedIdsHere.includes(el.id) && el.locked)
        ) {
          const groupId = e.shiftKey ? null : crypto.randomUUID();
          changeElements(
            page.elements.map((el) => (selectedIdsHere.includes(el.id) ? { ...el, groupId } : el)),
          );
        }
      }
      if (
        selectedIdsHere.length &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
      ) {
        e.preventDefault();
        const amount = e.shiftKey ? 10 : 1;
        changeElements(
          translated(
            page.elements,
            selectedIdsHere,
            e.key === 'ArrowRight' ? amount : e.key === 'ArrowLeft' ? -amount : 0,
            e.key === 'ArrowDown' ? amount : e.key === 'ArrowUp' ? -amount : 0,
          ),
        );
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  const safe = async (fn: () => Promise<void>) => {
    setLocalError('');
    localMaintenanceError.current = null;
    try {
      await fn();
    } catch (e) {
      reportLocalError(e);
    }
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    await safe(async () => {
      await doc.flush();
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        const updated = await api<Album>(`/albums/${album.id}/assets`, {
          method: 'POST',
          body: form,
        });
        doc.accept(updated);
      }
      notify('Ảnh đã được tối ưu và lưu. Chạm vào ảnh để thêm vào trang.');
    });
    setUploading(false);
    if (input.current) input.current.value = '';
  };
  const addPage = () => {
    if (album.pages.length >= 20) {
      notify('Album tối đa 20 trang.');
      return;
    }
    const next: Page = {
      id: crypto.randomUUID(),
      title: 'Trang mới',
      background: page.background,
      elements: [],
    };
    doc.edit((a) => ({ ...a, pages: [...a.pages, next] }));
    setPageId(next.id);
    setSelected(null);
  };
  const statusLabels = {
    saved: 'Đã lưu',
    dirty: 'Chưa lưu',
    saving: 'Đang lưu…',
    error: 'Lưu lại',
    conflict: 'Có xung đột',
  };
  const days = daysTogether(album.startDate, reference);
  const anniversary = nextAnnual(album.startDate, reference);
  return (
    <>
      <div
        className="editor-shell"
        inert={uploading || historyOpen || viewer}
        aria-busy={uploading}
      >
        <header className="editor-header">
          <div className="row">
            <button
              className="icon-button"
              aria-label="Về danh sách album"
              onClick={() =>
                void safe(async () => {
                  await doc.flush();
                  onBack();
                })
              }
            >
              <ArrowLeft size={19} />
            </button>
            <span className="header-divider" />
            <div>
              <strong>{album.title}</strong>
              <button
                className={`save-status ${doc.status}`}
                onClick={() =>
                  void safe(async () => {
                    await doc.flush();
                  })
                }
              >
                {doc.status === 'saved' ? (
                  <Check size={12} />
                ) : doc.status === 'saving' ? (
                  <LoaderCircle className="spin" size={12} />
                ) : (
                  <Save size={12} />
                )}{' '}
                {statusLabels[doc.status]}
              </button>
            </div>
          </div>
          <div className="row header-actions">
            <button
              className="icon-button"
              aria-label="Hoàn tác"
              disabled={!doc.canUndo}
              onClick={doc.undo}
            >
              <RotateCcw size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Làm lại"
              disabled={!doc.canRedo}
              onClick={doc.redo}
            >
              <RotateCw size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Lịch sử phiên bản"
              title="Lịch sử phiên bản"
              onClick={() =>
                void safe(async () => {
                  await doc.flush();
                  setHistoryOpen(true);
                })
              }
            >
              <History size={18} />
            </button>
            <span className="header-divider" />
            <button className="button quiet" aria-label="Xem album" onClick={() => setViewer(true)}>
              <Eye size={16} />
              <span>Xem album</span>
            </button>
            <button
              className="button quiet"
              aria-label="Chia sẻ"
              onClick={() =>
                void safe(async () => {
                  await doc.flush();
                  const result = await api<{ token: string }>(`/albums/${album.id}/share`, {
                    method: 'POST',
                  });
                  setShare(`${location.origin}/?share=${result.token}`);
                })
              }
            >
              <Share2 size={16} />
              <span>Chia sẻ</span>
            </button>
            <button
              className="button primary"
              aria-label="Tạo video"
              disabled={uploading}
              onClick={() =>
                void safe(async () => {
                  setVideo(await doc.flush());
                })
              }
            >
              <Film size={16} />
              <span>Tạo video</span>
            </button>
          </div>
        </header>
        {(localError || doc.error) && (
          <div className="error-banner" role="alert">
            {localError || doc.error}
            {doc.status === 'conflict' && (
              <button
                onClick={() => {
                  if (
                    confirm(
                      'Tải bản trên máy chủ? Bản nháp cục bộ vẫn được giữ để khôi phục khi mở lại album.',
                    )
                  )
                    void api<Album>(`/albums/${album.id}`).then(doc.accept);
                }}
              >
                Tải bản mới
              </button>
            )}
            <button aria-label="Đóng thông báo" onClick={() => setLocalError('')}>
              <X size={15} />
            </button>
          </div>
        )}
        {doc.draft && (
          <div className="draft-banner">
            Có bản nháp chưa được lưu từ lần trước.
            <button onClick={doc.restoreDraft}>Khôi phục</button>
            <button onClick={doc.discardDraft}>Bỏ bản nháp</button>
          </div>
        )}
        <div className="editor-workspace">
          <nav className="tool-rail" aria-label="Công cụ biên tập">
            {(
              [
                { id: 'pages', icon: LayoutTemplate, label: 'Trang sổ' },
                { id: 'photos', icon: Images, label: 'Ảnh' },
                { id: 'decorations', icon: Flower2, label: 'Trang trí' },
                { id: 'memories', icon: CalendarDays, label: 'Kỉ niệm' },
                { id: 'settings', icon: Settings2, label: 'Thiết lập' },
                { id: 'layers', icon: LayoutTemplate, label: 'Lớp' },
              ] as const
            ).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                className={panel === id ? 'active' : ''}
                onClick={() => setPanel(id)}
              >
                <Icon size={21} />
                <span>{label}</span>
              </button>
            ))}
            <span className="rail-flower">✿</span>
          </nav>
          <aside className="library-panel">
            <div className="panel-title">
              <h3>
                {
                  {
                    layers: 'Các lớp trên trang',
                    pages: 'Những trang thương',
                    photos: 'Ảnh của hai bạn',
                    decorations: 'Thêm một chút xinh',
                    memories: 'Những lần cùng nhau',
                    settings: 'Câu chuyện của mình',
                  }[panel]
                }
              </h3>
              <p>
                {
                  {
                    layers: 'Sắp xếp, ẩn và khóa từng chi tiết.',
                    pages: 'Mỗi trang, một điều muốn giữ.',
                    photos: 'Chọn ảnh để đặt vào trang sổ.',
                    decorations: 'Chữ, sticker và những lời thương.',
                    memories: 'Lưu những dấu mốc thật riêng.',
                    settings: 'Để cuốn sổ kể đúng chuyện hai bạn.',
                  }[panel]
                }
              </p>
            </div>
            <input
              ref={input}
              hidden
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const target = e.currentTarget;
                void upload(target.files).finally(() => {
                  target.value = '';
                });
              }}
            />
            {panel === 'layers' && (
              <Layers
                page={page}
                selected={selectedIdsHere}
                onSelect={setSelectedIds}
                onChange={changeElements}
              />
            )}
            {panel === 'pages' && (
              <>
                <div className="page-list">
                  {album.pages.map((p, i) => (
                    <div
                      key={p.id}
                      className={page.id === p.id ? 'page-item selected' : 'page-item'}
                    >
                      <button
                        className="page-thumb"
                        onClick={() => {
                          setPageId(p.id);
                          setSelected(null);
                        }}
                      >
                        <PagePreview album={album} index={i} width={126} />
                      </button>
                      <div className="row between">
                        <button className="text-button" onClick={() => setPageId(p.id)}>
                          {i + 1}. {p.title}
                        </button>
                        <button
                          className="icon-button tiny"
                          aria-label="Nhân bản trang"
                          disabled={album.pages.length >= 20}
                          onClick={() => {
                            const next = {
                              ...cloneLayout(p),
                              id: crypto.randomUUID(),
                              title: `${p.title} (bản sao)`,
                            };
                            doc.edit((a) => ({ ...a, pages: [...a.pages, next] }));
                            setPageId(next.id);
                          }}
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          className="icon-button tiny page-delete"
                          aria-label={'Xóa trang ' + (i + 1) + ': ' + p.title}
                          title="Xóa trang · Có thể hoàn tác"
                          disabled={album.pages.length === 1}
                          onClick={() => setPageToDelete(p.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <TemplateLibrary
                  album={album}
                  page={page}
                  onError={setLocalError}
                  onApply={(next) => {
                    doc.edit((a) => ({ ...a, pages: [...a.pages, next] }));
                    setPageId(next.id);
                    setSelectedIds([]);
                  }}
                />
                <button
                  className="button quiet full"
                  disabled={album.pages.length >= 20}
                  onClick={addPage}
                >
                  <Plus size={14} />
                  Thêm trang trống
                </button>
                <p className="muted small">
                  Mẫu là điểm bắt đầu. Mọi ảnh và dòng chữ đều có thể chỉnh.
                </p>
              </>
            )}
            {panel === 'photos' && (
              <>
                <button
                  className="upload-zone"
                  disabled={uploading}
                  onClick={() => input.current?.click()}
                >
                  {uploading ? <LoaderCircle className="spin" /> : <ImagePlus />}
                  <strong>{uploading ? 'Đang lưu ảnh…' : 'Thêm ảnh của hai bạn'}</strong>
                  <span>JPEG, PNG, WebP · tối đa 20 MB/ảnh</span>
                </button>
                <div className="media-grid">
                  {album.assets.map((a) => (
                    <button
                      key={a.id}
                      disabled={uploading}
                      title={`Thêm ${a.name}`}
                      aria-label={`Thêm ${a.name}`}
                      onClick={() =>
                        add(
                          element('image', {
                            assetId: a.id,
                            width: 265,
                            height: 315,
                            rotation: -4,
                            text: 'một khoảnh khắc của mình',
                          }),
                        )
                      }
                    >
                      <img src={a.url} alt={a.name} />
                    </button>
                  ))}
                </div>
                <h4>Tranh trong mẫu</h4>
                <div className="media-grid">
                  {[1, 2, 3].map((i) => (
                    <button
                      key={i}
                      onClick={() =>
                        add(
                          element('image', {
                            assetId: `demo-${i}`,
                            width: 265,
                            height: 315,
                            text: 'một ngày thật đẹp',
                          }),
                        )
                      }
                    >
                      <img src={`/illustrations/demo-${i}.svg`} alt={`Tranh minh họa ${i}`} />
                    </button>
                  ))}
                </div>
                <p className="muted small">
                  Tranh minh họa để bạn thử bố cục. Thay bằng ảnh thật bất cứ lúc nào.
                </p>
              </>
            )}
            {panel === 'decorations' && (
              <>
                <h4 className="preset-heading">Chữ & lời nhắn</h4>
                <div className="creative-presets text-presets">
                  {textPresets.map((p) => (
                    <button key={p.id} aria-label={p.label} onClick={() => add(textPreset(p.id))}>
                      <span className={'text-preset-sample ' + p.font}>
                        {p.id === 'quote'
                          ? '“cùng nhau”'
                          : p.id === 'label'
                            ? 'LITTLE DAYS'
                            : p.id === 'letter'
                              ? 'Gửi người thương,'
                              : 'một chút thương'}
                      </span>
                      <strong>{p.name}</strong>
                    </button>
                  ))}
                </div>
                <h4>Bộ đếm & ngày kỉ niệm</h4>
                <div className="creative-presets counter-presets">
                  {counterPresets.map((p) => {
                    const e = counterPreset(p.id);
                    return (
                      <button
                        key={p.id}
                        aria-label={'Thêm bộ đếm ' + p.name}
                        onClick={() => add(counterPreset(p.id))}
                      >
                        <span className="counter-preset-art">
                          <span style={{ width: e.width, height: e.height }}>
                            <ElementContent element={e} album={album} referenceDate={reference} />
                          </span>
                        </span>
                        <strong>{p.name}</strong>
                      </button>
                    );
                  })}
                </div>
                <h4>Một chút trang trí</h4>
                <div className="decoration-collections" role="group" aria-label="Bộ trang trí">
                  {['Tất cả', ...new Set(decorationCatalog.map((d) => d.collection))].map(
                    (name) => (
                      <button
                        key={name}
                        aria-pressed={decorationCollection === name}
                        onClick={() => setDecorationCollection(name)}
                      >
                        {name}
                      </button>
                    ),
                  )}
                </div>
                <div className="decoration-gallery">
                  {decorationCatalog
                    .filter(
                      (d) =>
                        decorationCollection === 'Tất cả' || d.collection === decorationCollection,
                    )
                    .map((d) => (
                      <button
                        key={d.id}
                        aria-label={'Thêm trang trí ' + d.name}
                        onClick={() =>
                          add(
                            element('sticker', {
                              decorationId: d.id,
                              text: d.name,
                              width: d.width,
                              height: d.height,
                              x: 220,
                              y: 300,
                            }),
                          )
                        }
                      >
                        <img src={d.src} alt="" />
                        <span>{d.name}</span>
                      </button>
                    ))}
                </div>
                <h4>Ký hiệu nhỏ</h4>
                <div className="sticker-grid">
                  {stickerOptions.map((s, i) => (
                    <button
                      key={s}
                      style={{ color: ['#a35a48', '#bf7557', '#758058'][i % 3] }}
                      onClick={() =>
                        add(
                          element('sticker', {
                            text: s,
                            width: 90,
                            height: 90,
                            fontSize: 80,
                            color: ['#a35a48', '#bf7557', '#758058'][i % 3],
                          }),
                        )
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="note-card hand">
                  Chừa một chút khoảng trống,
                  <br />
                  để kỉ niệm được thở. ♡
                </div>
              </>
            )}
            {panel === 'settings' && (
              <div className="form-stack">
                <label>
                  Tên cuốn sổ
                  <input
                    maxLength={120}
                    value={album.title}
                    onChange={(e) =>
                      doc.edit((a) => ({ ...a, title: e.target.value }), 'album-title')
                    }
                  />
                </label>
                <label>
                  Tên người thứ nhất
                  <input
                    maxLength={60}
                    value={album.names[0]}
                    onChange={(e) =>
                      doc.edit((a) => ({ ...a, names: [e.target.value, a.names[1]] }), 'name-1')
                    }
                  />
                </label>
                <label>
                  Tên người thứ hai
                  <input
                    maxLength={60}
                    value={album.names[1]}
                    onChange={(e) =>
                      doc.edit((a) => ({ ...a, names: [a.names[0], e.target.value] }), 'name-2')
                    }
                  />
                </label>
                <label>
                  Ngày bắt đầu bên nhau
                  <input
                    type="date"
                    min="1900-01-01"
                    max="2200-12-31"
                    value={album.startDate}
                    onChange={(e) =>
                      doc.edit((a) => ({ ...a, startDate: e.target.value }), 'start-date')
                    }
                  />
                </label>
                <label>
                  Múi giờ
                  <select
                    value={album.timezone}
                    onChange={(e) => doc.edit((a) => ({ ...a, timezone: e.target.value }))}
                  >
                    <option value="Asia/Ho_Chi_Minh">Việt Nam (UTC+7)</option>
                    <option value="Asia/Tokyo">Nhật Bản (UTC+9)</option>
                    <option value="Europe/Paris">Paris</option>
                    <option value="America/New_York">New York</option>
                    <option value="UTC">UTC</option>
                  </select>
                </label>
                <div className="date-card">
                  <Heart size={22} />
                  <strong>{days >= 0 ? days.toLocaleString('vi-VN') : -days}</strong>
                  <span>{days >= 0 ? 'ngày đã bên nhau' : 'ngày đến ngày bắt đầu'}</span>
                  <small>
                    {anniversary.days === 0
                      ? 'Hôm nay là ngày kỉ niệm!'
                      : `Còn ${anniversary.days} ngày đến mốc ${anniversary.years} năm`}
                  </small>
                </div>
                <p className="small muted">
                  Ngày bắt đầu tính là 0 ngày đã trôi qua. Ngày 29/2 được tính vào 28/2 trong năm
                  không nhuận.
                </p>
                <button className="button danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={15} />
                  Xóa album
                </button>
              </div>
            )}
            {panel === 'memories' && (
              <Memories
                album={album}
                edit={doc.edit}
                onAddText={(m) =>
                  add(
                    element('text', {
                      text: `${m.title}\n${m.body}`,
                      width: 420,
                      height: 200,
                      fontSize: 30,
                    }),
                  )
                }
              />
            )}
          </aside>
          <main className="editor-main">
            <div className="canvas-toolbar">
              <div className="row">
                <span className="page-indicator">
                  TRANG {album.pages.findIndex((p) => p.id === page.id) + 1}
                </span>
                <input
                  aria-label="Tên trang"
                  value={page.title}
                  maxLength={120}
                  onChange={(e) =>
                    doc.edit(
                      (a) => ({
                        ...a,
                        pages: a.pages.map((p) =>
                          p.id === page.id ? { ...p, title: e.target.value } : p,
                        ),
                      }),
                      `page-title-${page.id}`,
                    )
                  }
                />
              </div>
              <div className="row">
                <button
                  className="icon-button tiny"
                  aria-label="Thu nhỏ"
                  disabled={zoom <= 0.6}
                  onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
                >
                  <Minus size={15} />
                </button>
                <button
                  className="zoom-reset"
                  aria-label="Đặt lại mức thu phóng"
                  title="Về 100%"
                  onClick={() => setZoom(1)}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="icon-button tiny"
                  aria-label="Phóng to"
                  disabled={zoom >= 1.5}
                  onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <div className="design-quickbar" role="toolbar" aria-label="Thiết kế nhanh">
              <button
                onClick={() =>
                  add(
                    element('text', {
                      text: 'Viết một điều thương…',
                      x: 150,
                      y: 330,
                      width: 420,
                      height: 100,
                    }),
                  )
                }
                title="Thêm chữ nhanh"
              >
                <Type size={16} />
                Chữ
              </button>
              <button
                onClick={() =>
                  add(
                    element('image', {
                      assetId: album.assets[0]?.id ?? null,
                      x: 210,
                      y: 230,
                      width: 300,
                      height: 360,
                      text: 'Ảnh của mình',
                    }),
                  )
                }
                title="Thêm khung ảnh nhanh"
              >
                <ImagePlus size={16} />
                Khung ảnh
              </button>
              <button
                onClick={() =>
                  add(
                    element('sticker', {
                      text: '♡',
                      x: 300,
                      y: 350,
                      width: 100,
                      height: 100,
                      fontSize: 80,
                      color: '#ac6b55',
                    }),
                  )
                }
                title="Thêm sticker nhanh"
              >
                <Heart size={16} />
                Sticker
              </button>
              <span className="quickbar-divider" />
              <button
                disabled={
                  !selectedIdsHere.length || page.elements.length + selectedIdsHere.length > 50
                }
                onClick={duplicateSelected}
                title="Nhân bản nhanh · Ctrl/⌘ D"
              >
                <Copy size={16} />
                Nhân bản
              </button>
              <button
                disabled={
                  !selectedIdsHere.length ||
                  page.elements.some((e) => selectedIdsHere.includes(e.id) && e.locked)
                }
                onClick={() =>
                  changeElements(alignElements(page.elements, selectedIdsHere, 'page-center'))
                }
                title="Căn lựa chọn vào giữa trang"
              >
                <LayoutTemplate size={16} />
                Căn giữa
              </button>
              <button
                onClick={() => {
                  setPanel('photos');
                  input.current?.click();
                }}
                title="Tải ảnh nhanh"
              >
                <Images size={16} />
                Tải ảnh
              </button>
            </div>
            <Suspense
              fallback={
                <div className="canvas-scroll">
                  <LoaderCircle className="spin" />
                  <p>Đang mở bàn scrapbook…</p>
                </div>
              }
            >
              <CanvasEditor
                album={album}
                page={page}
                selected={selectedIdsHere}
                onSelect={setSelectedIds}
                onPatchMany={(patches) =>
                  changeElements(
                    page.elements.map((e) => ({
                      ...e,
                      ...patches.find((p) => p.id === e.id)?.patch,
                    })),
                  )
                }
                referenceDate={reference}
                onEditText={() => setEditText(true)}
                zoom={zoom}
                onZoomChange={setZoom}
              />
            </Suspense>
            <div className="editor-bottom">
              <LegalLinks />
              <span>
                <Lock size={12} /> Chỉ bạn có thể chỉnh sửa
              </span>
              <span>
                Ctrl Z để hoàn tác <span className="key-hint">⌘ / Ctrl S</span>
              </span>
            </div>
          </main>
          <aside className="properties-panel">
            <div className="panel-title">
              <h3>
                {selectedIdsHere.length > 1
                  ? 'Bố cục đã chọn'
                  : selectedElement
                    ? 'Chi tiết nhỏ xinh'
                    : 'Trang sổ của mình'}
              </h3>
              <p>
                {selectedIdsHere.length > 1
                  ? 'Kéo và đổi kích thước cùng nhau.'
                  : selectedElement
                    ? 'Tùy chỉnh theo cách bạn thích.'
                    : 'Chọn một món trên trang để chỉnh sửa.'}
              </p>
            </div>
            {selectedIdsHere.length > 0 && (
              <SelectionTools
                page={page}
                ids={selectedIdsHere}
                onChange={changeElements}
                onSelect={setSelectedIds}
              />
            )}
            {selectedElement ? (
              <>
                <ElementProperties
                  e={selectedElement}
                  patch={(p) =>
                    patch(
                      selectedElement.id,
                      p,
                      `property-${selectedElement.id}-${Object.keys(p).join()}`,
                    )
                  }
                  album={album}
                />
              </>
            ) : selectedIdsHere.length > 1 ? (
              <p className="muted small">Chọn riêng một phần tử để sửa nội dung và kiểu chữ.</p>
            ) : (
              <div className="form-stack">
                <label>
                  Màu giấy
                  <input
                    type="color"
                    value={page.background}
                    onChange={(e) =>
                      doc.edit(
                        (a) => ({
                          ...a,
                          pages: a.pages.map((p) =>
                            p.id === page.id ? { ...p, background: e.target.value } : p,
                          ),
                        }),
                        `background-${page.id}`,
                      )
                    }
                  />
                </label>
                <div className="paper-colors">
                  {['#f8f1e5', '#f1e4df', '#e7eddf', '#edf0ed', '#f9f7f0'].map((color) => (
                    <button
                      key={color}
                      aria-label={`Giấy ${color}`}
                      style={{ background: color }}
                      onClick={() =>
                        doc.edit((a) => ({
                          ...a,
                          pages: a.pages.map((p) =>
                            p.id === page.id ? { ...p, background: color } : p,
                          ),
                        }))
                      }
                    />
                  ))}
                </div>
                <div className="note-card">
                  <Flower2 size={30} />
                  <p>Kéo ảnh và chữ để sắp xếp. Chạm hai lần vào chữ để viết lời nhắn.</p>
                </div>
                <button
                  className="button quiet"
                  disabled={album.pages.findIndex((p) => p.id === page.id) === 0}
                  onClick={() =>
                    doc.edit((a) => {
                      const i = a.pages.findIndex((p) => p.id === page.id);
                      [a.pages[i], a.pages[i - 1]] = [a.pages[i - 1], a.pages[i]];
                      return a;
                    })
                  }
                >
                  <ArrowUp size={15} />
                  Đưa trang lên trước
                </button>
                <button
                  className="button quiet"
                  disabled={
                    album.pages.findIndex((p) => p.id === page.id) === album.pages.length - 1
                  }
                  onClick={() =>
                    doc.edit((a) => {
                      const i = a.pages.findIndex((p) => p.id === page.id);
                      [a.pages[i], a.pages[i + 1]] = [a.pages[i + 1], a.pages[i]];
                      return a;
                    })
                  }
                >
                  <ArrowDown size={15} />
                  Đưa trang ra sau
                </button>
                <button
                  className="button danger"
                  disabled={album.pages.length === 1}
                  onClick={() => setPageToDelete(page.id)}
                >
                  <Trash2 size={15} />
                  Xóa trang này
                </button>
              </div>
            )}
          </aside>
        </div>
        {pageToDelete && (
          <ConfirmDialog
            title="Xóa trang sổ này?"
            description={
              'Trang “' +
              (album.pages.find((p) => p.id === pageToDelete)?.title || '') +
              '” sẽ được bỏ khỏi cuốn sổ. Bạn có thể hoàn tác để lấy lại.'
            }
            onClose={() => setPageToDelete(null)}
            onConfirm={() => deletePage(pageToDelete)}
          />
        )}
        {viewer && <Viewer album={album} onClose={() => setViewer(false)} />}
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <div className="loading-screen">
                <LoaderCircle className="spin" />
                <p>Đang mở phòng dựng phim…</p>
              </div>
            </div>
          }
        >
          {video && <VideoModal album={video} onClose={() => setVideo(null)} notify={notify} />}
        </Suspense>
        {share && (
          <Modal title="Gửi một chút thương" onClose={() => setShare(null)}>
            <div className="form-stack">
              <p className="muted">Ai có link này đều xem được album. Họ không thể chỉnh sửa.</p>
              <input readOnly value={share} aria-label="Link chia sẻ" />
              <button
                className="button primary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(share)
                    .then(() => notify('Đã sao chép link.'))
                    .catch(() => notify('Hãy chọn và sao chép link trong ô trên.'))
                }
              >
                <Copy size={16} />
                Sao chép link
              </button>
              <button
                className="button danger"
                onClick={() =>
                  void safe(async () => {
                    await api(`/albums/${album.id}/share`, { method: 'DELETE' });
                    setShare(null);
                    notify('Đã thu hồi tất cả link của album này.');
                  })
                }
              >
                Thu hồi mọi link chia sẻ
              </button>
            </div>
          </Modal>
        )}
        {editText && selectedElement && (
          <Modal title="Viết một lời thương" onClose={() => setEditText(false)}>
            <textarea
              className="large-textarea"
              rows={7}
              autoFocus
              maxLength={3000}
              value={selectedElement.text}
              onChange={(e) =>
                patch(selectedElement.id, { text: e.target.value }, `text-${selectedElement.id}`)
              }
            />
            <button className="button primary full" onClick={() => setEditText(false)}>
              <Check size={16} />
              Viết xong rồi
            </button>
          </Modal>
        )}
        {confirmDelete && (
          <Modal title="Xóa cuốn sổ này?" onClose={() => setConfirmDelete(false)}>
            <div className="form-stack">
              <p>Album, ảnh và link chia sẻ sẽ bị xóa. Thao tác này không thể hoàn tác.</p>
              <button
                className="button danger"
                onClick={() =>
                  void safe(async () => {
                    await doc.flush();
                    await api(`/albums/${album.id}`, { method: 'DELETE' });
                    onBack();
                    notify('Đã xóa album.');
                  })
                }
              >
                <Trash2 size={16} />
                Xóa album và ảnh
              </button>
              <button className="button quiet" onClick={() => setConfirmDelete(false)}>
                Giữ lại cuốn sổ
              </button>
            </div>
          </Modal>
        )}
      </div>
      <Suspense
        fallback={
          <div className="modal-backdrop">
            <p>Đang mở lịch sử…</p>
          </div>
        }
      >
        {historyOpen && (
          <VersionHistory
            album={album}
            onClose={() => setHistoryOpen(false)}
            onCheckpoint={async (label) => {
              const latest = await doc.flush();
              await api('/albums/' + album.id + '/versions', {
                method: 'POST',
                body: JSON.stringify({ expectedRevision: latest.revision, label }),
              });
              return latest;
            }}
            onRestore={async (revision) => {
              const latest = await doc.flush();
              try {
                const restored = await api<Album>(
                  '/albums/' + album.id + '/versions/' + revision + '/restore',
                  { method: 'POST', body: JSON.stringify({ expectedRevision: latest.revision }) },
                );
                doc.accept(restored, true);
                setPageId(restored.pages[0].id);
                setSelectedIds([]);
                notify('Đã khôi phục album. Bản trước vẫn có trong lịch sử.');
                return restored;
              } catch (error) {
                if (error instanceof ApiError && error.status === 409)
                  doc.markConflict(error.message);
                throw error;
              }
            }}
          />
        )}
      </Suspense>
      {uploading && (
        <div className="upload-progress" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={28} />
          <strong>Đang giữ lại những khoảnh khắc…</strong>
          <span>Ảnh được tối ưu và lưu trước khi bạn chỉnh tiếp.</span>
        </div>
      )}
    </>
  );
}

function ElementProperties({
  e,
  patch,
  album,
}: {
  e: ScrapElement;
  patch: (p: Partial<ScrapElement>) => void;
  album: Album;
}) {
  return (
    <fieldset className="form-stack properties" disabled={e.locked}>
      <TextOverflowWarning element={e} album={album} />
      <div className="element-type">
        {e.type === 'image' ? (
          <Images size={15} />
        ) : e.type === 'anniversary' ? (
          <CalendarDays size={15} />
        ) : (
          <Type size={15} />
        )}
        {
          {
            image: 'Ảnh Polaroid',
            text: 'Lời nhắn',
            sticker: 'Sticker',
            anniversary: 'Ngày bên nhau',
          }[e.type]
        }
      </div>
      {e.type !== 'anniversary' && !e.decorationId && (
        <label>
          {e.type === 'image' ? 'Chú thích ảnh' : 'Nội dung'}
          <textarea
            aria-label={e.type === 'image' ? 'Chú thích ảnh' : 'Nội dung'}
            rows={e.type === 'text' ? 4 : 2}
            maxLength={3000}
            value={e.text}
            onChange={(ev) => patch({ text: ev.target.value })}
          />
        </label>
      )}
      {e.type === 'anniversary' && (
        <>
          <label>
            Giao diện bộ đếm
            <select
              aria-label="Giao diện bộ đếm"
              value={e.counterStyle || 'plain'}
              onChange={(ev) => {
                const style = ev.target.value as NonNullable<ScrapElement['counterStyle']>;
                patch({
                  counterStyle: style,
                  ...(style === 'plain'
                    ? {}
                    : style === 'seal'
                      ? { width: 230, height: 230 }
                      : { height: Math.max(e.height, 170), width: Math.max(e.width, 300) }),
                });
              }}
            >
              {Object.entries(counterStyleNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kiểu ngày kỉ niệm
            <select
              aria-label="Kiểu ngày kỉ niệm"
              value={e.dateMode || 'elapsed'}
              onChange={(ev) => patch({ dateMode: ev.target.value as ScrapElement['dateMode'] })}
            >
              <option value="elapsed">Số ngày đã bên nhau</option>
              <option value="annual">Đếm ngược kỉ niệm hằng năm</option>
              <option value="milestone">Mốc số ngày tùy chỉnh</option>
            </select>
          </label>
          {e.dateMode === 'milestone' && (
            <label>
              Mốc số ngày
              <input
                type="number"
                min={1}
                max={50000}
                value={e.milestoneDays || 1000}
                onChange={(ev) =>
                  patch({ milestoneDays: Math.max(1, Math.min(50000, Number(ev.target.value))) })
                }
              />
            </label>
          )}
        </>
      )}
      {e.type === 'image' ? (
        <>
          <label>
            Thay ảnh
            <select value={e.assetId || ''} onChange={(ev) => patch({ assetId: ev.target.value })}>
              {[1, 2, 3].map((i) => (
                <option key={i} value={`demo-${i}`}>
                  Tranh minh họa {i}
                </option>
              ))}
              {album.assets.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phóng vùng ảnh
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.01}
              value={e.crop.width}
              onChange={(ev) => {
                const value = Number(ev.target.value);
                patch({
                  crop: { x: (1 - value) / 2, y: (1 - value) / 2, width: value, height: value },
                });
              }}
            />
          </label>
          <label>
            Dịch ngang vùng ảnh
            <input
              type="range"
              min={0}
              max={1 - e.crop.width}
              step={0.01}
              value={e.crop.x}
              onChange={(ev) => patch({ crop: { ...e.crop, x: Number(ev.target.value) } })}
            />
          </label>
          <label>
            Dịch dọc vùng ảnh
            <input
              type="range"
              min={0}
              max={1 - e.crop.height}
              step={0.01}
              value={e.crop.y}
              onChange={(ev) => patch({ crop: { ...e.crop, y: Number(ev.target.value) } })}
            />
          </label>
        </>
      ) : !e.decorationId ? (
        <>
          <label>
            Kiểu chữ
            <select
              value={e.font}
              onChange={(ev) => patch({ font: ev.target.value as ScrapElement['font'] })}
            >
              <option value="hand">Patrick Hand · Viết tay</option>
              <option value="serif">Lora · Trang sách</option>
              <option value="sans">Be Vietnam Pro · Gọn gàng</option>
            </select>
          </label>
          <div className="two-fields">
            <label>
              Cỡ chữ
              <input
                type="number"
                min={10}
                max={160}
                value={e.fontSize}
                onChange={(ev) =>
                  patch({ fontSize: Math.max(10, Math.min(160, Number(ev.target.value))) })
                }
              />
            </label>
            <label>
              Màu chữ
              <input
                type="color"
                value={e.color}
                onChange={(ev) => patch({ color: ev.target.value })}
              />
            </label>
          </div>
          <label>
            Căn chữ
            <select
              value={e.align}
              onChange={(ev) => patch({ align: ev.target.value as ScrapElement['align'] })}
            >
              <option value="left">Trái</option>
              <option value="center">Giữa</option>
              <option value="right">Phải</option>
            </select>
          </label>
        </>
      ) : (
        <p className="notice">
          Trang trí vector · có thể di chuyển, xoay, đổi kích thước, độ trong và thứ tự lớp.
        </p>
      )}
      <div className="two-fields">
        {(['x', 'y', 'width', 'height'] as const).map((k) => (
          <label key={k}>
            {{ x: 'Vị trí X', y: 'Vị trí Y', width: 'Chiều rộng', height: 'Chiều cao' }[k]}
            <input
              type="number"
              value={Math.round(e[k])}
              min={k === 'width' || k === 'height' ? 48 : -1000}
              max={k === 'height' || k === 'y' ? 2000 : 1600}
              onChange={(ev) =>
                patch({
                  [k]: Math.max(
                    k === 'width' || k === 'height' ? 48 : -1000,
                    Math.min(k === 'height' || k === 'y' ? 2000 : 1600, Number(ev.target.value)),
                  ),
                })
              }
            />
          </label>
        ))}
      </div>
      <label>
        Góc xoay <span>{Math.round(e.rotation)}°</span>
        <input
          aria-label="Góc xoay"
          type="range"
          min={-180}
          max={180}
          value={e.rotation}
          onChange={(ev) => patch({ rotation: Number(ev.target.value) })}
        />
      </label>
      <label>
        Độ rõ
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={e.opacity}
          onChange={(ev) => patch({ opacity: Number(ev.target.value) })}
        />
      </label>
      <label>
        Chuyển động trong video
        <select
          value={e.animation}
          onChange={(ev) => patch({ animation: ev.target.value as ScrapElement['animation'] })}
        >
          <option value="none">Giữ nguyên</option>
          <option value="fade">Hiện nhẹ</option>
          <option value="rise">Nâng lên nhẹ</option>
          <option value="drop">Ảnh rơi vào trang</option>
        </select>
      </label>
      <p className="small muted">Nếu chữ bị khuất, tăng chiều cao khung hoặc giảm cỡ chữ.</p>
    </fieldset>
  );
}

function Memories({
  album,
  edit,
  onAddText,
}: {
  album: Album;
  edit: (fn: (a: Album) => Album, group?: string) => void;
  onAddText: (m: Memory) => void;
}) {
  const [form, setForm] = useState<Memory | null>(null);
  const [error, setError] = useState('');
  const save = (ev: FormEvent) => {
    ev.preventDefault();
    if (!form) return;
    if (!form.title.trim() || !form.date) {
      setError('Điền tên và ngày kỉ niệm.');
      return;
    }
    edit((a) => ({
      ...a,
      memories: [...a.memories.filter((m) => m.id !== form.id), form].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    }));
    setForm(null);
    setError('');
  };
  return (
    <>
      <button
        className="button primary full"
        disabled={album.memories.length >= 100}
        onClick={() =>
          setForm({
            id: crypto.randomUUID(),
            title: '',
            date: todayIn(album.timezone),
            body: '',
            featured: true,
            assetId: null,
          })
        }
      >
        <Plus size={15} />
        Thêm kỉ niệm
      </button>
      {form && (
        <form className="form-stack memory-form" onSubmit={save}>
          <label>
            Tên dấu mốc
            <input
              required
              maxLength={160}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            Ngày
            <input
              required
              type="date"
              min="1900-01-01"
              max="2200-12-31"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <label>
            Lời nhắn
            <textarea
              maxLength={3000}
              rows={3}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
          <label>
            Ảnh gắn với kỉ niệm
            <select
              value={form.assetId || ''}
              onChange={(e) => setForm({ ...form, assetId: e.target.value || null })}
            >
              <option value="">Chưa chọn ảnh</option>
              {album.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
            />
            Kỉ niệm nổi bật
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="button primary" type="submit">
              Lưu kỉ niệm
            </button>
            <button className="button quiet" type="button" onClick={() => setForm(null)}>
              Hủy
            </button>
          </div>
        </form>
      )}
      <div className="memory-list">
        {album.memories.map((m) => (
          <article key={m.id}>
            {m.assetId && <img src={assetUrl(m.assetId, album)} alt={m.title} />}
            <span className="memory-date">
              {new Date(`${m.date}T00:00:00Z`).toLocaleDateString('vi-VN', { timeZone: 'UTC' })}
              {m.featured && ' · ♡'}
            </span>
            <h4>{m.title}</h4>
            <p>{m.body}</p>
            <div className="row">
              <button className="text-button" onClick={() => onAddText(m)}>
                Đặt lời nhắn vào trang
              </button>
              <button
                className="icon-button tiny"
                aria-label="Sửa kỉ niệm"
                onClick={() => setForm({ ...m })}
              >
                <Settings2 size={13} />
              </button>
              <button
                className="icon-button tiny"
                aria-label="Xóa kỉ niệm"
                onClick={() =>
                  edit((a) => ({ ...a, memories: a.memories.filter((item) => item.id !== m.id) }))
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!album.memories.length && !form && (
        <div className="note-card">
          <CalendarDays size={26} />
          <p>Lần đầu gặp nhau, một chuyến đi, hay một buổi chiều không có gì đặc biệt.</p>
          <span className="hand">đều đáng để nhớ ♡</span>
        </div>
      )}
    </>
  );
}
