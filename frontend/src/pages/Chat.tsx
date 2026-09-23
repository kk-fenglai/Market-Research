import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { btn } from '../components/research/dark';
import {
  streamChat,
  listConversations,
  getConversation,
  deleteConversation,
  renameConversation,
  type ChatMessage,
  type ConversationListItem,
} from '../api/chat';

// Perplexity 风格「Ask AI」入口:空态大搜索框 → 发送后转对话流,SSE 逐字渲染。
// 可切换「Web 搜索(Perplexity,带引用)/ 直接对话(DeepSeek)」。
// 左侧为历史记录:会话持久化在服务端,URL /chat/:conversationId 可直达。

// 引擎标签:回答由谁生成,一眼可辨。
const PROVIDER_LABEL: Record<string, { name: string; icon: string }> = {
  deepseek: { name: 'DeepSeek · 直连', icon: 'bolt' },
  perplexity: { name: 'Perplexity · 联网', icon: 'travel_explore' },
};

const EXAMPLES = [
  '带 E-ink 屏的桌面天气站,现在市面上有哪些竞品?',
  '宠物自动喂食器这个品类红海了吗?差异化切口在哪?',
  '便携式空气质量检测仪的主流价位段是多少?',
  '开源掌机(Linux 手持)有哪些玩家,他们各打什么场景?',
];

export default function Chat() {
  const { conversationId: routeId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false); // 移动端抽屉
  const abortRef = useRef<null | (() => void)>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // 当前会话 id 用 ref 同步保存:发送时要读到最新值,不受闭包快照影响。
  const convoIdRef = useRef<string | null>(routeId ?? null);
  // messages 当前对应哪个会话。新会话是本地先有内容、后拿到 id,
  // 必须靠它挡住「换 URL → 回拉服务端」把在途流冲掉。
  const hydratedIdRef = useRef<string | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => abortRef.current?.(), []); // 卸载时中止在途流

  const refreshList = useCallback(async () => {
    try {
      setConversations(await listConversations());
    } catch {
      /* 历史列表失败不打断对话 */
    }
  }, []);

  useEffect(() => { refreshList(); }, [refreshList]);

  // URL 变化 → 载入对应会话(或清空成新对话)。
  useEffect(() => {
    const id = routeId ?? null;
    // 本地状态已经是这个会话(刚新建、或刚拉过),不要回拉——否则会冲掉在途的流式回答。
    if (hydratedIdRef.current === id) return;
    convoIdRef.current = id;
    if (!id) {
      setMessages([]);
      setError(null);
      hydratedIdRef.current = null;
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    getConversation(id)
      .then((c) => { if (!cancelled) { setMessages(c.messages); setError(null); hydratedIdRef.current = id; } })
      .catch(() => { if (!cancelled) setError('该会话不存在或已删除'); })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [routeId]);

  function send(text: string) {
    const q = text.trim();
    if (!q || streaming) return;
    setError(null);
    setInput('');
    const convo: ChatMessage[] = [...messages, { role: 'user', content: q }];
    // 追加用户消息 + 空的助手占位(供流式填充)。
    setMessages([...convo, { role: 'assistant', content: '' }]);
    setStreaming(true);

    // 就地更新最后一条助手消息。
    const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = fn(next[next.length - 1]);
        return next;
      });

    abortRef.current = streamChat(convo, {
      useSearch,
      conversationId: convoIdRef.current,
      onMeta: ({ conversationId }) => {
        // 新会话:挂上 id 并把地址换成深链(replace,避免每轮多一条历史记录)。
        // 先认领 hydratedId,再 navigate,这样上面的 effect 会跳过回拉。
        if (!convoIdRef.current) {
          convoIdRef.current = conversationId;
          hydratedIdRef.current = conversationId;
          navigate(`/chat/${conversationId}`, { replace: true });
        }
      },
      onDelta: (t) => patchLast((m) => ({ ...m, content: m.content + t })),
      onDone: ({ citations, provider }) => {
        patchLast((m) => ({ ...m, provider, ...(citations.length ? { citations } : {}) }));
        setStreaming(false);
        abortRef.current = null;
        refreshList();
      },
      onError: (msg) => {
        setError(msg);
        setStreaming(false);
        abortRef.current = null;
        // 空占位(无内容)则移除,避免留下空气泡。
        setMessages((prev) => (prev[prev.length - 1]?.content ? prev : prev.slice(0, -1)));
        refreshList();
      },
    });
  }

  function stop() {
    abortRef.current?.();
    abortRef.current = null;
    setStreaming(false);
    refreshList(); // 服务端会保存已生成的部分
  }

  /** 切换会话/新建会话前,先掐掉在途的流。 */
  function goto(id: string | null) {
    abortRef.current?.();
    abortRef.current = null;
    setStreaming(false);
    setHistoryOpen(false);
    navigate(id ? `/chat/${id}` : '/chat');
  }

  async function onDelete(id: string) {
    if (!window.confirm('删除这条会话记录?此操作不可撤销。')) return;
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (convoIdRef.current === id) goto(null); // 删的是当前会话 → 回到新对话
    } catch {
      setError('删除失败,请重试');
    }
  }

  async function onRename(id: string, title: string) {
    const clean = title.trim();
    if (!clean) return;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean } : c)));
    try {
      await renameConversation(id, clean);
    } catch {
      refreshList(); // 失败则回滚成服务端真实值
    }
  }

  const empty = messages.length === 0 && !loadingHistory;

  const historyPanel = (
    <HistoryPanel
      conversations={conversations}
      activeId={routeId ?? null}
      onSelect={(id) => goto(id)}
      onNew={() => goto(null)}
      onDelete={onDelete}
      onRename={onRename}
    />
  );

  return (
    // 手机:用 svh(小视口高度)避免输入条被浏览器地址栏/工具条遮住;桌面维持原 vh。
    <div className="flex h-[calc(100svh-7rem)] gap-lg md:h-[calc(100vh-8rem)]">
      {/* ── 历史记录:桌面常驻左栏 ── */}
      <aside className="hidden w-72 shrink-0 lg:block">{historyPanel}</aside>

      {/* ── 历史记录:移动端抽屉 ── */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setHistoryOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-80 max-w-[85vw] bg-surface p-md shadow-xl">
            {historyPanel}
          </div>
        </div>
      )}

      {/* ── 对话区 ── */}
      <div className="mx-auto flex min-w-0 max-w-3xl flex-1 flex-col">
        {/* 移动端:打开历史 + 新对话 */}
        <div className="mb-sm flex shrink-0 items-center justify-between lg:hidden">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-xs rounded-full bg-surface-container px-md py-1.5 font-data-sm text-data-sm text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[18px]">history</span> 历史记录
          </button>
          {!empty && (
            <button
              type="button"
              onClick={() => goto(null)}
              className="flex items-center gap-xs rounded-full bg-surface-container px-md py-1.5 font-data-sm text-data-sm text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[18px]">add</span> 新对话
            </button>
          )}
        </div>

        {loadingHistory ? (
          <div className="flex flex-1 items-center justify-center font-data-sm text-data-sm text-on-surface-variant">
            载入会话中…
          </div>
        ) : empty ? (
          // ── 空态:居中大搜索框 ──
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto py-md">
            <div className="mb-md flex flex-col items-center text-center md:mb-lg">
              <span className="material-symbols-outlined mb-sm text-[32px] text-primary md:text-[40px]">forum</span>
              <h1 className="font-display text-headline-sm text-on-surface md:text-display">Ask HardScout AI</h1>
              <p className="mt-xs px-md font-body-md text-sm text-on-surface-variant md:text-base">直接提问硬件竞品、市场、选型 —— 秒级作答</p>
            </div>
            <div className="w-full max-w-2xl">
              <Composer
                value={input} onChange={setInput} onSend={() => send(input)}
                streaming={streaming} useSearch={useSearch} onToggleSearch={() => setUseSearch((v) => !v)}
              />
            </div>
            <div className="mt-lg grid w-full max-w-2xl grid-cols-1 gap-xs sm:grid-cols-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex} type="button" onClick={() => send(ex)}
                  className="card-level-1 aura-card rounded-xl px-md py-sm text-left font-body-md text-sm text-on-surface-variant hover:text-on-surface"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // ── 对话流 ──
          <>
            <div className="min-h-0 flex-1 space-y-lg overflow-y-auto pb-lg">
              {messages.map((m, i) => (
                <Bubble key={i} message={m} streaming={streaming && i === messages.length - 1} />
              ))}
              {error && <p className="rounded-xl bg-error/10 px-md py-sm font-data-sm text-data-sm text-error">{error}</p>}
              <div ref={bottomRef} />
            </div>
            <div className="ios-hairline ios-hairline--top shrink-0 pt-md">
              <Composer
                value={input} onChange={setInput} onSend={() => send(input)}
                streaming={streaming} onStop={stop} useSearch={useSearch} onToggleSearch={() => setUseSearch((v) => !v)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── 历史记录面板(按时间分组的会话列表 + 新对话按钮)──
function HistoryPanel({
  conversations, activeId, onSelect, onNew, onDelete, onRename,
}: {
  conversations: ConversationListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  function beginRename(c: ConversationListItem) {
    setEditingId(c.id);
    setDraft(c.title);
  }
  function commitRename() {
    if (editingId) onRename(editingId, draft);
    setEditingId(null);
  }

  const groups = groupByDate(conversations);

  return (
    <div className="flex h-full flex-col">
      <button type="button" onClick={onNew} className={`${btn('primary')} mb-md w-full justify-center`}>
        <span className="material-symbols-outlined text-[18px]">add</span> 新对话
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {conversations.length === 0 ? (
          <p className="px-sm py-md font-data-sm text-data-sm text-on-surface-variant">
            还没有历史对话。提问后会自动保存在这里。
          </p>
        ) : (
          groups.map(([label, items]) => (
            <div key={label} className="mb-md">
              <div className="px-sm pb-xs font-label-caps text-label-caps uppercase text-on-surface-variant/70">{label}</div>
              <ul className="space-y-base">
                {items.map((c) => {
                  const active = c.id === activeId;
                  return (
                    <li key={c.id}>
                      {editingId === c.id ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-full rounded-lg bg-surface-container-high px-sm py-xs font-body-md text-sm text-on-surface outline-none ring-2 ring-primary/30"
                        />
                      ) : (
                        <div
                          className={`group flex items-center gap-xs rounded-lg px-sm py-xs transition-colors ${
                            active ? 'bg-surface-container-high' : 'hover:bg-surface-container-low'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelect(c.id)}
                            title={c.title}
                            className="min-w-0 flex-1 truncate text-left font-body-md text-sm text-on-surface"
                          >
                            {c.title}
                          </button>
                          <button
                            type="button"
                            onClick={() => beginRename(c)}
                            title="重命名"
                            className="shrink-0 text-on-surface-variant opacity-0 transition-opacity hover:text-on-surface group-hover:opacity-100"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(c.id)}
                            title="删除"
                            className="shrink-0 text-on-surface-variant opacity-0 transition-opacity hover:text-error group-hover:opacity-100"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** 按 今天 / 昨天 / 最近 7 天 / 更早 分组,保留列表原有的时间倒序。 */
function groupByDate(items: ConversationListItem[]): [string, ConversationListItem[]][] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const buckets: Record<string, ConversationListItem[]> = { 今天: [], 昨天: [], '最近 7 天': [], 更早: [] };

  for (const c of items) {
    const t = new Date(c.updatedAt).getTime();
    if (t >= startOfToday.getTime()) buckets['今天'].push(c);
    else if (t >= startOfToday.getTime() - dayMs) buckets['昨天'].push(c);
    else if (t >= startOfToday.getTime() - 7 * dayMs) buckets['最近 7 天'].push(c);
    else buckets['更早'].push(c);
  }
  return Object.entries(buckets).filter(([, v]) => v.length > 0);
}

// ── 一条消息气泡 ──
function Bubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-surface-container-high px-md py-sm font-body-md text-on-surface">{message.content}</div>
      </div>
    );
  }
  const engine = message.provider ? PROVIDER_LABEL[message.provider] : null;
  return (
    <div className="flex gap-sm">
      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-primary">smart_toy</span>
      <div className="min-w-0 flex-1">
        {engine && !streaming && (
          <div className="mb-xs inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container px-sm py-0.5 font-data-sm text-[10px] text-on-surface-variant">
            <span className="material-symbols-outlined text-[13px]">{engine.icon}</span>{engine.name}
          </div>
        )}
        <div className="whitespace-pre-wrap font-body-md text-on-surface">
          {message.content}
          {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" />}
        </div>
        {message.citations && message.citations.length > 0 && (
          <div className="mt-sm border-t border-outline-variant/40 pt-sm">
            <div className="mb-xs font-label-caps text-label-caps uppercase text-on-surface-variant">Sources</div>
            <ol className="space-y-1">
              {message.citations.map((c, i) => (
                <li key={i} className="flex items-start gap-xs font-data-sm text-data-sm">
                  <span className="text-on-surface-variant">{i + 1}.</span>
                  <a href={c} target="_blank" rel="noreferrer noopener" className="break-all text-primary hover:opacity-70">{c}</a>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 输入条(搜索框 + Web 搜索开关 + 发送/停止)──
function Composer({ value, onChange, onSend, streaming, onStop, useSearch, onToggleSearch }: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  streaming: boolean;
  onStop?: () => void;
  useSearch: boolean;
  onToggleSearch: () => void;
}) {
  return (
    <div className="ios-card p-sm transition-all focus-within:ring-2 focus-within:ring-primary/20">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
        }}
        rows={1}
        placeholder="问点什么…(Enter 发送,Shift+Enter 换行)"
        className="max-h-40 w-full resize-none bg-transparent px-sm py-xs font-body-md text-on-surface outline-none placeholder:text-on-surface-variant/40"
      />
      <div className="flex items-center justify-between px-sm pt-xs">
        <button
          type="button" onClick={onToggleSearch}
          title={useSearch ? '联网搜索:Perplexity(sonar-pro),回答附来源。点击切回 DeepSeek 直连' : '直连对话:DeepSeek(无联网)。点击开启 Perplexity 联网搜索'}
          className={`flex items-center gap-xs rounded-full px-sm py-1 font-data-sm text-data-sm transition-colors ${
            useSearch ? 'bg-surface-container-high font-semibold text-on-surface' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">{useSearch ? 'travel_explore' : 'bolt'}</span>
          {useSearch ? 'Perplexity · 联网搜索' : 'DeepSeek · 直连'}
        </button>
        {streaming ? (
          <button type="button" onClick={onStop} className={btn('secondary')}>
            <span className="material-symbols-outlined text-[16px]">stop</span> Stop
          </button>
        ) : (
          <button type="button" onClick={onSend} disabled={!value.trim()} className={btn('primary')}>
            <span className="material-symbols-outlined text-[16px]">arrow_upward</span> Send
          </button>
        )}
      </div>
    </div>
  );
}
