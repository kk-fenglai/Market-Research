import type { ReactNode } from 'react';

/** Aura Minimalist 共享原子(按钮 / 输入 / 卡片)。供市场调研页面复用。药丸几何 + 柔和阴影。 */

export function btn(variant: 'primary' | 'secondary' | 'danger' = 'secondary'): string {
  const base =
    'inline-flex items-center justify-center gap-xs rounded-full px-md py-xs font-data-sm text-data-sm font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none';
  const v = {
    primary: 'bg-primary text-on-primary aura-shadow hover:opacity-90',
    secondary:
      'border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low',
    danger: 'border border-outline-variant text-on-surface-variant hover:border-error hover:text-error hover:bg-error/5',
  };
  return `${base} ${v[variant]}`;
}

/** Aura 输入框统一类名:白底药丸 + 柔和阴影,focus 时 ring。 */
export const inputCls =
  'w-full rounded-full border-none bg-surface-container-lowest aura-shadow px-md py-sm font-body-md text-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary/20';

/** Level-1 卡片面板,顶部带 label-caps 小标题 + 底部细描边。 */
export function Panel({
  title,
  span = '',
  aside,
  children,
}: {
  title?: string;
  span?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`card-level-1 flex flex-col gap-md rounded-xl p-lg ${span}`}>
      {title && (
        <h2 className="ios-hairline flex items-center justify-between pb-sm font-label-caps text-label-caps uppercase text-on-surface-variant">
          <span>{title}</span>
          {aside}
        </h2>
      )}
      {children}
    </div>
  );
}
