import { useMemo, useState } from 'react';
import { Panel, btn, inputCls } from '../../components/research/dark';
import { saveCostInputs, type CostInputs } from '../../api/research';

/**
 * 成本 & 回本测算面板(用户手动录入,USD)。移植自旧 市场调研 工程。
 * 派生值(月总成本 / 回本客户数)前端实时算,不入库。
 */

type Item = CostInputs['items'][number];

export default function CostPanel({ reportId, initial }: { reportId: string; initial: CostInputs | null }) {
  const [items, setItems] = useState<Item[]>(initial?.items ?? []);
  const [targetPrice, setTargetPrice] = useState<string>(initial?.targetPrice != null ? String(initial.targetPrice) : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCost = useMemo(
    () => items.reduce((s, it) => s + (Number.isFinite(it.monthlyCost) ? it.monthlyCost : 0), 0),
    [items]
  );
  const price = parseFloat(targetPrice);
  const breakEven = price > 0 ? Math.ceil(totalCost / price) : null;

  function updateItem(idx: number, patch: Partial<Item>) {
    setSaved(false);
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setSaved(false);
    setItems((prev) => [...prev, { name: '', monthlyCost: 0 }]);
  }
  function removeItem(idx: number) {
    setSaved(false);
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveCostInputs(reportId, {
        items: items
          .filter((it) => it.name.trim())
          .map((it) => ({ name: it.name.trim(), monthlyCost: Math.max(0, Number(it.monthlyCost) || 0) })),
        targetPrice: targetPrice.trim() === '' ? null : Math.max(0, Number(targetPrice) || 0),
      });
      setSaved(true);
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(detail || (err instanceof Error ? err.message : '保存失败'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="Cost & Break-even (manual · USD)"
      span="md:col-span-12"
      aside={
        saved ? (
          <span className="font-data-sm text-data-sm text-secondary">Saved ✓</span>
        ) : (
          <span className="font-data-sm text-data-sm text-on-surface-variant/60">Your private assumptions</span>
        )
      }
    >
      <div className="flex flex-col gap-sm">
        {items.length === 0 && (
          <p className="font-data-sm text-data-sm text-on-surface-variant/50">
            No cost items yet — add R&D, payroll, acquisition, servers, etc.
          </p>
        )}
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-sm">
            <input
              className={`${inputCls} flex-1`}
              placeholder="Cost item (e.g. Servers)"
              value={it.name}
              maxLength={60}
              onChange={(e) => updateItem(i, { name: e.target.value })}
            />
            <div className="relative w-40">
              <span className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 font-data-sm text-data-sm text-on-surface-variant">$</span>
              <input
                className={`${inputCls} pl-6 text-right`}
                type="number"
                min={0}
                placeholder="0"
                value={it.monthlyCost || ''}
                onChange={(e) => updateItem(i, { monthlyCost: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <span className="w-10 shrink-0 font-data-sm text-[10px] text-on-surface-variant/60">/mo</span>
            <button
              onClick={() => removeItem(i)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-on-surface-variant hover:bg-error/10 hover:text-error"
              aria-label="Remove"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        ))}
        <button onClick={addItem} className={`${btn('secondary')} w-max`}>
          <span className="material-symbols-outlined text-[16px]">add</span> Add cost item
        </button>
      </div>

      <div className="mt-md flex items-center gap-sm border-t border-outline-variant pt-md">
        <span className="font-body-md text-on-surface">Planned price</span>
        <div className="relative w-40">
          <span className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 font-data-sm text-data-sm text-on-surface-variant">$</span>
          <input
            className={`${inputCls} pl-6 text-right`}
            type="number"
            min={0}
            placeholder="0"
            value={targetPrice}
            onChange={(e) => {
              setSaved(false);
              setTargetPrice(e.target.value);
            }}
          />
        </div>
        <span className="font-data-sm text-[10px] text-on-surface-variant/60">/mo per customer</span>
      </div>

      <div className="mt-md grid grid-cols-1 gap-md border-t border-outline-variant pt-md sm:grid-cols-3">
        <Metric label="Total Monthly Cost" value={`$${totalCost.toLocaleString('en-US')}`} tone="text-on-surface" />
        <Metric label="Planned Price" value={price > 0 ? `$${price.toLocaleString('en-US')}/mo` : '—'} tone="text-tertiary" />
        <Metric
          label="Break-even Customers"
          value={breakEven != null ? `${breakEven.toLocaleString('en-US')}` : '—'}
          tone="text-secondary"
          hint={breakEven != null ? 'paying customers to cover costs' : 'set a price to compute'}
        />
      </div>

      <div className="mt-md flex items-center justify-end gap-sm border-t border-outline-variant pt-md">
        {error && <span className="font-data-sm text-data-sm text-error">{error}</span>}
        <button onClick={save} disabled={saving} className={btn('primary')}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Panel>
  );
}

function Metric({ label, value, tone, hint }: { label: string; value: string; tone: string; hint?: string }) {
  return (
    <div>
      <div className="mb-base font-data-sm text-data-sm text-on-surface-variant">{label}</div>
      <div className={`font-data-lg text-data-lg ${tone}`}>{value}</div>
      {hint && <div className="mt-base font-data-sm text-[10px] text-on-surface-variant/50">{hint}</div>}
    </div>
  );
}
