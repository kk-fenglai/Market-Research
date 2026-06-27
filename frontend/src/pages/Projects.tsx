import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { btn } from '../components/research/dark';
import { listProjects, deleteProject, type ProjectListItem } from '../api/research';

/** 调研工程列表(Dashboard)。仅展示当前用户的报告。 */
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

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-lg flex items-center justify-between border-b border-outline-variant pb-md">
        <div>
          <h1 className="font-display text-display text-on-surface">Research Projects</h1>
          <p className="mt-xs font-body-md text-on-surface-variant">All your market research reports.</p>
        </div>
        <Link to="/research/new" className={btn('primary')}>
          <span className="material-symbols-outlined text-[18px]">add</span> New Research
        </Link>
      </div>

      {error ? (
        <Empty tone="error">Failed to load history.</Empty>
      ) : reports === null ? (
        <Empty>Loading…</Empty>
      ) : reports.length === 0 ? (
        <Empty>
          No research yet. <Link to="/research/new" className="text-primary hover:opacity-70">Start one →</Link>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <div key={r.id} className="card-level-1 group flex flex-col rounded-lg p-md transition-colors hover:border-primary/40">
              <Link to={`/research/${r.id}`} className="flex-1">
                <div className="mb-sm flex items-start justify-between gap-sm">
                  <StatusBadge status={r.status} />
                  {r.score != null && <span className="font-data-lg text-data-lg text-secondary">{r.score}</span>}
                </div>
                <div className="font-headline-sm text-headline-sm text-on-surface line-clamp-2">{r.productName}</div>
                <div className="mt-sm font-data-sm text-data-sm text-on-surface-variant">{new Date(r.createdAt).toLocaleString('en-US')}</div>
              </Link>
              <div className="mt-md flex justify-end border-t border-outline-variant pt-sm">
                <button
                  onClick={() => onDelete(r.id)}
                  disabled={deleting === r.id}
                  className="flex items-center gap-xs rounded px-sm py-base font-data-sm text-data-sm text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  {deleting === r.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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

function Empty({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'error' }) {
  return (
    <div className={`rounded-lg border border-outline-variant bg-surface-container-low px-lg py-xl text-center font-data-sm text-data-sm ${tone === 'error' ? 'text-error' : 'text-on-surface-variant'}`}>
      {children}
    </div>
  );
}
