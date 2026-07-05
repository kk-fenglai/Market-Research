import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { btn } from '../components/research/dark';
import { listProjects, deleteProject, type ProjectListItem } from '../api/research';

/** Dashboard —— 市场调研工程总览:概要指标 + 最佳机会 + 最近调研。 */
export default function Projects() {
  const [reports, setReports] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    try {
      setReports(await listProjects());
    } catch {
      setError(true);
    }
  }
  useEffect(() => { load(); }, []);

  async function onDelete(id: string) {
    if (!window.confirm('Delete this report? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await deleteProject(id);
      setReports((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } finally {
      setDeleting(null);
    }
  }

  const stats = useMemo(() => {
    const list = reports ?? [];
    const completed = list.filter((r) => r.status === 'completed');
    const inProgress = list.filter((r) => r.status === 'pending' || r.status === 'running');
    const scored = completed.filter((r) => r.score != null) as (ProjectListItem & { score: number })[];
    const avg = scored.length ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : null;
    const best = scored.length ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : null;
    return { total: list.length, completed: completed.length, inProgress: inProgress.length, avg, best };
  }, [reports]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="ios-hairline ios-hairline--inset mb-lg pb-md">
        <h1 className="font-display text-display text-on-surface">Dashboard</h1>
        <p className="mt-xs font-body-md text-on-surface-variant">Your market-research command center.</p>
      </div>

      {error ? (
        <Empty tone="error">Failed to load dashboard.</Empty>
      ) : reports === null ? (
        <Empty>Loading…</Empty>
      ) : reports.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Stat cards */}
          <div className="mb-lg grid grid-cols-2 gap-md lg:grid-cols-4">
            <Stat icon="analytics" label="Total Studies" value={stats.total} tone="text-on-surface" />
            <Stat icon="task_alt" label="Completed" value={stats.completed} tone="text-secondary" />
            <Stat icon="trending_up" label="Avg Opportunity" value={stats.avg ?? '—'} suffix={stats.avg != null ? '/100' : ''} tone="text-tertiary" />
            <Stat icon="pending" label="In Progress" value={stats.inProgress} tone="text-primary" />
          </div>

          {/* Top opportunity highlight */}
          {stats.best && (
            <Link
              to={`/research/${stats.best.id}`}
              className="ios-card aura-card relative mb-lg flex items-center gap-md overflow-hidden p-lg"
            >
              <div className="z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-secondary/15">
                <span className="material-symbols-outlined text-3xl text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
              </div>
              <div className="z-10 min-w-0 flex-1">
                <div className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">Top Opportunity</div>
                <div className="mt-xs truncate font-headline-sm text-headline-sm text-on-surface">{stats.best.productName}</div>
              </div>
              <div className="z-10 flex shrink-0 items-baseline gap-1">
                <span className="font-data-lg text-[40px] font-extrabold text-on-surface">{stats.best.score}</span>
                <span className="font-data-sm text-sm text-on-surface-variant">/ 100</span>
              </div>
              {/* 柔光装饰 */}
              <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-secondary/10 blur-3xl" />
            </Link>
          )}

          {/* Recent studies */}
          <div className="mb-md flex items-center justify-between">
            <h2 className="font-label-caps text-label-caps uppercase text-on-surface-variant">Recent Studies</h2>
            <span className="font-data-sm text-data-sm text-on-surface-variant/60">{reports.length} total</span>
          </div>
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
            {reports.map((r) => (
              <div key={r.id} className="ios-card aura-card group flex flex-col p-lg">
                <Link to={`/research/${r.id}`} className="flex-1">
                  <div className="mb-sm flex items-start justify-between gap-sm">
                    <StatusBadge status={r.status} />
                    {r.score != null && <span className="font-data-lg text-data-lg font-bold text-secondary">{r.score}</span>}
                  </div>
                  <div className="font-headline-sm text-headline-sm text-on-surface line-clamp-2">{r.productName}</div>
                  <div className="mt-sm font-data-sm text-data-sm text-on-surface-variant">{new Date(r.createdAt).toLocaleString('en-US')}</div>
                </Link>
                <div className="ios-hairline ios-hairline--top mt-md flex justify-end pt-sm">
                  <button
                    onClick={() => onDelete(r.id)}
                    disabled={deleting === r.id}
                    className="flex items-center gap-xs rounded-full border border-outline-variant px-sm py-base font-data-sm text-data-sm text-on-surface-variant transition-all hover:border-error hover:bg-error/5 hover:text-error active:scale-95 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    {deleting === r.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value, suffix = '', tone }: { icon: string; label: string; value: ReactNode; suffix?: string; tone: string }) {
  return (
    <div className="ios-card aura-card flex flex-col gap-sm p-lg">
      <div className="flex items-center justify-between">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-[20px] ${tone}`}>{icon}</span>
      </div>
      <div className={`font-data-lg text-[40px] font-bold ${tone}`}>{value}<span className="font-data-sm text-data-sm font-normal text-on-surface-variant">{suffix}</span></div>
    </div>
  );
}

const STATUS_MAP: Record<string, { text: string; cls: string }> = {
  pending: { text: 'Queued', cls: 'bg-surface-container-highest text-on-surface-variant' },
  running: { text: 'Running', cls: 'bg-primary/10 text-primary' },
  completed: { text: 'Completed', cls: 'bg-secondary/10 text-secondary' },
  failed: { text: 'Failed', cls: 'bg-error/10 text-error' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { text: status, cls: 'bg-surface-container-highest text-on-surface-variant' };
  return <span className={`rounded-full px-sm py-base font-data-sm text-data-sm uppercase ${s.cls}`}>{s.text}</span>;
}

function EmptyState() {
  return (
    <div className="card-level-1 flex flex-col items-center gap-md rounded-xl px-lg py-xl text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high">
        <span className="material-symbols-outlined text-[28px] text-primary">rocket_launch</span>
      </div>
      <div>
        <div className="font-headline-sm text-headline-sm text-on-surface">No research yet</div>
        <p className="mt-xs font-body-md text-sm text-on-surface-variant">Start your first market study — the AI runs a 6-step analysis and returns a scored report.</p>
      </div>
      <Link to="/research/new" className={btn('primary')}>
        <span className="material-symbols-outlined text-[18px]">add</span> Start your first study
      </Link>
    </div>
  );
}

function Empty({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'error' }) {
  return (
    <div className={`ios-card px-lg py-xl text-center font-data-sm text-data-sm ${tone === 'error' ? 'text-error' : 'text-on-surface-variant'}`}>
      {children}
    </div>
  );
}
