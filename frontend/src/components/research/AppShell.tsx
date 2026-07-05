import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';

/**
 * 市场调研全站外壳:固定左侧导航 + 顶栏 + 主画布(Aura Minimalist 浅色设计系统)。
 * 导航 = Dashboard / Ask AI / Library;Admin 收进账户下拉菜单(仅管理员可见)。
 * New Research 只保留顶栏主按钮。
 */

type NavItem = {
  label: string;
  icon: string;
  href: string;
  match?: (path: string) => boolean;
};

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', href: '/projects', match: (p) => p === '/projects' || p.startsWith('/research/') },
  { label: 'Ask AI', icon: 'smart_toy', href: '/chat', match: (p) => p.startsWith('/chat') },
  { label: 'Library', icon: 'folder_open', href: '/library', match: (p) => p.startsWith('/library') },
];

const FOOTER: NavItem[] = [
  { label: 'Help', icon: 'help_outline', href: '/pricing' },
  { label: 'Privacy', icon: 'security', href: '/pricing' },
];

export default function AppShell() {
  const pathname = useLocation().pathname;
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [query, setQuery] = useState('');

  async function onLogout() {
    await logout();
    navigate('/login');
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate('/chat');
  }

  const displayName = user?.name || user?.email || 'Account';
  const initials = (user?.name || user?.email || 'U').slice(0, 2).toUpperCase();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const planLabel = user?.plan ? `${user.plan} plan` : 'Member';

  return (
    <div className="app-dark min-h-screen bg-background font-body-md text-on-surface antialiased">
      {/* ── SideNav ── */}
      <aside className="no-print fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col bg-surface p-md shadow-[0px_4px_20px_rgba(0,0,0,0.04)] md:flex">
        <Link to="/projects" className="mb-lg flex items-center gap-sm px-sm pt-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-on-surface text-surface shadow-[0_2px_6px_rgba(0,0,0,0.18)]">
            <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[20px] font-bold leading-tight tracking-tight text-on-surface">MarketIntel AI</h1>
            <p className="text-[11px] text-on-surface-variant/70">Market Research</p>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-base overflow-y-auto">
          {NAV.map((item) => {
            const active = item.match?.(pathname) ?? false;
            return (
              <Link
                key={item.label}
                to={item.href}
                className={`flex items-center gap-sm rounded-full px-md py-sm font-body-md transition-all duration-300 hover:scale-[1.02] active:scale-95 ${
                  active
                    ? 'bg-surface-container-high font-semibold text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container-low'
                }`}
              >
                <span
                  className="material-symbols-outlined"
                  style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-base border-t border-outline-variant/50 pt-md">
          {FOOTER.map((item) => (
            <Link
              key={item.label}
              to={item.href}
              className="flex items-center gap-sm rounded-full px-md py-sm text-on-surface-variant transition-all duration-300 hover:bg-surface-container-low active:scale-95"
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-body-md">{item.label}</span>
            </Link>
          ))}
          <AccountMenu
            variant="sidebar"
            name={displayName}
            initials={initials}
            planLabel={planLabel}
            isAdmin={isAdmin}
            onLogout={onLogout}
          />
        </div>
      </aside>

      {/* ── TopAppBar ── */}
      <header className="no-print fixed left-0 right-0 top-0 z-30 flex h-20 items-center justify-between gap-md bg-background/80 px-lg backdrop-blur-md md:left-64">
        <Link to="/projects" className="font-display text-headline-sm font-bold text-on-surface md:hidden">MarketIntel</Link>
        <form onSubmit={onSearch} className="relative hidden w-full max-w-md md:block">
          <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full border-none bg-surface-container-lowest py-3 pl-12 pr-4 text-body-md text-on-surface outline-none aura-shadow transition-all placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-primary/20"
            placeholder="Ask anything about markets, products, or competitors…"
            type="text"
          />
        </form>
        <div className="flex items-center gap-md">
          <Link
            to="/research/new"
            className="flex items-center gap-xs rounded-full bg-primary px-md py-3 font-label-md text-sm font-semibold text-on-primary transition-all hover:opacity-90 active:scale-95 aura-shadow"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span className="hidden sm:inline">New Research</span>
          </Link>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
            title="Notifications"
          >
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <AccountMenu
            variant="topbar"
            name={displayName}
            initials={initials}
            planLabel={planLabel}
            isAdmin={isAdmin}
            onLogout={onLogout}
          />
        </div>
      </header>

      {/* ── Main canvas ── */}
      <main className="ml-0 mt-20 overflow-y-auto p-lg md:ml-64 md:p-xl">
        <Outlet />
      </main>
    </div>
  );
}

/** 账户下拉菜单:头像/姓名触发,内含 Admin(仅管理员)+ Log out。侧栏向上弹,顶栏向下弹。 */
function AccountMenu({
  variant, name, initials, planLabel, isAdmin, onLogout,
}: {
  variant: 'sidebar' | 'topbar';
  name: string;
  initials: string;
  planLabel: string;
  isAdmin: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const menu = (
    <div
      className={`absolute z-50 w-56 overflow-hidden rounded-xl bg-surface-container-lowest p-xs aura-shadow ${
        variant === 'sidebar' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'
      }`}
    >
      <div className="border-b border-outline-variant/50 px-sm pb-sm pt-xs">
        <p className="truncate font-body-md text-sm font-semibold text-on-surface">{name}</p>
        <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">{planLabel}</p>
      </div>
      {isAdmin && (
        <Link
          to="/admin"
          onClick={() => setOpen(false)}
          className="mt-xs flex items-center gap-sm rounded-lg px-sm py-sm text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
          <span className="font-body-md text-sm">Admin</span>
        </Link>
      )}
      <button
        onClick={() => { setOpen(false); onLogout(); }}
        className="flex w-full items-center gap-sm rounded-lg px-sm py-sm text-left text-on-surface-variant transition-colors hover:bg-error/5 hover:text-error"
      >
        <span className="material-symbols-outlined text-[20px]">logout</span>
        <span className="font-body-md text-sm">Log out</span>
      </button>
    </div>
  );

  if (variant === 'sidebar') {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-sm rounded-full px-md py-sm text-left transition-all duration-300 hover:bg-surface-container-low active:scale-95"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high font-data-sm text-data-sm font-bold text-on-surface-variant">
            {initials}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-body-md text-sm text-on-surface">{name}</span>
            <span className="text-[11px] text-on-surface-variant">Manage account</span>
          </div>
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">expand_less</span>
        </button>
        {open && menu}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-sm border-l border-outline-variant/60 pl-md"
      >
        <div className="hidden text-right sm:block">
          <p className="font-label-md text-sm font-semibold text-on-surface">{name}</p>
          <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">{planLabel}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high font-data-sm text-data-sm font-bold text-on-surface-variant aura-shadow">
          {initials}
        </div>
      </button>
      {open && menu}
    </div>
  );
}
