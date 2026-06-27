import type { ReactNode } from 'react';
import LazyECharts from '../../components/LazyECharts';
import type { ResearchReport } from '../../api/research';

/**
 * 报告面板库 —— Synthetica 深色「指挥中心」bento 模块(移植自旧 市场调研 工程)。
 * 每个面板映射真实 ResearchReport 数据(无数据则占位,不整页报错)。
 * TrendPanel 由 recharts 改为 v2 已有的 ECharts。
 */

function Panel({ title, span = 'md:col-span-12', aside, children }: {
  title: string;
  span?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`card-level-1 flex flex-col gap-md rounded-lg p-md ${span}`}>
      <h2 className="flex items-center justify-between border-b border-outline-variant pb-xs font-label-caps text-label-caps uppercase text-on-surface-variant">
        <span>{title}</span>
        {aside}
      </h2>
      {children}
    </div>
  );
}

const CONF: Record<string, { cls: string; label: string }> = {
  high: { cls: 'confidence-high', label: 'High >80%' },
  medium: { cls: 'confidence-med', label: 'Med 50-80%' },
  low: { cls: 'confidence-low', label: 'Low <50%' },
};
const MATURITY: Record<string, string> = { education: 'Education', competition: 'Competition', mature: 'Mature' };
const RECO: Record<string, { cls: string; label: string }> = {
  go: { cls: 'bg-secondary/15 text-secondary', label: 'GO' },
  conditional_go: { cls: 'bg-tertiary/15 text-tertiary', label: 'CONDITIONAL' },
  no_go: { cls: 'bg-error/15 text-error', label: 'NO-GO' },
};
const LEVEL: Record<string, string> = { low: 'Low', medium: 'Med', high: 'High' };
const FREQ: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', occasional: 'Occasional' };

function Empty() {
  return <p className="font-data-sm text-data-sm text-on-surface-variant/50">No data — module not collected.</p>;
}

// 竞品官网链接:有合法 website 直接用,否则降级为 Google 搜「公司名 官网」
function competitorHref(c: { name: string; website?: string | null }): string {
  return /^https?:\/\//.test(c.website || '')
    ? c.website!
    : `https://www.google.com/search?q=${encodeURIComponent(c.name + ' official site')}`;
}

// ── 1. Executive Summary ───────────────────────────────────────
export function ExecutiveSummary({ report, score }: { report: ResearchReport; score: number | null }) {
  const c = report.conclusion;
  const conf = CONF[report.meta?.overallConfidence ?? 'medium'];
  const reco = c ? RECO[c.recommendation ?? 'conditional_go'] : null;
  return (
    <Panel title="Executive Summary" span="md:col-span-4">
      <Row label="Opportunity Score">
        <span className="font-data-lg text-data-lg text-secondary">{score ?? c?.score ?? '—'}/100</span>
      </Row>
      <Row label="Market Maturity">
        <span className="font-data-lg text-data-lg text-tertiary">
          {report.marketSize?.maturity ? MATURITY[report.marketSize.maturity] : '—'}
        </span>
      </Row>
      {reco && (
        <Row label="Recommendation">
          <span className={`rounded-full px-sm py-base font-data-sm text-data-sm ${reco.cls}`}>{reco.label}</span>
        </Row>
      )}
      <div className="mt-auto border-t border-outline-variant pt-md">
        <Row label={<span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Data Confidence</span>}>
          <span className={`rounded-full px-sm py-base font-data-sm text-data-sm ${conf.cls}`}>{conf.label}</span>
        </Row>
      </div>
    </Panel>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      {typeof label === 'string' ? <span className="font-body-md text-on-surface">{label}</span> : label}
      {children}
    </div>
  );
}

// ── 2. Market Sizing (TAM/SAM/SOM) ─────────────────────────────
export function MarketSizing({ report }: { report: ResearchReport }) {
  const m = report.marketSize;
  return (
    <Panel title="Market Sizing (TAM / SAM / SOM)" span="md:col-span-8">
      {!m ? <Empty /> : (
        <>
          <div className="relative flex h-48 w-full items-end justify-around pt-lg">
            <SizeBar label="TAM" v={m.tam} base={m.tam.value} cls="bg-primary/20 border-primary" />
            <SizeBar label="SAM" v={m.sam} base={m.tam.value} cls="bg-secondary/30 border-secondary" />
            <SizeBar label="SOM" v={m.som} base={m.tam.value} cls="bg-inverse-primary border-inverse-primary" />
          </div>
          {m.maturityReason && <p className="font-data-sm text-data-sm text-on-surface-variant">{m.maturityReason}</p>}
        </>
      )}
    </Panel>
  );
}

function SizeBar({ label, v, base, cls }: {
  label: string;
  v: { value: number; unit: string; note?: string };
  base: number;
  cls: string;
}) {
  const pct = base > 0 ? Math.max(4, Math.min(100, (v.value / base) * 100)) : 4;
  return (
    <div className="group flex h-full w-1/4 flex-col justify-end">
      <div className="mb-xs text-center font-data-sm text-data-sm text-on-surface">{v.value} {v.unit}</div>
      <div className={`w-full border ${cls} transition-all duration-200`} style={{ height: `${pct}%` }} />
      <span className="mt-xs text-center font-data-sm text-data-sm text-on-surface-variant">{label}</span>
    </div>
  );
}

// ── 3. Pain Points & Severity ──────────────────────────────────
export function PainPoints({ report }: { report: ResearchReport }) {
  const u = report.userProfile;
  return (
    <Panel
      title="Pain Points & Severity"
      span="md:col-span-6"
      aside={
        u && (u.painFrequency || u.painSeverity) ? (
          <span className="flex gap-xs">
            {u.painFrequency && <Tag>{FREQ[u.painFrequency]}</Tag>}
            {u.painSeverity && <Tag tone="error">Severity {LEVEL[u.painSeverity]}</Tag>}
          </span>
        ) : undefined
      }
    >
      {!u || u.painPoints.length === 0 ? <Empty /> : (
        <ul className="space-y-sm">
          {u.painPoints.map((p, i) => (
            <li key={i} className="flex items-start gap-sm border-l-2 border-l-error/70 bg-surface-container px-sm py-xs">
              <span className="font-body-md text-sm text-on-surface">{p}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'error' | 'secondary' }) {
  const cls = tone === 'error' ? 'text-error' : tone === 'secondary' ? 'text-secondary' : 'text-on-surface-variant';
  return (
    <span className={`rounded border border-outline-variant bg-surface-container px-1.5 py-0.5 font-data-sm text-[10px] ${cls}`}>
      {children}
    </span>
  );
}

// ── 4. Competitive Landscape ───────────────────────────────────
export function CompetitiveLandscape({ report }: { report: ResearchReport }) {
  const comps = report.competitors?.competitors ?? [];
  return (
    <Panel title="Competitive Landscape" span="md:col-span-6">
      {comps.length === 0 ? <Empty /> : (
        <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
          {comps.slice(0, 4).map((c) => (
            <div key={c.name} className="rounded border border-outline-variant/50 bg-surface-container p-sm">
              <div className="mb-xs flex items-center justify-between font-data-sm text-data-sm text-on-surface">
                <a
                  href={competitorHref(c)}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={c.website ? `打开 ${c.website}` : `搜索 ${c.name} 官网`}
                  className="inline-flex items-center gap-1 text-primary hover:opacity-70"
                >
                  {c.name}
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </a>
                <span className="text-on-surface-variant">{c.monthlyPriceUsd != null ? `$${c.monthlyPriceUsd}/mo` : c.pricing}</span>
              </div>
              <p className="font-body-md text-sm text-on-surface-variant">
                {c.complaints?.length ? `“${c.complaints[0]}”` : c.features.slice(0, 3).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── 4b. Price Comparison(全部竞品价格对比:柱状图 + 明细表)──
export function PriceComparison({ report }: { report: ResearchReport }) {
  const comps = report.competitors?.competitors ?? [];
  if (comps.length === 0) return null;
  // 有数值月费的,按价格升序用于柱状图
  const priced = comps
    .filter((c) => typeof c.monthlyPriceUsd === 'number')
    .sort((a, b) => (a.monthlyPriceUsd as number) - (b.monthlyPriceUsd as number));

  return (
    <Panel title="Price Comparison (USD / mo)" span="md:col-span-12" aside={<span className="font-data-sm text-[10px] text-outline">{comps.length} competitors</span>}>
      {priced.length > 0 && (
        <div className="h-64 w-full">
          <LazyECharts
            style={{ height: '100%', width: '100%' }}
            option={{
              backgroundColor: 'transparent',
              grid: { top: 10, right: 24, bottom: 24, left: 8, containLabel: true },
              tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#31394d', borderColor: '#464554', textStyle: { color: '#dae2fd' }, valueFormatter: (v: number) => `$${v}/mo` },
              xAxis: { type: 'value', axisLabel: { color: '#c7c4d7', fontSize: 12, formatter: '${value}' }, splitLine: { lineStyle: { color: '#464554', type: 'dashed' } } },
              yAxis: { type: 'category', data: priced.map((c) => c.name), axisLabel: { color: '#c7c4d7', fontSize: 12 }, axisLine: { lineStyle: { color: '#464554' } } },
              series: [{
                type: 'bar',
                data: priced.map((c) => c.monthlyPriceUsd),
                itemStyle: { color: '#c0c1ff', borderRadius: [0, 4, 4, 0] },
                label: { show: true, position: 'right', color: '#dae2fd', fontSize: 11, formatter: (p: { value: number }) => `$${p.value}` },
                barMaxWidth: 22,
              }],
            }}
          />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant/30 font-label-caps text-label-caps uppercase text-on-surface-variant">
              <th className="py-sm font-normal">Company</th>
              <th className="py-sm font-normal">Monthly (USD)</th>
              <th className="py-sm font-normal">Pricing</th>
            </tr>
          </thead>
          <tbody className="font-body-md text-sm text-on-surface">
            {comps.map((c) => (
              <tr key={c.name} className="border-b border-outline-variant/30 transition-colors hover:bg-surface-container/50">
                <td className="py-sm">
                  <a href={competitorHref(c)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:opacity-70">
                    {c.name}<span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  </a>
                </td>
                <td className="py-sm font-data-sm text-data-sm text-secondary">{c.monthlyPriceUsd != null ? `$${c.monthlyPriceUsd}` : '—'}</td>
                <td className="py-sm font-data-sm text-data-sm text-on-surface-variant">{c.pricing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── 5. Pricing Intelligence (WTP) ──────────────────────────────
export function PricingIntelligence({ report }: { report: ResearchReport }) {
  const wtp = report.userProfile?.willingnessToPay;
  const conf = wtp ? CONF[wtp.signal] : null;
  return (
    <Panel title="Pricing Intelligence" span="md:col-span-4">
      <div>
        <div className="mb-base font-data-sm text-data-sm text-on-surface-variant">Recommended Range</div>
        <div className="font-display text-display text-on-surface">{wtp?.priceRange ?? '—'}</div>
      </div>
      <div className="mt-auto">
        <div className="mb-xs flex items-center justify-between">
          <span className="font-data-sm text-data-sm text-on-surface-variant">Willingness to Pay (WTP)</span>
          {conf && <span className={`rounded-full px-sm py-base font-data-sm text-data-sm ${conf.cls}`}>{LEVEL[wtp!.signal]}</span>}
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded bg-surface-container">
          <div className="h-full w-1/4 bg-outline" />
          <div className="h-full w-1/2 bg-secondary" />
          <div className="h-full w-1/4 bg-outline" />
        </div>
        <div className="mt-base flex justify-between font-data-sm text-[10px] text-outline">
          <span>Too Cheap</span>
          <span className="text-secondary">Optimal</span>
          <span>Too Expensive</span>
        </div>
        {wtp?.reason && <p className="mt-sm font-data-sm text-data-sm text-on-surface-variant">{wtp.reason}</p>}
      </div>
    </Panel>
  );
}

// ── 6. Data Sources Matrix ─────────────────────────────────────
export function DataSources({ report }: { report: ResearchReport }) {
  const rows = [
    ...(report.marketSize?.citations ?? []).map((c) => ({ type: 'Market Size', ref: c })),
    ...(report.competitors?.citations ?? []).map((c) => ({ type: 'Competitors', ref: c })),
    ...(report.userProfile?.citations ?? []).map((c) => ({ type: 'User Profile', ref: c })),
    ...(report.trend?.citations ?? []).map((c) => ({ type: 'Trend', ref: c })),
  ];
  return (
    <Panel title="Data Sources Matrix" span="md:col-span-8" aside={<span className="font-data-sm text-[10px] text-outline">{rows.length} sources</span>}>
      {rows.length === 0 ? (
        <p className="font-data-sm text-data-sm text-on-surface-variant/60">
          No verifiable sources (economy plan has no live web access). Conclusions rely on model priors — treat as indicative only.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant/30 font-data-sm text-data-sm text-on-surface-variant">
                <th className="py-sm font-normal">Source Type</th>
                <th className="py-sm font-normal">Reference</th>
                <th className="py-sm font-normal">Action</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-sm text-on-surface">
              {rows.slice(0, 12).map((r, i) => (
                <tr key={i} className="border-b border-outline-variant/30 transition-colors hover:bg-surface-container/50">
                  <td className="py-sm">
                    <span className="flex w-max items-center gap-xs rounded border border-outline-variant bg-surface-container px-xs py-base text-xs">
                      <span className="material-symbols-outlined text-[14px]">link</span> {r.type}
                    </span>
                  </td>
                  <td className="break-all py-sm font-data-sm text-data-sm text-primary">{r.ref}</td>
                  <td className="py-sm">
                    {/^https?:\/\//.test(r.ref) ? (
                      <a href={r.ref} target="_blank" rel="noreferrer" className="text-secondary hover:opacity-80">
                        <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                      </a>
                    ) : (
                      <span className="material-symbols-outlined text-[18px] text-outline">info</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ── 7. Opportunity Score breakdown ─────────────────────────────
export function ScoreBreakdown({ report, score }: { report: ResearchReport; score: number | null }) {
  const c = report.conclusion;
  if (!c || (c.factors?.length ?? 0) === 0) return null;
  return (
    <Panel title="Opportunity Score Breakdown (fixed weights)" span="md:col-span-12">
      <div className="flex items-baseline gap-sm">
        <span className="font-data-lg text-[28px] text-on-surface">{score ?? c.score}</span>
        <span className="font-data-sm text-data-sm text-on-surface-variant">/ 100 weighted</span>
      </div>
      <ul className="space-y-sm">
        {c.factors.map((f) => (
          <li key={f.name}>
            <div className="flex items-center justify-between font-data-sm text-data-sm">
              <span className="text-on-surface">{f.name} <span className="text-on-surface-variant">· {Math.round(f.weight * 100)}%</span></span>
              <span className="text-on-surface-variant">{f.score}</span>
            </div>
            <div className="mt-base h-1.5 w-full overflow-hidden rounded bg-surface-container">
              <div className="h-full rounded bg-primary" style={{ width: `${f.score}%` }} />
            </div>
            <p className="mt-base font-body-md text-sm text-on-surface-variant">{f.reason}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── 8. Interest Over Time (trend) — ECharts ────────────────────
export function TrendPanel({ report }: { report: ResearchReport }) {
  const trend = report.trend;
  if (!trend || trend.keywords.length === 0) return null;
  const periods = Array.from(new Set(trend.keywords.flatMap((k) => k.points.map((p) => p.period))));
  const colors = ['#c0c1ff', '#4edea3', '#ffb783', '#ffb4ab'];
  const series = trend.keywords.map((k, i) => ({
    name: k.keyword,
    type: 'line' as const,
    smooth: true,
    showSymbol: false,
    lineStyle: { width: 2, color: colors[i % colors.length] },
    itemStyle: { color: colors[i % colors.length] },
    data: periods.map((p) => k.points.find((pt) => pt.period === p)?.value ?? null),
  }));
  return (
    <Panel title="Interest Over Time" span="md:col-span-7" aside={<span className="font-data-sm text-[10px] text-outline uppercase">{trend.direction}</span>}>
      <div className="h-64 w-full">
        <LazyECharts
          style={{ height: '100%', width: '100%' }}
          option={{
            backgroundColor: 'transparent',
            grid: { top: 10, right: 10, bottom: 24, left: 36 },
            tooltip: { trigger: 'axis', backgroundColor: '#31394d', borderColor: '#464554', textStyle: { color: '#dae2fd' } },
            legend: { data: trend.keywords.map((k) => k.keyword), textStyle: { color: '#c7c4d7' }, top: 0 },
            xAxis: {
              type: 'category', data: periods, boundaryGap: false,
              axisLine: { lineStyle: { color: '#464554' } },
              axisLabel: { color: '#c7c4d7', fontSize: 12 },
            },
            yAxis: {
              type: 'value',
              splitLine: { lineStyle: { color: '#464554', type: 'dashed' } },
              axisLabel: { color: '#c7c4d7', fontSize: 12 },
            },
            series,
          }}
        />
      </div>
      <p className="border-t border-outline-variant pt-sm font-body-md text-sm text-on-surface-variant">{trend.growthSummary}</p>
    </Panel>
  );
}

// ── 9. Entry Barriers ──────────────────────────────────────────
export function BarrierPanel({ report }: { report: ResearchReport }) {
  const b = report.barrier;
  if (!b) return null;
  return (
    <Panel title="Entry Barriers" span="md:col-span-5" aside={<span className="font-data-sm text-data-sm uppercase text-tertiary">{LEVEL[b.overallDifficulty]}</span>}>
      <ul className="space-y-sm">
        {b.barriers.map((x, i) => (
          <li key={i} className="rounded border border-outline-variant/50 bg-surface-container p-sm">
            <div className="flex items-center justify-between font-data-sm text-data-sm">
              <span className="text-on-surface">{x.name}</span>
              <span className="text-tertiary">{LEVEL[x.difficulty]}</span>
            </div>
            <p className="mt-base font-body-md text-sm text-on-surface-variant">{x.description}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── 10. Conclusion ─────────────────────────────────────────────
export function ConclusionPanel({ report }: { report: ResearchReport }) {
  const c = report.conclusion;
  if (!c) return null;
  return (
    <Panel title="Conclusion & Strategy" span="md:col-span-12">
      <p className="font-headline-sm text-headline-sm text-primary">{c.verdict}</p>
      <p className="font-body-md text-on-surface-variant">{c.summary}</p>
      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <BulletList title="Entry Strategy" tone="secondary" items={c.entryStrategy} />
        <BulletList title="Risks" tone="error" items={c.risks} />
      </div>
      {c.conditions && c.conditions.length > 0 && <BulletList title="Go / Stop Conditions" tone="tertiary" items={c.conditions} />}
    </Panel>
  );
}

function BulletList({ title, tone, items }: { title: string; tone: 'secondary' | 'error' | 'tertiary'; items: string[] }) {
  if (!items.length) return null;
  const cls = tone === 'secondary' ? 'text-secondary' : tone === 'error' ? 'text-error' : 'text-tertiary';
  return (
    <div>
      <div className={`mb-xs font-label-caps text-label-caps uppercase ${cls}`}>{title}</div>
      <ul className="list-disc space-y-1 pl-5 font-body-md text-sm text-on-surface-variant">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
