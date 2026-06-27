import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { btn, inputCls } from '../components/research/dark';
import { startResearch, type ResearchPlan } from '../api/research';

type TemplateValue =
  | 'generic' | 'b2b_saas' | 'consumer' | 'marketplace'
  | 'ai_tool' | 'dev_tool' | 'content_media' | 'education'
  | 'ecommerce' | 'fintech' | 'community' | 'hardware';

const TEMPLATE_OPTIONS: { value: TemplateValue; label: string }[] = [
  { value: 'generic', label: 'Generic' },
  { value: 'b2b_saas', label: 'B2B SaaS' },
  { value: 'consumer', label: 'Consumer' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'ai_tool', label: 'AI Tool / App' },
  { value: 'dev_tool', label: 'Developer Tool' },
  { value: 'content_media', label: 'Content / Media' },
  { value: 'education', label: 'Education' },
  { value: 'ecommerce', label: 'E-commerce / DTC' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'community', label: 'Community / Membership' },
  { value: 'hardware', label: 'Hardware / Device' },
];

const INDUSTRY_SUGGESTIONS = [
  'SaaS / Enterprise Software', 'AI / LLM Apps', 'Cross-border E-commerce', 'E-commerce / Retail',
  'Education', 'Fintech', 'Healthcare', 'Content / Media', 'Gaming', 'Developer Tools',
  'Hardware / Devices', 'Local Services', 'Social / Community', 'Travel',
];

const PLAN_OPTIONS: { value: ResearchPlan; title: string; tag: string; desc: string }[] = [
  { value: 'economy', title: 'Economy', tag: 'Cheapest', desc: 'DeepSeek end-to-end; no live web access or citations.' },
  { value: 'balanced', title: 'Balanced', tag: 'Recommended', desc: 'Perplexity web search + DeepSeek reasoning (needs Perplexity key).' },
  { value: 'premium', title: 'Premium', tag: 'Best quality', desc: 'Perplexity + Claude, top quality (needs Perplexity + Anthropic keys).' },
];

const RESEARCH_STEPS = ['Market Size', 'Competitors', 'User Personas', 'Search Trends', 'Entry Barriers', 'Conclusion'];

/** 新建调研:表单 → startResearch → 跳转进度页。 */
export default function ResearchNew() {
  const navigate = useNavigate();
  const [productName, setProductName] = useState('');
  const [coreQuestion, setCoreQuestion] = useState('');
  const [industry, setIndustry] = useState('');
  const [plan, setPlan] = useState<ResearchPlan>('economy');
  const [template, setTemplate] = useState<TemplateValue>('generic');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const reportId = await startResearch({
        productName,
        coreQuestion: coreQuestion || undefined,
        industry: industry || undefined,
        plan,
        template,
      });
      navigate(`/research/${reportId}`);
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(detail || (err instanceof Error ? err.message : 'Submission failed, please retry'));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-lg border-b border-outline-variant pb-md">
        <h1 className="font-display text-display text-on-surface">New Research</h1>
        <p className="mt-xs font-body-md text-on-surface-variant">Enter a product direction; the AI runs a 6-step market study and returns a report.</p>
      </div>

      <div className="mt-md flex flex-wrap gap-xs">
        {RESEARCH_STEPS.map((s, i) => (
          <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container px-sm py-1.5 font-data-sm text-data-sm text-on-surface-variant">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-surface-container-highest text-[10px] text-on-surface-variant">{i + 1}</span>
            {s}
          </span>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-lg space-y-lg">
        <Field label="Product / Direction" required>
          <input
            required maxLength={120} value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="e.g. AI-powered market research tool for solo founders"
            className={inputCls}
          />
        </Field>

        <Field label="Core Question (optional)">
          <textarea
            maxLength={500} value={coreQuestion} rows={3}
            onChange={(e) => setCoreQuestion(e.target.value)}
            placeholder="e.g. Is this worth building? Will the target users pay?"
            className={inputCls}
          />
        </Field>

        <Field label="Industry (optional)">
          <input
            list="industry-options" maxLength={80} value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="Pick a common industry or type your own; leave blank for any"
            className={inputCls}
          />
          <datalist id="industry-options">
            {INDUSTRY_SUGGESTIONS.map((opt) => <option key={opt} value={opt} />)}
          </datalist>
        </Field>

        <fieldset>
          <legend className="mb-sm font-label-caps text-label-caps uppercase text-on-surface-variant">Business Type</legend>
          <div className="flex flex-wrap gap-xs">
            {TEMPLATE_OPTIONS.map((t) => (
              <button
                key={t.value} type="button" onClick={() => setTemplate(t.value)}
                className={`rounded-full px-md py-1.5 font-data-sm text-data-sm transition-colors ${
                  template === t.value ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-sm font-data-sm text-data-sm text-on-surface-variant/60">Picking the right type biases analysis toward that model&apos;s key dimensions (acquisition / retention / network effects…).</p>
        </fieldset>

        <fieldset className="space-y-sm">
          <legend className="mb-base font-label-caps text-label-caps uppercase text-on-surface-variant">AI Plan</legend>
          {PLAN_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-sm rounded-lg border p-md transition-colors ${
                plan === opt.value ? 'border-secondary bg-surface-container-high' : 'border-outline-variant hover:bg-surface-container'
              }`}
            >
              <input type="radio" name="plan" value={opt.value} checked={plan === opt.value} onChange={() => setPlan(opt.value)} className="mt-1 accent-primary" />
              <span className="flex-1">
                <span className="flex items-center gap-sm">
                  <span className="font-body-md font-medium text-on-surface">{opt.title}</span>
                  <span className="rounded-full border border-outline-variant bg-surface-container px-2 py-0.5 font-data-sm text-[10px] text-on-surface-variant">{opt.tag}</span>
                </span>
                <span className="mt-0.5 block font-data-sm text-data-sm text-on-surface-variant">{opt.desc}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {error && <p className="font-data-sm text-data-sm text-error">{error}</p>}

        <button type="submit" disabled={submitting || !productName.trim()} className={`${btn('primary')} w-full py-sm`}>
          {submitting ? 'Creating…' : 'Start Research →'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-base block font-label-caps text-label-caps uppercase text-on-surface-variant">
        {label}{required && <span className="text-error"> *</span>}
      </span>
      {children}
    </label>
  );
}
