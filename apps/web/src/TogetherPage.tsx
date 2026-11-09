import { uploadImage } from './image-upload.js';
import { LoveJar } from './LoveJar.js';
import { QuestionTopics } from './QuestionTopics.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  Heart,
  HeartHandshake,
  LoaderCircle,
  LockKeyhole,
  MessageCircleHeart,
  RefreshCw,
  Shuffle,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError } from './api.js';
import { dateString } from '../../../packages/domain/index.js';
import { ConfirmDialog } from './Overlays.js';
import { UserAvatar } from './UserAvatar.js';
import type { TimelineSharingState, TimelineSpace } from '../../../packages/domain/journal.js';
import type { CoupleState, QuestionView, LoveNoteView } from '../../../packages/domain/couple.js';
const prettyDate = (date: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(date.length === 10 ? date + 'T00:00:00+07:00' : date));
function usePrivateDraft(actor: string, space: string, kind: string) {
  const key = `scrapbook-draft:${actor}:ritual:${space}:${kind}`;
  const [text, setText] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || 'null');
      return stored &&
        typeof stored.text === 'string' &&
        stored.text.length <= 1200 &&
        Number.isFinite(stored.at) &&
        Date.now() - stored.at < 7 * 86400000
        ? stored.text
        : '';
    } catch {
      return '';
    }
  });
  return [
    text,
    (next: string) => {
      setText(next);
      try {
        if (next) localStorage.setItem(key, JSON.stringify({ text: next, at: Date.now() }));
        else localStorage.removeItem(key);
      } catch {}
    },
  ] as const;
}
function discardDrafts(actor: string, space: string) {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(`scrapbook-draft:${actor}:ritual:${space}:`)) localStorage.removeItem(key);
  } catch {}
}
function readSubmissionKey(key: string, signature: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (
      value &&
      value.signature === signature &&
      typeof value.id === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id)
    )
      return value.id;
  } catch {
    /* A new key is safe when no pending request is recorded. */
  }
  return crypto.randomUUID();
}
export default function TogetherPage({
  photoEnabled = false,
  topicsEnabled = false,
  userId,
  ready,
  search,
  onNavigate,
  onAccount,
}: {
  photoEnabled?: boolean;
  topicsEnabled?: boolean;
  userId: string;
  ready: boolean;
  search: string;
  onNavigate: (path: string) => void;
  onAccount: () => void;
}) {
  const params = new URLSearchParams(search),
    tab = params.get('tab') === 'jar' ? 'jar' : 'questions';
  const [spaces, setSpaces] = useState<TimelineSpace[]>([]),
    [spacesLoaded, setSpacesLoaded] = useState(!ready),
    [sharingReload, setSharingReload] = useState(0),
    [space, setSpace] = useState(''),
    [state, setState] = useState<CoupleState | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState(false),
    [page, setPage] = useState(0),
    [questionPage, setQuestionPage] = useState(0),
    [drawn, setDrawn] = useState<LoveNoteView | null>(null),
    [deleting, setDeleting] = useState<LoveNoteView | null>(null),
    [past, setPast] = useState<QuestionView | null>(null);
  const preparedPhotos = useRef(new Map<string, { file: File; url: string }>());
  const generation = useRef(0),
    latestState = useRef<CoupleState | null>(null),
    alive = useRef(true),
    busy = useRef(false),
    drawDialog = useRef<HTMLDialogElement>(null);
  latestState.current = state;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let current = true;
    void api<TimelineSharingState>('/timeline-sharing')
      .then((value) => {
        if (!current) return;
        setError('');
        const all = value.spaces?.filter((s) => s.shared) || [];
        setSpacesLoaded(true);
        setSpaces(all);
        const wanted = new URLSearchParams(search).get('space');
        setSpace(
          all.find((s) => s.id === wanted)?.id ||
            all.find((s) => s.members.length > 1)?.id ||
            all[0]?.id ||
            '',
        );
        if (!all.length) setLoading(false);
      })
      .catch((e) => {
        if (current) {
          setSpacesLoaded(true);
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [userId, ready, sharingReload]);
  const load = async (quiet = false) => {
    if (!space) return;
    const sequence = ++generation.current;
    if (!quiet) setLoading(true);
    try {
      const result = await api<CoupleState>(
        `/together/${space}?page=${page}&questionPage=${questionPage}&catalogVersion=${topicsEnabled ? 1 : 0}`,
      );
      if (sequence !== generation.current || !alive.current) return;
      if (
        latestState.current?.daily?.id === result.daily?.id &&
        !latestState.current?.daily?.revealedAt &&
        result.daily?.revealedAt
      )
        setNotice('Câu trả lời đã cùng mở.');
      setState(result);
      setError('');
      // A permission/membership refresh must also invalidate overlays containing old content.
      setDrawn(null);
      setDeleting(null);
      setPast(null);
    } catch (e) {
      if (sequence !== generation.current || !alive.current) return;
      setError((e as Error).message);
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
        setState(null);
        setDrawn(null);
        setPast(null);
        setDeleting(null);
        discardDrafts(userId, space);
        try {
          const sharing = await api<TimelineSharingState>('/timeline-sharing');
          if (sequence === generation.current && alive.current) {
            const available = (sharing.spaces || []).filter((s) => s.shared && s.id !== space);
            setSpaces(available);
            setSpace(available[0]?.id || '');
          }
        } catch {
          /* Keep the permission error visible; never restore the old content. */
        }
      }
    } finally {
      if (sequence === generation.current && alive.current) setLoading(false);
    }
  };
  useEffect(() => {
    setState(null);
    setDrawn(null);
    setPast(null);
    setDeleting(null);
    if (!space) {
      setLoading(false);
      return;
    }
    void load();
    return () => {
      generation.current++;
    };
  }, [space, page, questionPage, tab]);
  useEffect(() => {
    const update = () => {
      if (
        document.visibilityState === 'visible' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !busy.current &&
        !drawDialog.current?.open &&
        !deleting &&
        !past
      )
        void load(true);
    };
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [space, page, questionPage, deleting, past]);
  useEffect(() => {
    const node = drawDialog.current;
    if (drawn && !node?.open) node?.showModal();
    return () => node?.close();
  }, [drawn?.id]);
  const run = async (action: () => Promise<void>) => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await action();
      return true;
    } catch (e) {
      const message = (e as Error).message;
      if (e instanceof ApiError && [400, 401, 404, 409].includes(e.status)) await load(true);
      setError(message);
      return false;
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  };
  const root = '/together/' + space;
  return (
    <section className="together-page" aria-label="Câu hỏi & Lọ điều thương">
      <button className="page-back" onClick={() => onNavigate('/today')}>
        <ArrowLeft size={16} />
        Về Hôm nay
      </button>
      <header className="ritual-heading">
        <div>
          <span className="eyebrow">MỖI NGÀY, MỘT CHÚT GẦN NHAU</span>
          <h1>Câu hỏi & Lọ điều thương</h1>
          <p>Một câu để hiểu nhau. Một lời thương để dành.</p>
        </div>
        <span className="ritual-heading-icon" aria-hidden="true">
          <HeartHandshake size={38} />
        </span>
      </header>
      {!ready ? (
        <div className="ritual-empty">
          <Heart />
          <h2>Góc nhỏ đang được cập nhật</h2>
          <p>Tải lại trang sau khi máy chủ hoàn tất cập nhật.</p>
        </div>
      ) : (
        <>
          {spaces.length > 0 && (
            <div className="ritual-space-picker">
              <label>
                Không gian chung
                <select
                  aria-label="Không gian cho Câu hỏi & Lọ điều thương"
                  value={space}
                  disabled={pending}
                  onChange={(e) => {
                    setPage(0);
                    setQuestionPage(0);
                    setSpace(e.target.value);
                    setNotice('');
                  }}
                >
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.members.map((m) => m.displayName).join(' & ')}
                    </option>
                  ))}
                </select>
              </label>
              <div className="ritual-members">
                {state?.members.map((m) => (
                  <span key={m.id}>
                    <UserAvatar name={m.displayName} url={m.avatarUrl} />
                    <span>{m.displayName}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error}{' '}
              <button
                className="text-button"
                onClick={() => {
                  if (space) void load();
                  else {
                    setSpacesLoaded(false);
                    setSharingReload((n) => n + 1);
                  }
                }}
              >
                Thử lại
              </button>
            </div>
          )}
          {notice && (
            <p className="ritual-notice" role="status">
              {notice}
            </p>
          )}
          {loading || !spacesLoaded ? (
            <div className="ritual-loading" role="status">
              <LoaderCircle className="spin" />
              Đang mở góc nhỏ của hai người…
            </div>
          ) : !space ? (
            error ? null : (
              <div className="ritual-empty">
                <HeartHandshake size={42} />
                <h2>Thêm một người để cùng giữ những điều nhỏ</h2>
                <p>
                  Đăng nhập, xác minh email rồi mời người thương tại Dòng thời gian → Chia sẻ dòng
                  thời gian.
                </p>
                <div className="row">
                  <button className="button primary" onClick={() => onNavigate('/timeline')}>
                    Mời người thương <ArrowRight size={16} />
                  </button>
                  <button className="button quiet" onClick={onAccount}>
                    Tài khoản của mình
                  </button>
                </div>
              </div>
            )
          ) : (
            state && (
              <>
                <nav className="ritual-tabs" aria-label="Chọn hoạt động">
                  <button
                    className={tab === 'questions' ? 'active' : ''}
                    aria-current={tab === 'questions' ? 'page' : undefined}
                    onClick={() => onNavigate('/together?tab=questions&space=' + space)}
                  >
                    <MessageCircleHeart size={18} />
                    Câu hỏi mỗi ngày
                  </button>
                  <button
                    className={tab === 'jar' ? 'active' : ''}
                    aria-current={tab === 'jar' ? 'page' : undefined}
                    onClick={() => onNavigate('/together?tab=jar&space=' + space)}
                  >
                    <Heart size={18} />
                    Lọ điều thương
                  </button>
                </nav>
                {tab === 'questions' ? (
                  <>
                    {topicsEnabled && state.daily && state.questionPreferences && (
                      <QuestionTopics
                        key={space}
                        space={space}
                        value={state.questionPreferences}
                        onSaved={() => load(true)}
                      />
                    )}
                    <div className="ritual-intro">
                      <div>
                        <span className="eyebrow">CÂU HỎI HÔM NAY · {prettyDate(state.today)}</span>
                        <h2>Gửi lời mình, rồi cùng lắng nghe.</h2>
                        <p>
                          Mỗi người gửi một câu trả lời riêng. Chỉ khi cả hai đã gửi, câu trả lời
                          mới cùng mở.
                        </p>
                      </div>
                      <div className="ritual-letter-art" aria-hidden="true">
                        <MessageCircleHeart size={44} />
                        <span>mình nghe bạn ♡</span>
                      </div>
                    </div>
                    {state.daily ? (
                      <AnswerCard
                        key={state.daily.id}
                        question={state.daily}
                        userId={userId}
                        space={space}
                        pending={pending}
                        onSubmit={(q, text, requestId) =>
                          run(async () => {
                            const modern = topicsEnabled && !!q.promptId;
                            const updated = await api<QuestionView>(
                              root + (modern ? '/answers-v2' : '/answers'),
                              {
                                method: 'POST',
                                body: JSON.stringify({
                                  roundId: q.id,
                                  promptId: q.promptId,
                                  date: q.date,
                                  expectedRevision: q.revision,
                                  requestId,
                                  text,
                                }),
                              },
                            ).catch((error) => {
                              if (modern && error instanceof ApiError && error.status === 404)
                                throw new ApiError(
                                  404,
                                  'Ứng dụng hoặc quyền truy cập vừa thay đổi. Hãy tải lại trang trước khi gửi; bản nháp vẫn giữ trên thiết bị.',
                                );
                              throw error;
                            });
                            setState((s) => (s ? { ...s, daily: updated } : s));
                            setNotice(
                              updated.revealedAt
                                ? 'Câu trả lời đã cùng mở.'
                                : 'Đã giữ câu trả lời riêng của bạn.',
                            );
                          })
                        }
                        onWithdraw={(q) =>
                          run(async () => {
                            const updated = await api<QuestionView>(
                              root + '/questions/' + q.id + '/withdraw',
                              {
                                method: 'POST',
                                body: JSON.stringify({ expectedRevision: q.revision }),
                              },
                            );
                            setState((s) => (s ? { ...s, daily: updated } : s));
                            setNotice('Đã rút lại câu trả lời.');
                          })
                        }
                        onMemory={(q) =>
                          run(async () => {
                            await api(root + '/questions/' + q.id + '/memory', {
                              method: 'POST',
                              body: JSON.stringify({ expectedRevision: q.revision }),
                            });
                            await load(true);
                            setNotice(
                              'Đã lưu câu hỏi và hai câu trả lời thành dấu mốc trong không gian chung.',
                            );
                          })
                        }
                      />
                    ) : (
                      <div className="ritual-empty">
                        <HeartHandshake />
                        <h3>Câu hỏi dành cho hai người</h3>
                        <p>
                          Hoạt động này cần không gian có đúng hai thành viên. Lọ điều thương vẫn
                          dùng được với nhóm nhiều người.
                        </p>
                        <button className="button quiet" onClick={() => onNavigate('/timeline')}>
                          Quản lý không gian
                        </button>
                      </div>
                    )}
                    <section className="ritual-history" aria-label="Những câu hỏi đã giữ">
                      <div className="section-heading">
                        <h2>Những lần mình lắng nghe</h2>
                        <span>{state.questions.length} câu trên trang này</span>
                      </div>
                      {!state.questions.length ? (
                        <p className="muted">
                          Câu hỏi đã trả lời sẽ được giữ ở đây, kể cả khi chưa cùng mở.
                        </p>
                      ) : (
                        <div className="ritual-question-list">
                          {state.questions.map((q) => (
                            <button key={q.id} onClick={() => setPast(q)}>
                              <small>{prettyDate(q.date)}</small>
                              <strong>{q.prompt}</strong>
                              <span>
                                {q.revealedAt
                                  ? 'Đã cùng mở'
                                  : q.membersChanged
                                    ? 'Thành viên đã thay đổi'
                                    : 'Đang chờ người còn lại'}{' '}
                                <ArrowRight size={15} />
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <Pagination
                        page={questionPage}
                        more={state.questionsHasMore}
                        disabled={pending}
                        onPage={setQuestionPage}
                      />
                    </section>
                  </>
                ) : (
                  <>
                    <div className="jar-layout">
                      <section className="jar-paper">
                        <span className="eyebrow">ĐỂ DÀNH MỘT CHÚT THƯƠNG</span>
                        <h2>Lọ điều thương</h2>
                        <LoveJar total={state.jarTotal} />
                        <button
                          className="button quiet full"
                          disabled={pending || !state.jarTotal}
                          onClick={() =>
                            void run(async () => {
                              setDrawn(await api<LoveNoteView>(root + '/draw', { method: 'POST' }));
                            })
                          }
                        >
                          <Shuffle size={17} />
                          Rút một điều thương đã mở
                        </button>
                      </section>
                      <JarComposer
                        photoEnabled={photoEnabled}
                        key={space}
                        userId={userId}
                        space={space}
                        today={state.today}
                        pending={pending}
                        allowed={state.members.length >= 2}
                        onSubmit={(text, mode, openDate, requestId, photoFile) =>
                          run(async () => {
                            const prepared = preparedPhotos.current.get(requestId);
                            let photoUrl = prepared?.file === photoFile ? prepared?.url : undefined;
                            const photoKey = `scrapbook-draft:${userId}:ritual:${space}:photo-${requestId}`;
                            if (photoFile && !photoUrl) {
                              try {
                                const saved = JSON.parse(localStorage.getItem(photoKey) || 'null');
                                if (
                                  saved?.at > Date.now() - 7 * 86400000 &&
                                  typeof saved.url === 'string'
                                )
                                  photoUrl = saved.url;
                              } catch {}
                            }
                            if (photoFile && !photoUrl) {
                              const uploadRes = await uploadImage<{ assetId: string; url: string }>(
                                root + '/assets',
                                photoFile,
                              );
                              photoUrl = uploadRes.url;
                              try {
                                localStorage.setItem(
                                  photoKey,
                                  JSON.stringify({ url: photoUrl, at: Date.now() }),
                                );
                              } catch {}
                              preparedPhotos.current.set(requestId, {
                                file: photoFile,
                                url: uploadRes.url,
                              });
                              if (preparedPhotos.current.size > 20)
                                preparedPhotos.current.delete(
                                  preparedPhotos.current.keys().next().value!,
                                );
                            }
                            await api(root + '/notes', {
                              method: 'POST',
                              body: JSON.stringify({ text, mode, openDate, requestId, photoUrl }),
                            });
                            preparedPhotos.current.delete(requestId);
                            try {
                              localStorage.removeItem(photoKey);
                            } catch {}
                            await load(true);
                            setNotice('Đã bỏ một điều thương vào lọ.');
                          })
                        }
                      />
                    </div>
                    <section className="jar-collection" aria-label="Những lời thương trong lọ">
                      <div className="section-heading">
                        <div>
                          <h2>Lời trong lọ</h2>
                          <p>
                            <LockKeyhole size={13} /> Lời chưa mở được giữ riêng.
                          </p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Làm mới lọ điều thương"
                          disabled={pending}
                          onClick={() => void load(true)}
                        >
                          <RefreshCw size={18} />
                        </button>
                      </div>
                      {!state.jar.length ? (
                        <div className="ritual-empty">
                          <Heart />
                          <h3>Lọ đang chờ lời thương đầu tiên</h3>
                          <p>Một lời cảm ơn hay một chuyện nhỏ hôm nay cũng đủ rồi.</p>
                        </div>
                      ) : (
                        <div className="jar-cards">
                          {state.jar.map((note) => (
                            <JarNote
                              key={note.id}
                              note={note}
                              disabled={pending}
                              onDelete={() => setDeleting(note)}
                              onVote={() =>
                                void run(async () => {
                                  await api(root + '/notes/' + encodeURIComponent(note.id), {
                                    method: 'PATCH',
                                    body: JSON.stringify({
                                      expectedRevision: note.revision,
                                      approve: !note.approvedByMe,
                                    }),
                                  });
                                  await load(true);
                                  setNotice(
                                    note.approvedByMe
                                      ? 'Đã rút lại sự đồng ý.'
                                      : 'Đã ghi nhận sự đồng ý của bạn.',
                                  );
                                })
                              }
                            />
                          ))}
                        </div>
                      )}
                      <Pagination
                        page={page}
                        more={state.jarHasMore}
                        disabled={pending}
                        onPage={setPage}
                      />
                    </section>
                  </>
                )}
              </>
            )
          )}
        </>
      )}
      {deleting && (
        <ConfirmDialog
          title="Lấy lời nhắn này khỏi lọ?"
          description="Lời nhắn sẽ được xóa khỏi không gian chung. Chỉ bạn mới được xóa lời mình viết."
          confirmLabel="Xóa lời nhắn"
          busy={pending}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            void run(async () => {
              await api(root + '/notes/' + encodeURIComponent(deleting.id), {
                method: 'DELETE',
                body: JSON.stringify({ expectedRevision: deleting.revision }),
              });
              setDeleting(null);
              await load(true);
              setNotice('Đã xóa lời nhắn.');
            })
          }
        />
      )}
      {drawn && (
        <dialog
          className="ritual-draw-dialog"
          ref={drawDialog}
          aria-label="Một điều thương dành cho bạn"
          onCancel={(e) => {
            e.preventDefault();
            setDrawn(null);
          }}
        >
          <button
            className="icon-button ritual-dialog-close"
            aria-label="Đóng lời thương"
            onClick={() => setDrawn(null)}
          >
            <X />
          </button>
          <span className="eyebrow">MỘT ĐIỀU THƯƠNG DÀNH CHO BẠN</span>
          <Heart className="ritual-draw-heart" />
          <p className="jar-message">{drawn.text}</p>
          <small>
            Từ {drawn.authorName} · {prettyDate(drawn.createdAt)}
          </small>
          <button className="button primary" onClick={() => setDrawn(null)}>
            Giữ lại trong lòng
          </button>
        </dialog>
      )}
      {past && (
        <PastQuestion
          question={past}
          userId={userId}
          space={space}
          root={root}
          pending={pending}
          run={run}
          onClose={() => setPast(null)}
          onChanged={async () => {
            await load(true);
            setNotice('Đã cập nhật câu hỏi.');
          }}
        />
      )}
    </section>
  );
}
function Pagination({
  page,
  more,
  disabled,
  onPage,
}: {
  page: number;
  more: boolean;
  disabled: boolean;
  onPage: (n: number) => void;
}) {
  return page > 0 || more ? (
    <div className="ritual-pagination">
      <button
        className="button quiet"
        disabled={!page || disabled}
        onClick={() => onPage(page - 1)}
      >
        Trang trước
      </button>
      <span>Trang {page + 1}</span>
      <button
        className="button quiet"
        disabled={!more || disabled}
        onClick={() => onPage(page + 1)}
      >
        Trang sau
      </button>
    </div>
  ) : null;
}
function AnswerCard({
  question: q,
  userId,
  space,
  pending,
  onSubmit,
  onWithdraw,
  onMemory,
}: {
  question: QuestionView;
  userId: string;
  space: string;
  pending: boolean;
  onSubmit: (q: QuestionView, text: string, requestId: string) => Promise<boolean>;
  onWithdraw: (q: QuestionView) => Promise<unknown>;
  onMemory: (q: QuestionView) => Promise<unknown>;
}) {
  const mine = q.participants.find((p) => p.id === userId),
    [text, setText] = usePrivateDraft(userId, space, 'answer:' + q.id),
    request = useRef(crypto.randomUUID());
  return (
    <article
      className={'question-card' + (q.revealedAt ? ' revealed' : '')}
      aria-label="Câu hỏi dành cho hai người"
    >
      <div className="question-card-title">
        <span className="question-number">
          <MessageCircleHeart size={23} />
        </span>
        <h3>{q.prompt}</h3>
      </div>
      <div className="question-participants">
        {q.participants.map((p) => (
          <div key={p.id}>
            <UserAvatar name={p.displayName} url={p.avatarUrl} />
            <div>
              <strong>
                {p.displayName}
                {p.id === userId ? ' · Bạn' : ''}
              </strong>
              <small>{p.answered ? 'Đã gửi câu trả lời' : 'Chưa trả lời'}</small>
            </div>
            {p.answered ? <Check size={16} /> : <LockKeyhole size={15} />}
          </div>
        ))}
      </div>
      {q.revealedAt ? (
        <>
          <div className="question-replies">
            {q.participants.map((p) => (
              <section key={p.id}>
                <strong>{p.displayName}</strong>
                <p>{p.text || 'Nội dung này đã được xóa.'}</p>
              </section>
            ))}
          </div>
          <button
            className="button primary"
            disabled={pending || !!q.milestoneId || q.membersChanged}
            onClick={() => void onMemory(q)}
          >
            <CalendarDays size={17} />
            {q.milestoneId ? 'Đã lưu thành dấu mốc' : 'Lưu thành dấu mốc'}
          </button>
          {q.membersChanged && (
            <p className="muted small">
              Thành viên đã thay đổi. Giữ câu trả lời tại đây để không chia sẻ sang người mới.
            </p>
          )}
        </>
      ) : mine?.answered ? (
        <div className="answer-waiting">
          <LockKeyhole size={23} />
          <h4>Lời của bạn đang được giữ riêng.</h4>
          <p className="answer-mine">{mine.text}</p>
          <p>Người còn lại chưa thể đọc. Khi cả hai gửi xong, câu trả lời sẽ cùng mở.</p>
          <button className="button quiet" disabled={pending} onClick={() => void onWithdraw(q)}>
            Rút lại câu trả lời
          </button>
        </div>
      ) : q.membersChanged ? (
        <p className="ritual-warning">
          Thành viên đã thay đổi. Lượt cũ vẫn được giữ kín; hãy bắt đầu ở câu hỏi hôm nay.
        </p>
      ) : (
        <form
          className="answer-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onSubmit(q, text, request.current)) {
              setText('');
              request.current = crypto.randomUUID();
            }
          }}
        >
          <label>
            Câu trả lời riêng của bạn
            <textarea
              aria-label="Câu trả lời riêng của bạn"
              value={text}
              maxLength={1200}
              rows={5}
              onChange={(e) => setText(e.target.value)}
              placeholder="Bạn có thể viết ngắn thôi, miễn là điều mình muốn kể…"
              disabled={pending}
            />
          </label>
          <div className="answer-form-footer">
            <small>{text.length}/1200 · Bản nháp chỉ ở thiết bị này</small>
            <button className="button primary" disabled={pending || !text.trim()}>
              {pending ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}Gửi
              câu trả lời riêng
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
function JarComposer({
  photoEnabled,
  userId,
  space,
  today,
  pending,
  allowed,
  onSubmit,
}: {
  photoEnabled: boolean;
  userId: string;
  space: string;
  today: string;
  pending: boolean;
  allowed: boolean;
  onSubmit: (
    text: string,
    mode: 'month-end' | 'scheduled',
    date: string | undefined,
    requestId: string,
    photoFile?: File | null,
  ) => Promise<boolean>;
}) {
  const [text, setText] = usePrivateDraft(userId, space, 'jar'),
    [options, saveOptions] = usePrivateDraft(userId, space, 'jar-options');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<[string, number, number] | null>(() => {
    if (!photoEnabled || !text) return null;
    try {
      const saved = JSON.parse(
        localStorage.getItem(`scrapbook-draft:${userId}:ritual:${space}:jar-request`) || 'null',
      );
      const signature = JSON.parse(saved?.signature || 'null');
      const metadata = signature?.[3];
      return Array.isArray(metadata) &&
        metadata.length === 3 &&
        typeof metadata[0] === 'string' &&
        Number.isFinite(metadata[1]) &&
        Number.isFinite(metadata[2])
        ? (metadata as [string, number, number])
        : null;
    } catch {
      return null;
    }
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);
  let saved: { mode?: string; date?: string } = {};
  try {
    const parsed = JSON.parse(options || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
  } catch {
    /* Use the visible defaults. */
  }
  const [mode, setMode] = useState<'month-end' | 'scheduled'>(
      saved.mode === 'scheduled' ? 'scheduled' : 'month-end',
    ),
    [date, setDate] = useState(
      typeof saved.date === 'string' &&
        dateString.safeParse(saved.date).success &&
        saved.date >= today
        ? saved.date
        : today,
    ),
    requestKey = `scrapbook-draft:${userId}:ritual:${space}:jar-request`,
    signature = JSON.stringify(
      photoFile || pendingPhoto
        ? [
            text,
            mode,
            mode === 'scheduled' ? date : null,
            photoFile ? [photoFile.name, photoFile.size, photoFile.lastModified] : pendingPhoto,
          ]
        : [text, mode, mode === 'scheduled' ? date : null],
    ),
    request = useRef(readSubmissionKey(requestKey, signature));
  useEffect(() => {
    try {
      if (text)
        localStorage.setItem(requestKey, JSON.stringify({ id: request.current, signature }));
      else localStorage.removeItem(requestKey);
    } catch {
      /* Submission remains possible when device storage is unavailable. */
    }
  }, [signature, requestKey]);
  useEffect(() => saveOptions(JSON.stringify({ mode, date })), [mode, date]);
  const [year, month] = today.split('-').map(Number);
  const chosenDate =
    mode === 'month-end' ? new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) : date;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pendingPhoto && !photoFile) return;
    if (
      await onSubmit(
        text,
        mode,
        mode === 'scheduled' ? date : undefined,
        request.current,
        photoFile,
      )
    ) {
      setText('');
      setPhotoFile(null);
      setPendingPhoto(null);
      request.current = crypto.randomUUID();
    }
  };
  return (
    <section className="jar-composer">
      <span className="eyebrow">MỘT LỜI CHƯA VỘI MỞ</span>
      <h2>Viết một lời thương</h2>
      <p>Một lời nhắn nhỏ, dành cho đúng lúc.</p>
      <form onSubmit={(e) => void submit(e)}>
        <fieldset disabled={pending || !allowed}>
          <label>
            Lời nhắn của bạn
            <textarea
              aria-label="Lời nhắn bỏ vào lọ"
              rows={4}
              maxLength={1200}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                request.current = crypto.randomUUID();
              }}
              placeholder="Cảm ơn bạn vì hôm nay…"
            />
          </label>
          <small>{text.length}/1200 · Bản nháp chỉ ở thiết bị này</small>
          <label>
            Hẹn ngày mở
            <select
              aria-label="Hẹn ngày mở lời thương"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                request.current = crypto.randomUUID();
              }}
            >
              <option value="month-end">Cuối tháng này</option>
              <option value="scheduled">Chọn một ngày</option>
            </select>
          </label>
          {mode === 'scheduled' && (
            <label>
              Ngày mở
              <input
                aria-label="Ngày mở lời thương"
                required
                type="date"
                min={today}
                max={String(+today.slice(0, 4) + 5) + today.slice(4)}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  request.current = crypto.randomUUID();
                }}
              />
            </label>
          )}
          {photoEnabled && (
            <div className="jar-photo-row">
              <label className="button quiet tiny-action jar-photo-picker-label">
                <Camera size={14} />
                {photoFile ? 'Đổi ảnh kỉ niệm' : 'Gửi thêm 1 bức ảnh'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  aria-label="Chọn ảnh gửi kèm lời thương"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 20 * 1024 * 1024) {
                      setPhotoError('Mỗi ảnh tối đa 20 MB. Hãy chọn ảnh nhỏ hơn.');
                      return;
                    }
                    setPhotoError('');
                    setPhotoFile(file);
                    request.current = pendingPhoto
                      ? readSubmissionKey(
                          requestKey,
                          JSON.stringify([
                            text,
                            mode,
                            mode === 'scheduled' ? date : null,
                            [file.name, file.size, file.lastModified],
                          ]),
                        )
                      : crypto.randomUUID();
                    setPendingPhoto(null);
                  }}
                />
              </label>
              {(photoFile || pendingPhoto) && (
                <button
                  type="button"
                  className="icon-button quiet"
                  aria-label="Bỏ chọn ảnh"
                  onClick={() => {
                    setPhotoFile(null);
                    setPendingPhoto(null);
                    setPhotoError('');
                    request.current = crypto.randomUUID();
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}
          {photoError && (
            <p role="alert" className="error">
              {photoError}
            </p>
          )}
          {pendingPhoto && !photoFile && (
            <p className="ritual-warning">
              Bản nháp có ảnh đính kèm. Chọn lại ảnh để tiếp tục gửi, hoặc bỏ chọn ảnh.
            </p>
          )}
          {previewUrl && (
            <div className="jar-composer-preview">
              <img src={previewUrl} alt="Ảnh đính kèm" />
              <small>📷 Ảnh sẽ được giữ bí mật cho đến khi mở lọ</small>
            </div>
          )}
          <p className="jar-consent-hint">
            <LockKeyhole size={17} />
            Đến hẹn hoặc tất cả cùng đồng ý. Gửi lời không tự tính là đồng ý.
          </p>
          <small>Ngày mở: {prettyDate(chosenDate || today)} · 00:00, giờ Việt Nam.</small>
          <button
            className="button primary full"
            disabled={!text.trim() || (!!pendingPhoto && !photoFile)}
          >
            {pending ? <LoaderCircle className="spin" size={17} /> : <Heart size={17} />}Bỏ lời
            thương vào lọ
          </button>
          {!allowed && (
            <p className="ritual-warning">Mời thêm một người để cùng dùng lọ điều thương.</p>
          )}
        </fieldset>
      </form>
    </section>
  );
}
function JarNote({
  note: n,
  disabled,
  onDelete,
  onVote,
}: {
  note: LoveNoteView;
  disabled: boolean;
  onDelete: () => void;
  onVote: () => void;
}) {
  return (
    <article
      className={'jar-card ' + (n.opened ? 'opened' : 'sealed')}
      aria-label={n.opened ? 'Lời thương đã mở' : 'Lời thương đang giữ kín'}
    >
      <header>
        <div>
          <UserAvatar name={n.authorName} url={n.authorAvatarUrl} />
          <span>
            <strong>{n.mine ? 'Bạn' : n.authorName}</strong>
            <small>{prettyDate(n.createdAt)}</small>
          </span>
        </div>
        {n.canDelete && (
          <button
            className="icon-button"
            aria-label="Xóa lời thương của bạn"
            disabled={disabled}
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        )}
      </header>
      {n.opened ? (
        <>
          <p className="jar-message">{n.text}</p>
          {n.photoUrl && (
            <div className="jar-opened-photo">
              <img src={n.photoUrl} alt="Ảnh trong lọ điều thương" loading="lazy" />
            </div>
          )}
        </>
      ) : (
        <div className="jar-sealed-body">
          <LockKeyhole size={22} />
          <strong>Để dành đến {prettyDate(n.unlockAt)}</strong>
          {n.hasPhoto && (
            <span className="jar-has-photo-badge">
              <Camera size={13} /> Kèm 1 bức ảnh bí mật
            </span>
          )}
          {n.mine ? (
            <details className="jar-own-preview">
              <summary title="Chỉ bạn đọc được trước khi mở">
                <MessageCircleHeart size={14} />
                Lời mình viết
              </summary>
              <p className="jar-message own-preview">{n.text}</p>
              {n.photoUrl && (
                <div className="jar-opened-photo own-preview">
                  <img src={n.photoUrl} alt="Ảnh bạn đã gửi" loading="lazy" />
                </div>
              )}
            </details>
          ) : (
            <small>Chưa đến ngày mở.</small>
          )}
        </div>
      )}
      <footer>
        {n.opened ? (
          <span className="jar-open-label">
            <Heart size={14} />
            Đã đủ điều kiện mở
          </span>
        ) : (
          <>
            <span
              className="jar-vote-count"
              role="img"
              aria-label={n.approvalCount + '/' + n.participantCount + ' người đồng ý mở sớm'}
              title={n.approvalCount + '/' + n.participantCount + ' người đồng ý mở sớm'}
            >
              {Array.from({ length: Math.min(n.participantCount, 10) }, (_, i) => (
                <i className={i < n.approvalCount ? 'voted' : ''} key={i}>
                  {i < n.approvalCount ? <Check size={12} /> : <Heart size={11} />}
                </i>
              ))}
              <small>
                {n.approvalCount}/{n.participantCount}
              </small>
            </span>
            {n.canApprove ? (
              <button className="button quiet" disabled={disabled} onClick={onVote}>
                {n.approvedByMe ? 'Rút lại đồng ý' : 'Đồng ý mở sớm'}
              </button>
            ) : n.membersChanged ? (
              <small>Thành viên đã thay đổi. Lời nhắn vẫn chờ ngày hẹn.</small>
            ) : null}
          </>
        )}
      </footer>
    </article>
  );
}
function PastQuestion({
  question,
  userId,
  space,
  root,
  pending,
  run,
  onClose,
  onChanged,
}: {
  question: QuestionView;
  userId: string;
  space: string;
  root: string;
  pending: boolean;
  run: (action: () => Promise<void>) => Promise<boolean>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [current, setCurrent] = useState(question);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="ritual-history-dialog"
      aria-label="Câu hỏi đã giữ"
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onClose();
      }}
    >
      <header>
        <span className="eyebrow">{prettyDate(question.date)}</span>
        <button
          className="icon-button"
          aria-label="Đóng câu hỏi đã giữ"
          disabled={pending}
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      <AnswerCard
        key={current.id}
        question={current}
        userId={userId}
        space={space}
        pending={pending}
        onSubmit={(q, text, requestId) =>
          run(async () => {
            setCurrent(
              await api<QuestionView>(root + '/answers', {
                method: 'POST',
                body: JSON.stringify({
                  roundId: q.id,
                  promptId: q.promptId,
                  date: q.date,
                  text,
                  requestId,
                  expectedRevision: q.revision,
                }),
              }),
            );
          })
        }
        onWithdraw={(q) =>
          run(async () => {
            setCurrent(
              await api<QuestionView>(root + '/questions/' + q.id + '/withdraw', {
                method: 'POST',
                body: JSON.stringify({ expectedRevision: q.revision }),
              }),
            );
          })
        }
        onMemory={(q) =>
          run(async () => {
            await api(root + '/questions/' + q.id + '/memory', {
              method: 'POST',
              body: JSON.stringify({ expectedRevision: q.revision }),
            });
            await onChanged();
          })
        }
      />
    </dialog>
  );
}
