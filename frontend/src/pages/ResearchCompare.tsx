import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getResult, type ResearchReport } from '../api/research';

/** 两份报告并排对比。常用于"重新调研"后看市场变化。移植自旧 市场调研 工程。 */
const CONF: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const DIFF: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

interface Loaded {
  id: string;
  name: string;
  report: ResearchReport;
}

export default function ResearchCompare() {
  const [params] = useSearchParams();
  const ids = (params.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 2);
  const [loaded, setLoaded] = useState<Loaded[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Loaded[] = [];
      for (const id of ids) {
        try {
          const r = await getResult(id);
          if (r.result) out.push({ id, name: r.result.productName, report: r.result });
        } catch { /* skip unreadable */ }
      }
      if (!cancelled) setLoaded(out);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('ids')]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-lg border-b border-outline-variant pb-md">
        <Link to="/projects" className="font-data-sm text-data-sm text-primary hover:opacity-70">← Research Projects</Link>
        <h1 className="mt-xs font-display text-display text-on-surface">Report Comparison</h1>
      </div>
      {loaded === null ? (
        <Empty>Loading…</Empty>
      ) : loaded.length < 2 ? (
        <Empty>
          Needs two completed reports. Pass <code className="text-on-surface">?ids=reportA,reportB</code> in the URL, or use “Compare” on a report page.
        </Empty>
      ) : (
        <CompareTable items={loaded} />
      )}
    </div>
  );
}

function CompareTable({ items }: { items: Loaded[] }) {
  const rows: { label: string; get: (r: ResearchReport) => string }[] = [
    { label: 'Opportunity Score', get: (r) => (r.conclusion ? `${r.conclusion.score}/100` : '—') },
    { label: 'Verdict', get: (r) => r.conclusion?.verdict ?? '—' },
    { label: 'Confidence', get: (r) => (r.meta ? CONF[r.meta.overallConfidence] : '—') },
    { label: 'Market TAM', get: (r) => (r.marketSize ? `${r.marketSize.tam.value} ${r.marketSize.tam.unit}` : '—') },
    { label: 'Competitors', get: (r) => (r.competitors ? String(r.competitors.competitors.length) : '—') },
    { label: 'Entry Difficulty', get: (r) => (r.barrier ? DIFF[r.barrier.overallDifficulty] : '—') },
    { label: 'Trend', get: (r) => r.trend?.direction ?? '—' },
    { label: 'Collected', get: (r) => (r.meta ? new Date(r.meta.dataCollectedAt).toLocaleDateString('en-US') : '—') },
  ];
  const factorNames = items[0].report.conclusion?.factors.map((f) => f.name) ?? [];
  for (const name of factorNames) {
    rows.push({
      label: `· ${name}`,
      get: (r) => {
        const f = r.conclusion?.factors.find((x) => x.name === name);
        return f ? String(f.score) : '—';
      },
    });
  }

  return (
    <div className="card-level-1 overflow-hidden rounded-xl">
      <table className="w-full text-left font-body-md text-sm">
        <thead>
          <tr className="border-b border-outline-variant/60 bg-surface-container-low">
            <th className="px-md py-sm font-label-caps text-label-caps uppercase text-on-surface-variant">Metric</th>
            {items.map((it) => (
              <th key={it.id} className="px-md py-sm font-headline-sm text-headline-sm text-on-surface">{it.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-outline-variant/40 align-top">
              <td className="px-md py-sm font-data-sm text-data-sm text-on-surface-variant">{row.label}</td>
              {items.map((it) => (
                <td key={it.id} className="px-md py-sm text-on-surface">{row.get(it.report)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-low px-lg py-xl text-center font-data-sm text-data-sm text-on-surface-variant">
      {children}
    </div>
  );
}
