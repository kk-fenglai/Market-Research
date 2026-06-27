import type { ReactNode } from 'react';

/** Synthetica 深色设计系统共享原子(按钮 / 输入 / 卡片)。供市场调研页面复用。 */

export function btn(variant: 'primary' | 'secondary' | 'danger' = 'secondary'): string {
  const base =
    'inline-flex items-center justify-center gap-xs rounded-lg px-md py-xs font-data-sm text-data-sm transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const v = {
    primary: 'bg-primary text-on-primary hover:opacity-90',
    secondary:
      'border border-outline-variant bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
    danger: 'border border-error/30 text-error hover:bg-error/10',
  };
  return `${base} ${v[variant]}`;
}

/** 深色输入框统一类名(focus 时描边转 primary)。 */
export const inputCls =
  'w-full rounded border border-outline-variant bg-surface-container-low px-sm py-xs font-body-md text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/40 focus:border-primary';

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
    <div className={`card-level-1 flex flex-col gap-md rounded-lg p-md ${span}`}>
      {title && (
        <h2 className="flex items-center justify-between border-b border-outline-variant pb-xs font-label-caps text-label-caps uppercase text-on-surface-variant">
          <span>{title}</span>
          {aside}
        </h2>
      )}
      {children}
    </div>
  );
}
