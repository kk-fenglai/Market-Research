import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { btn } from '../components/research/dark';
import { listProjects, deleteProject, type ProjectListItem } from '../api/research';

/** Library —— 项目库:全部调研的检索 / 状态筛选 / 打开 / 删除管理。 */

const STATUS_MAP: Record<string, { text: string; cls: string }> = {
  pending: { text: 'Queued', cls: 'bg-surface-container-highest text-on-surface-variant' },
  running: { text: 'Running', cls: 'bg-primary/10 text-primary' },
  completed: { text: 'Completed', cls: 'bg-secondary/10 text-secondary' },
  failed: { text: 'Failed', cls: 'bg-error/10 text-error' },
};

const FILTERS: { value: 'all' | 'completed' | 'running' | 'failed'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'running', label: 'In Progress' },
  { value: 'failed', label: 'Failed' },
];

export default function Library() {
  const [reports, setReports] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'completed' | 'running' | 'failed'>('all');

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

  const shown = useMemo(() => {
    const list = reports ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((r) => {
      const okQ = !q || r.productName.toLowerCase().includes(q);
      const okF =
        filter === 'all'
          ? true
          : filter === 'running'
          ? r.status === 'running' || r.status === 'pending'
          : r.status === filter;
      return okQ && okF;
    });
  }, [reports, query, filter]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="ios-hairline ios-hairline--inset mb-lg pb-md">
        <h1 className="font-display text-display text-on-surface">Library</h1>
        <p className="mt-xs font-body-md text-on-surface-variant">Browse and manage all your market-research projects.</p>
      </div>

      {/* Search + filters */}
      <div className="mb-lg flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            className="w-full rounded-full border-none bg-surface-container-lowest py-sm pl-12 pr-4 font-body-md text-sm text-on-surface outline-none aura-shadow transition-all placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex flex-wrap gap-xs">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-md py-1.5 font-data-sm text-data-sm transition-colors ${
                filter === f.value
                  ? 'bg-surface-container-high font-semibold text-on-surface'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Empty tone="error">Failed to load library.</Empty>
      ) : reports === null ? (
        <Empty>Loading…</Empty>
      ) : reports.length === 0 ? (
        <EmptyState />
      ) : shown.length === 0 ? (
        <Empty>No projects match your search.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => {
            const s = STATUS_MAP[r.status] ?? { text: r.status, cls: 'bg-surface-container-highest text-on-surface-variant' };
            return (
              <div key={r.id} className="card-level-1 aura-card group flex flex-col rounded-xl p-lg">
                <Link to={`/research/${r.id}`} className="flex-1">
                  <div className="mb-sm flex items-start justify-between gap-sm">
                    <span className={`rounded-full px-sm py-base font-data-sm text-data-sm uppercase ${s.cls}`}>{s.text}</span>
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
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card-level-1 flex flex-col items-center gap-md rounded-xl px-lg py-xl text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high">
        <span className="material-symbols-outlined text-[28px] text-primary">folder_open</span>
      </div>
      <div>
        <div className="font-headline-sm text-headline-sm text-on-surface">Your library is empty</div>
        <p className="mt-xs font-body-md text-sm text-on-surface-variant">Run your first market study and it will show up here.</p>
      </div>
      <Link to="/research/new" className={btn('primary')}>
        <span className="material-symbols-outlined text-[18px]">add</span> Start your first study
      </Link>
    </div>
  );
}

function Empty({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'error' }) {
  return (
    <div className={`ios-card px-lg py-xl text-center font-data-sm text-data-sm ${tone === 'error' ? 'text-error' : 'text-on-surface-variant'}`}>
      {children}
    </div>
  );
}
