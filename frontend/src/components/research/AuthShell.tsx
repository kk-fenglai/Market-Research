import type { ReactNode } from 'react';

/** 登录/注册共用的 Aura 浅色容器与输入控件。白底卡片 + 柔和阴影 + 药丸输入。 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="app-dark flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="mb-lg flex items-center gap-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-high">
          <span className="material-symbols-outlined text-on-surface">psychology</span>
        </div>
        <div>
          <div className="font-display text-headline-sm font-bold tracking-tight text-on-surface">MarketIntel AI</div>
          <div className="font-data-sm text-data-sm text-on-surface-variant">Market Research</div>
        </div>
      </div>
      <div className="card-level-1 w-full max-w-sm rounded-xl p-xl">
        <h1 className="font-headline-sm text-headline-sm font-semibold text-on-surface">{title}</h1>
        {subtitle && <p className="mt-1.5 font-data-sm text-data-sm text-on-surface-variant">{subtitle}</p>}
        <div className="mt-lg">{children}</div>
      </div>
    </main>
  );
}

export function Field({
  label, type, value, onChange, autoComplete, placeholder, minLength,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-base block font-label-caps text-label-caps uppercase text-on-surface-variant">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full rounded-full border-none bg-surface-container-low px-md py-sm font-body-md text-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}
