import { useEffect, useRef, useState } from 'react';
import { btn } from './dark';
import { diffJson, collapseUnchanged, diffStats } from './jsonDiff';
import { streamChat, type ChatMessage } from '../../api/chat';
import {
  proposeRevision, applyRevision, rollbackRevision, discardRevision, listRevisions,
  SECTION_LABELS,
  type ResearchReport, type RevisableSection, type RevisionProposal, type RevisionListItem,
} from '../../api/research';

/**
 * 报告 AI 助手:侧边抽屉,两个页签。
 *   提问 —— 以本报告为上下文的问答(复用 /api/chat,带 reportId)。
 *   改写 —— 让 AI 重写某个分区:生成提案 → 看 diff → 应用才写库,且可回滚。
 */

const ASK_EXAMPLES = [
  '这份报告的结论最大的风险点是什么?',
  '竞品里谁和我们最直接冲突?为什么?',
  '市场规模的估算依据靠谱吗?',
];

const REVISE_EXAMPLES = [
  '补充两家欧洲竞品,并重算价格带',
  '结论过于乐观,按更保守的口径重写',
  '把用户画像细分成 2C 和 2B 两类',
];

type Tab = 'ask' | 'revise';

export default function ReportAssistant({ reportId, report, activeSection, onReportChange }: {
  reportId: string;
  report: ResearchReport;
  /** 工作台当前分区,用作改写页签的默认选择 */
  activeSection: RevisableSection;
  /** 报告被改写/回滚后回调,让工作台刷新渲染 */
  onReportChange: (r: ResearchReport) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('ask');

  return (
    <>
      {/* 悬浮唤起按钮 */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="no-print fixed bottom-6 right-6 z-40 flex items-center gap-xs rounded-full bg-primary px-md py-3 font-label-md text-sm font-semibold text-on-primary aura-shadow transition-all hover:opacity-90 active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
          AI 助手
        </button>
      )}

      {open && (
        <div className="no-print fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-full max-w-[480px] flex-col bg-surface shadow-2xl">
            {/* 头部 + 页签 */}
            <div className="ios-hairline ios-hairline--bottom shrink-0 px-lg pt-lg">
              <div className="mb-md flex items-start justify-between gap-sm">
                <div className="min-w-0">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">AI 助手</h2>
                  <p className="truncate font-data-sm text-data-sm text-on-surface-variant">{report.productName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="flex gap-xs">
                {([['ask', '提问', 'forum'], ['revise', '改写', 'edit_note']] as const).map(([id, label, icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`flex items-center gap-xs rounded-t-lg px-md py-sm font-body-md text-sm transition-colors ${
                      tab === id ? 'border-b-2 border-primary font-semibold text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'ask' ? (
              <AskTab reportId={reportId} />
            ) : (
              <ReviseTab
                reportId={reportId}
                report={report}
                activeSection={activeSection}
                onReportChange={onReportChange}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────  提问页签  ─────────────────────────────

function AskTab({ reportId }: { reportId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convoIdRef = useRef<string | null>(null);
  const abortRef = useRef<null | (() => void)>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => abortRef.current?.(), []);

  function send(text: string) {
    const q = text.trim();
    if (!q || streaming) return;
    setError(null);
    setInput('');
    const convo: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages([...convo, { role: 'assistant', content: '' }]);
    setStreaming(true);

    const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = fn(next[next.length - 1]);
        return next;
      });

    abortRef.current = streamChat(convo, {
      reportId,
      conversationId: convoIdRef.current,
      onMeta: ({ conversationId }) => { convoIdRef.current ||= conversationId; },
      onDelta: (t) => patchLast((m) => ({ ...m, content: m.content + t })),
      onDone: () => { setStreaming(false); abortRef.current = null; },
      onError: (msg) => {
        setError(msg);
        setStreaming(false);
        abortRef.current = null;
        setMessages((prev) => (prev[prev.length - 1]?.content ? prev : prev.slice(0, -1)));
      },
    });
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-md overflow-y-auto px-lg py-md">
        {messages.length === 0 ? (
          <div className="pt-md">
            <p className="mb-md font-body-md text-sm text-on-surface-variant">
              针对这份报告提问,AI 会带着报告全文作答。
            </p>
            <div className="space-y-xs">
              {ASK_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => send(ex)}
                  className="card-level-1 aura-card w-full rounded-xl px-md py-sm text-left font-body-md text-sm text-on-surface-variant hover:text-on-surface"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex gap-sm'}>
              {m.role === 'user' ? (
                <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-surface-container-high px-md py-sm font-body-md text-sm text-on-surface">{m.content}</div>
              ) : (
                <>
                  <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-primary">smart_toy</span>
                  <div className="min-w-0 flex-1 whitespace-pre-wrap font-body-md text-sm text-on-surface">
                    {m.content}
                    {streaming && i === messages.length - 1 && (
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" />
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
        {error && <p className="rounded-xl bg-error/10 px-md py-sm font-data-sm text-data-sm text-error">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="ios-hairline ios-hairline--top shrink-0 p-lg">
        <div className="ios-card p-sm focus-within:ring-2 focus-within:ring-primary/20">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            rows={1}
            placeholder="针对这份报告提问…"
            className="max-h-32 w-full resize-none bg-transparent px-sm py-xs font-body-md text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40"
          />
          <div className="flex justify-end px-sm pt-xs">
            {streaming ? (
              <button type="button" onClick={() => { abortRef.current?.(); abortRef.current = null; setStreaming(false); }} className={btn('secondary')}>
                <span className="material-symbols-outlined text-[16px]">stop</span> Stop
              </button>
            ) : (
              <button type="button" onClick={() => send(input)} disabled={!input.trim()} className={btn('primary')}>
                <span className="material-symbols-outlined text-[16px]">arrow_upward</span> 发送
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────  改写页签  ─────────────────────────────

function ReviseTab({ reportId, report, activeSection, onReportChange }: {
  reportId: string;
  report: ResearchReport;
  activeSection: RevisableSection;
  onReportChange: (r: ResearchReport) => void;
}) {
  const [section, setSection] = useState<RevisableSection>(activeSection);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<RevisionProposal | null>(null);
  const [revisions, setRevisions] = useState<RevisionListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 工作台切分区时,未开始编辑就跟着切,减少一次手动选择。
  useEffect(() => { if (!proposal && !instruction) setSection(activeSection); }, [activeSection, proposal, instruction]);

  async function refreshRevisions() {
    try { setRevisions(await listRevisions(reportId)); } catch { /* 历史加载失败不阻塞主流程 */ }
  }
  useEffect(() => { refreshRevisions(); }, [reportId]);

  async function onPropose() {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    setProposal(null);
    try {
      setProposal(await proposeRevision(reportId, { section, instruction: instruction.trim() }));
    } catch (e) {
      setError(errText(e, 'AI 改写失败,请调整指令后重试'));
    } finally {
      setBusy(false);
    }
  }

  async function onApply() {
    if (!proposal || busy) return;
    setBusy(true);
    setError(null);
    try {
      onReportChange(await applyRevision(reportId, proposal.revisionId));
      setProposal(null);
      setInstruction('');
      refreshRevisions();
    } catch (e) {
      setError(errText(e, '应用失败,请重试'));
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    if (!proposal) return;
    const id = proposal.revisionId;
    setProposal(null);
    try { await discardRevision(reportId, id); } finally { refreshRevisions(); }
  }

  async function onRollback(revId: string) {
    if (!window.confirm('回滚这次改写?该分区会恢复成改动前的内容。')) return;
    setBusy(true);
    setError(null);
    try {
      onReportChange(await rollbackRevision(reportId, revId));
      refreshRevisions();
    } catch (e) {
      setError(errText(e, '回滚失败,请重试'));
    } finally {
      setBusy(false);
    }
  }

  const sectionEmpty = report[section] == null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
      {/* 分区选择 */}
      <label className="mb-xs block font-label-caps text-label-caps uppercase text-on-surface-variant">改写哪个分区</label>
      <select
        value={section}
        onChange={(e) => { setSection(e.target.value as RevisableSection); setProposal(null); }}
        className="mb-md w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-md py-sm font-body-md text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
      >
        {(Object.keys(SECTION_LABELS) as RevisableSection[]).map((k) => (
          <option key={k} value={k}>
            {SECTION_LABELS[k]}{report[k] == null ? '(当前为空)' : ''}
          </option>
        ))}
      </select>

      {/* 指令 */}
      <label className="mb-xs block font-label-caps text-label-caps uppercase text-on-surface-variant">修改指令</label>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={3}
        placeholder={sectionEmpty ? '该分区当前为空,可让 AI 直接生成内容…' : '例如:补充两家欧洲竞品,并重算价格带'}
        className="mb-sm w-full resize-none rounded-lg border border-outline-variant bg-surface-container-lowest px-md py-sm font-body-md text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/40"
      />
      {!instruction && !proposal && (
        <div className="mb-sm flex flex-wrap gap-xs">
          {REVISE_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setInstruction(ex)}
              className="rounded-full bg-surface-container px-sm py-1 font-data-sm text-data-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={onPropose} disabled={!instruction.trim() || busy} className={`${btn('primary')} w-full justify-center`}>
        <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
        {busy && !proposal ? 'AI 生成中…' : '生成修改建议'}
      </button>
      {busy && !proposal && (
        <p className="mt-xs text-center font-data-sm text-data-sm text-on-surface-variant">
          需要重写整个分区,通常 1 分钟左右,请勿关闭面板。
        </p>
      )}

      {error && <p className="mt-md rounded-xl bg-error/10 px-md py-sm font-data-sm text-data-sm text-error">{error}</p>}

      {/* 提案 diff */}
      {proposal && (
        <div className="mt-lg">
          {proposal.mode === 'append' && proposal.added?.length > 0 && <AppendNote added={proposal.added} />}
          {proposal.restored?.length > 0 && <RestoredNote restored={proposal.restored} />}
          {proposal.warnings?.length > 0 && <DroppedWarning warnings={proposal.warnings} />}
          <DiffView before={proposal.before} after={proposal.after} label={proposal.label} />
          <div className="mt-md flex gap-sm">
            <button type="button" onClick={onApply} disabled={busy} className={`${btn('primary')} flex-1 justify-center`}>
              <span className="material-symbols-outlined text-[18px]">check</span> {busy ? '应用中…' : '应用到报告'}
            </button>
            <button type="button" onClick={onDiscard} disabled={busy} className={btn('secondary')}>放弃</button>
          </div>
          <p className="mt-xs font-data-sm text-data-sm text-on-surface-variant">
            应用后原内容会存档,可在下方历史里随时回滚。
          </p>
        </div>
      )}

      {/* 改写历史 */}
      {revisions.length > 0 && (
        <div className="mt-xl">
          <div className="mb-sm font-label-caps text-label-caps uppercase text-on-surface-variant">改写历史</div>
          <ul className="space-y-xs">
            {revisions.map((r) => (
              <li key={r.id} className="card-level-1 rounded-xl px-md py-sm">
                <div className="flex items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-xs">
                      <span className="font-body-md text-sm font-semibold text-on-surface">{r.label}</span>
                      <StatusChip status={r.status} />
                    </div>
                    <p className="mt-base line-clamp-2 font-data-sm text-data-sm text-on-surface-variant">{r.instruction}</p>
                    <p className="mt-base font-data-sm text-[10px] text-on-surface-variant/70">
                      {new Date(r.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  {r.status === 'applied' && (
                    <button
                      type="button"
                      onClick={() => onRollback(r.id)}
                      disabled={busy}
                      className="shrink-0 rounded-full border border-outline-variant px-sm py-base font-data-sm text-data-sm text-on-surface-variant transition-colors hover:border-error hover:text-error disabled:opacity-50"
                    >
                      回滚
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: RevisionListItem['status'] }) {
  const map: Record<RevisionListItem['status'], { text: string; cls: string }> = {
    proposed: { text: '待确认', cls: 'bg-surface-container-highest text-on-surface-variant' },
    applied: { text: '已应用', cls: 'bg-secondary/10 text-secondary' },
    discarded: { text: '已放弃', cls: 'bg-surface-container-highest text-on-surface-variant' },
    rolled_back: { text: '已回滚', cls: 'bg-error/10 text-error' },
  };
  const s = map[status];
  return <span className={`rounded-full px-sm py-base font-data-sm text-[10px] uppercase ${s.cls}`}>{s.text}</span>;
}

/** 纯新增:AI 只生成了新条目,原有条目由代码原样保留,不存在被改写的风险。 */
function AppendNote({ added }: { added: string[] }) {
  return (
    <div className="mb-md rounded-xl border border-secondary/30 bg-secondary/5 px-md py-sm">
      <div className="flex items-center gap-xs font-body-md text-sm font-semibold text-secondary">
        <span className="material-symbols-outlined text-[18px]">add_circle</span>
        新增 {added.length} 条:{added.join('、')}
      </div>
      <p className="mt-xs font-data-sm text-data-sm text-on-surface-variant">
        本次为纯追加,原有条目未做任何改动。
      </p>
    </div>
  );
}

/** AI 手滑删掉、系统已自动补回的条目 —— 只作告知,无需用户处理。 */
function RestoredNote({ restored }: { restored: { field: string; items: string[] }[] }) {
  const total = restored.reduce((n, r) => n + r.items.length, 0);
  return (
    <div className="mb-md rounded-xl border border-outline-variant bg-surface-container-low px-md py-sm">
      <div className="flex items-center gap-xs font-body-md text-sm font-semibold text-on-surface">
        <span className="material-symbols-outlined text-[18px] text-primary">shield</span>
        已自动补回 AI 误删的 {total} 条内容
      </div>
      <ul className="mt-xs space-y-base">
        {restored.map((r) => (
          <li key={r.field} className="font-data-sm text-data-sm text-on-surface-variant">
            <span className="text-on-surface">{r.field}</span>:{r.items.join('、')}
          </li>
        ))}
      </ul>
      <p className="mt-xs font-data-sm text-data-sm text-on-surface-variant">
        这些条目你的指令里没提到,判定为模型重写时的误删,已按原样恢复。
      </p>
    </div>
  );
}

/**
 * 补回之后仍然缺失的条目。这些条目的名字在指令里出现过,可能确实是你要删的,
 * 所以系统不擅自恢复,而是点名列出让你在应用前确认。
 */
function DroppedWarning({ warnings }: { warnings: { field: string; dropped: string[] }[] }) {
  const total = warnings.reduce((n, w) => n + w.dropped.length, 0);
  return (
    <div className="mb-md rounded-xl border border-error/30 bg-error/5 px-md py-sm">
      <div className="flex items-center gap-xs font-body-md text-sm font-semibold text-error">
        <span className="material-symbols-outlined text-[18px]">warning</span>
        本次改写删掉了 {total} 条原有内容
      </div>
      <ul className="mt-xs space-y-base">
        {warnings.map((w) => (
          <li key={w.field} className="font-data-sm text-data-sm text-on-surface-variant">
            <span className="text-on-surface">{w.field}</span>:{w.dropped.join('、')}
          </li>
        ))}
      </ul>
      <p className="mt-xs font-data-sm text-data-sm text-on-surface-variant">
        若非本意,请点「放弃」重来;应用后也可在下方历史里回滚。
      </p>
    </div>
  );
}

/** 改前/改后的行级 diff,折叠未改动的大段。 */
function DiffView({ before, after, label }: { before: unknown; after: unknown; label: string }) {
  const lines = diffJson(before, after);
  const { added, removed } = diffStats(lines);
  const shown = collapseUnchanged(lines);

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant">
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-md py-sm">
        <span className="font-body-md text-sm font-semibold text-on-surface">{label} · 变更预览</span>
        <span className="font-data-sm text-data-sm">
          <span className="text-secondary">+{added}</span> <span className="text-error">−{removed}</span>
        </span>
      </div>
      <div className="max-h-80 overflow-auto bg-surface-container-lowest p-sm font-data-sm text-[11px] leading-relaxed">
        {shown.map((l, i) =>
          l === null ? (
            <div key={i} className="select-none py-1 text-center text-on-surface-variant/50">⋯</div>
          ) : (
            <div
              key={i}
              className={`whitespace-pre-wrap break-all px-1 ${
                l.type === 'add' ? 'bg-secondary/10 text-secondary'
                : l.type === 'del' ? 'bg-error/10 text-error line-through decoration-error/40'
                : 'text-on-surface-variant'
              }`}
            >
              <span className="select-none opacity-50">{l.type === 'add' ? '+ ' : l.type === 'del' ? '− ' : '  '}</span>
              {l.text}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/** 从 axios 错误里取后端给的中文提示,取不到用兜底文案。 */
function errText(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return msg || fallback;
}
