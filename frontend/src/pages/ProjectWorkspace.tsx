import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { btn } from '../components/research/dark';
import CostPanel from './research/CostPanel';
import {
  ExecutiveSummary, ScoreBreakdown, PainPoints, MarketSizing, TrendPanel,
  CompetitiveLandscape, PriceComparison, PricingIntelligence, BarrierPanel, ConclusionPanel, DataSources,
} from './research/Dashboard';
import {
  getStatus, getResult, exportMarkdown, startResearch,
  type ResearchReport, type CostInputs, type StatusResp, type StepView, type ResearchPlan,
} from '../api/research';

const POLL_MS = 2000;

/** 报告页:轮询状态 → 执行视图(进行中)/ 工作台(完成)。移植自旧 市场调研 工程。 */
export default function ProjectWorkspace() {
  const { id = '' } = useParams();
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [costInputs, setCostInputs] = useState<CostInputs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await getStatus(id);
        if (cancelled) return;
        setStatus(data);
        if (data.status === 'completed' || data.status === 'failed') {
          if (timer.current) clearInterval(timer.current);
          if (data.status === 'completed') {
            const r = await getResult(id);
            if (!cancelled) { setReport(r.result); setCostInputs(r.costInputs); }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Status query failed');
        if (timer.current) clearInterval(timer.current);
      }
    }
    poll();
    timer.current = setInterval(poll, POLL_MS);
    return () => { cancelled = true; if (timer.current) clearInterval(timer.current); };
  }, [id]);

  return (
    <div className="mx-auto max-w-7xl">
      <Body status={status} report={report} costInputs={costInputs} error={error} reportId={id} />
    </div>
  );
}

function Body({ status, report, costInputs, error, reportId }: {
  status: StatusResp | null;
  report: ResearchReport | null;
  costInputs: CostInputs | null;
  error: string | null;
  reportId: string;
}) {
  if (error) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-error/30 bg-error/10 px-lg py-xl text-center">
        <p className="font-data-sm text-data-sm text-error">{error}</p>
        <Link to="/research/new" className={`${btn('secondary')} mt-md`}>← New Research</Link>
      </div>
    );
  }

  if (status?.status === 'completed' && report) {
    return (
      <>
        <div className="mb-lg flex flex-col gap-md border-b border-outline-variant pb-md md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-xs flex items-center gap-sm">
              <span className="rounded border border-secondary/20 bg-secondary/10 px-xs py-base font-data-sm text-data-sm uppercase text-secondary">Finalized Report</span>
              {report.meta && <span className="font-data-sm text-data-sm text-on-surface-variant">Generated: {new Date(report.meta.dataCollectedAt).toLocaleDateString('en-US')}</span>}
            </div>
            <h1 className="font-display text-display text-on-background">{report.productName}</h1>
            {report.coreQuestion && <p className="mt-xs max-w-3xl font-body-md text-on-surface-variant">{report.coreQuestion}</p>}
          </div>
          <ReportToolbar reportId={reportId} report={report} />
        </div>
        <Workspace report={report} score={status.score} reportId={reportId} costInputs={costInputs} />
      </>
    );
  }

  const failed = status?.status === 'failed';
  return <ExecutionView steps={status?.steps ?? []} reportId={reportId} failed={failed} />;
}

// ── 工作台:左侧分区导航 + 右侧 bento 面板 ──
type SectionId = 'overview' | 'market' | 'competitors' | 'pricing' | 'conclusion';
const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'market', label: 'Market Size', icon: 'trending_up' },
  { id: 'competitors', label: 'Competitors', icon: 'groups' },
  { id: 'pricing', label: 'Pricing & Cost', icon: 'payments' },
  { id: 'conclusion', label: 'Conclusion', icon: 'flag' },
];

function Workspace({ report, score, reportId, costInputs }: {
  report: ResearchReport; score: number | null; reportId: string; costInputs: CostInputs | null;
}) {
  const [active, setActive] = useState<SectionId>('overview');
  return (
    <div className="flex flex-col gap-lg md:flex-row">
      <nav className="flex shrink-0 gap-xs overflow-x-auto md:w-56 md:flex-col md:overflow-visible">
        {SECTIONS.map((n) => {
          const on = active === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setActive(n.id)}
              className={`flex items-center gap-sm whitespace-nowrap rounded-lg px-md py-sm text-left font-body-md transition-colors md:border-l-2 ${
                on ? 'bg-surface-container-high text-on-surface md:border-primary' : 'text-on-surface-variant hover:bg-surface-container md:border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{n.icon}</span>
              {n.label}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        <Section show={active === 'overview'}>
          <ExecutiveSummary report={report} score={score} />
          <PainPoints report={report} />
          <ScoreBreakdown report={report} score={score} />
        </Section>
        <Section show={active === 'market'}>
          <MarketSizing report={report} />
          <TrendPanel report={report} />
        </Section>
        <Section show={active === 'competitors'}>
          <CompetitiveLandscape report={report} />
          <PriceComparison report={report} />
        </Section>
        <Section show={active === 'pricing'}>
          <PricingIntelligence report={report} />
          <CostPanel reportId={reportId} initial={costInputs} />
        </Section>
        <Section show={active === 'conclusion'}>
          <BarrierPanel report={report} />
          <ConclusionPanel report={report} />
          <DataSources report={report} />
        </Section>
      </div>
    </div>
  );
}

function Section({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return <div className="grid grid-cols-1 gap-lg md:grid-cols-12">{children}</div>;
}

// ── Active Execution:并行采集 bento + 推理时间线 + 执行日志 ──
function ExecutionView({ steps, reportId, failed }: { steps: StepView[]; reportId: string; failed: boolean }) {
  const gather = steps.filter((s) => s.stepNumber <= 4);
  const infer = steps.filter((s) => s.stepNumber >= 5);
  const done = steps.filter((s) => s.status === 'completed').length;
  const total = steps.length || 6;
  return (
    <>
      <div className="mb-lg flex flex-col gap-md border-b border-outline-variant pb-md md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-base flex items-center gap-sm">
            <span className={`rounded px-xs py-base font-data-sm text-data-sm uppercase tracking-widest ${failed ? 'bg-error/10 text-error' : 'bg-secondary/10 text-secondary'}`}>
              {failed ? 'Execution Failed' : 'Active Execution'}
            </span>
            <span className="font-data-sm text-data-sm text-on-surface-variant">ID: {reportId.slice(0, 8)}</span>
          </div>
          <h1 className="font-display text-display text-on-surface">{failed ? 'Research Failed' : 'Research in Progress…'}</h1>
        </div>
        {failed && <Link to="/research/new" className={btn('secondary')}>← New Research</Link>}
      </div>

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-12">
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-md lg:col-span-8">
          <div className="mb-md flex items-center justify-between border-b border-outline-variant pb-sm">
            <h3 className="flex items-center gap-sm font-headline-sm text-headline-sm text-on-surface">
              <span className="material-symbols-outlined text-inverse-primary">travel_explore</span> Data Gathering (Parallel)
            </h3>
            <span className="flex items-center gap-1 rounded border border-outline-variant bg-surface-container px-2 py-1 font-data-sm text-data-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[14px]">search</span> Collector
            </span>
          </div>
          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            {gather.map((s) => <GatherCard key={s.stepNumber} step={s} />)}
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-outline-variant bg-surface-container-low p-md lg:col-span-4">
          <div className="mb-md flex items-center justify-between border-b border-outline-variant pb-sm">
            <h3 className="flex items-center gap-sm font-headline-sm text-headline-sm text-on-surface">
              <span className="material-symbols-outlined text-secondary">psychology</span> Inference
            </h3>
            <span className="flex items-center gap-1 rounded border border-outline-variant bg-surface-container px-2 py-1 font-data-sm text-data-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[14px]">model_training</span> Reasoner
            </span>
          </div>
          <div className="relative flex flex-1 flex-col justify-center gap-lg">
            <div className="absolute bottom-[40px] left-[15px] top-[40px] w-px bg-outline-variant" />
            {infer.map((s) => <InferStep key={s.stepNumber} step={s} />)}
          </div>
        </div>
      </div>

      <div className="mt-lg overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container px-md py-2">
          <span className="flex items-center gap-2 font-data-sm text-data-sm uppercase tracking-wider text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">terminal</span> Execution Log
          </span>
        </div>
        <div className="h-48 space-y-1 overflow-y-auto p-md font-data-sm text-data-sm">
          {steps.length === 0 && <div className="text-on-surface-variant">Initializing pipeline…</div>}
          {steps.map((s) => <LogLine key={s.stepNumber} step={s} />)}
        </div>
      </div>

      <div className="sticky bottom-0 mt-lg flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low/90 p-md backdrop-blur-md">
        <div className="flex flex-1 items-center gap-md">
          <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-container">
            <div className="h-full rounded-full bg-secondary transition-all duration-500" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <span className="whitespace-nowrap font-data-sm text-data-sm text-on-surface-variant">{Math.round((done / total) * 100)}% Complete</span>
        </div>
      </div>
    </>
  );
}

function GatherCard({ step }: { step: StepView }) {
  const running = step.status === 'running';
  const done = step.status === 'completed';
  const failed = step.status === 'failed';
  const border = running ? 'border-primary/50' : failed ? 'border-error/50' : done ? 'border-outline-variant' : 'border-dashed border-outline-variant opacity-50';
  return (
    <div className={`relative overflow-hidden rounded border bg-surface-container p-sm ${border}`}>
      {running && (
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center">
          <div className="pulse-ring absolute inset-0 rounded-full border-2 border-primary" />
          <span className="material-symbols-outlined animate-spin text-[14px] text-primary">sync</span>
        </div>
      )}
      <div className="mb-2 flex items-start justify-between">
        <div className={`font-body-md font-medium ${running ? 'text-primary' : 'text-on-surface'}`}>{step.stepName}</div>
        {done && <span className="material-symbols-outlined text-[18px] text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>}
        {failed && <span className="material-symbols-outlined text-[18px] text-error" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>}
        {step.status === 'pending' && <span className="material-symbols-outlined text-[18px] text-on-surface-variant">schedule</span>}
      </div>
      <div className={`mb-2 inline-block rounded px-2 py-1 font-data-sm text-data-sm ${
        done ? 'bg-secondary/10 text-secondary' : running ? 'bg-primary/10 text-primary' : failed ? 'bg-error/10 text-error' : 'bg-surface-container-highest text-on-surface-variant'
      }`}>
        {done ? '100% Complete' : running ? 'Scanning Sources…' : failed ? 'Failed' : 'Queued'}
      </div>
      {step.summary && <p className="font-data-sm text-data-sm text-on-surface-variant">{step.summary}</p>}
      {step.error && <p className="font-data-sm text-data-sm text-error">{step.error}</p>}
    </div>
  );
}

function InferStep({ step }: { step: StepView }) {
  const active = step.status === 'running';
  const done = step.status === 'completed';
  return (
    <div className="relative z-10 flex items-start gap-md">
      <div className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full border font-data-sm text-data-sm ${
        done ? 'border-secondary bg-secondary/15 text-secondary' : active ? 'border-primary bg-primary/15 text-primary' : 'border-outline-variant bg-surface-container text-on-surface-variant'
      }`}>{step.stepNumber}</div>
      <div className={`flex-1 rounded border border-outline-variant bg-surface-container p-sm ${done || active ? '' : 'opacity-50'}`}>
        <div className="mb-1 font-body-md font-medium text-on-surface">{step.stepName}</div>
        <div className="font-data-sm text-data-sm text-on-surface-variant">
          {done ? 'Reasoning complete.' : active ? 'Reasoning over gathered data…' : 'Awaiting gather phase.'}
        </div>
      </div>
    </div>
  );
}

function LogLine({ step }: { step: StepView }) {
  const map: Record<StepView['status'], { tag: string; cls: string }> = {
    completed: { tag: 'SUCCESS', cls: 'text-secondary' },
    running: { tag: 'ACTIVE', cls: 'text-primary' },
    failed: { tag: 'ERROR', cls: 'text-error' },
    pending: { tag: 'QUEUED', cls: 'text-on-surface-variant' },
  };
  const m = map[step.status];
  return (
    <div className={`flex items-center gap-2 ${m.cls}`}>
      {step.status === 'running' && <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />}
      [{m.tag}] Step {step.stepNumber} · {step.stepName}{step.error ? ` — ${step.error}` : ''}
    </div>
  );
}

// ── 报告操作栏:导出 Markdown / 打印 PDF / 重新调研 / 对比 ──
function ReportToolbar({ reportId, report }: { reportId: string; report: ResearchReport }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function rerun() {
    setBusy(true);
    try {
      const nid = await startResearch({
        productName: report.productName,
        coreQuestion: report.coreQuestion,
        industry: report.industry,
        plan: (report.meta?.plan ?? 'economy') as ResearchPlan,
        template: report.meta?.template ?? 'generic',
        rerunOf: reportId,
      });
      navigate(`/research/${nid}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print flex shrink-0 flex-wrap items-center justify-end gap-sm">
      <button onClick={() => { setExporting(true); exportMarkdown(reportId).finally(() => setExporting(false)); }} disabled={exporting} className={btn('secondary')}>
        <span className="material-symbols-outlined text-[16px]">content_copy</span> {exporting ? 'Exporting…' : 'Markdown'}
      </button>
      <button onClick={() => window.print()} className={btn('secondary')}>
        <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span> PDF
      </button>
      <button onClick={rerun} disabled={busy} className={btn('primary')}>{busy ? 'Creating…' : 'Re-run'}</button>
      {report.meta?.rerunOf && (
        <Link to={`/research/compare?ids=${report.meta.rerunOf},${reportId}`} className={btn('secondary')}>Compare</Link>
      )}
    </div>
  );
}
