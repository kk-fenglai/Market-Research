import { useEffect, useRef, useState } from 'react';
import { btn } from '../components/research/dark';
import { streamChat, type ChatMessage } from '../api/chat';

// Perplexity 风格「Ask AI」入口:空态大搜索框 → 发送后转对话流,SSE 逐字渲染。
// 可切换「Web 搜索(Perplexity,带引用)/ 直接对话(DeepSeek)」。

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<null | (() => void)>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => abortRef.current?.(), []); // 卸载时中止在途流

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
      onDelta: (t) => patchLast((m) => ({ ...m, content: m.content + t })),
      onDone: ({ citations, provider }) => {
        patchLast((m) => ({ ...m, provider, ...(citations.length ? { citations } : {}) }));
        setStreaming(false);
        abortRef.current = null;
      },
      onError: (msg) => {
        setError(msg);
        setStreaming(false);
        abortRef.current = null;
        // 空占位(无内容)则移除,避免留下空气泡。
        setMessages((prev) => (prev[prev.length - 1]?.content ? prev : prev.slice(0, -1)));
      },
    });
  }

  function stop() {
    abortRef.current?.();
    abortRef.current = null;
    setStreaming(false);
  }

  const empty = messages.length === 0;

  return (
    // 手机:用 svh(小视口高度)避免输入条被浏览器地址栏/工具条遮住;桌面维持原 vh。
    <div className="mx-auto flex h-[calc(100svh-7rem)] max-w-3xl flex-col md:h-[calc(100vh-8rem)]">
      {empty ? (
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
  );
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
