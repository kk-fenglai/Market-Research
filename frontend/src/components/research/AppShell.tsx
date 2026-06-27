import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';

/**
 * 市场调研全站外壳:固定左侧导航 + 顶栏 + 主画布(Synthetica 深色设计系统)。
 * 移植自旧 市场调研 工程的 AppShell;.app-dark 把深色作用域限定在调研页面内。
 */

type NavItem = {
  label: string;
  icon: string;
  href: string;
  match?: (path: string) => boolean;
  placeholder?: boolean;
};

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', href: '/projects', match: (p) => p === '/projects' || p.startsWith('/research/') },
  { label: 'Research Projects', icon: 'analytics', href: '/research/new', match: (p) => p.startsWith('/research/new') },
  { label: 'Reports', icon: 'description', href: '/projects', match: (p) => p === '/reports' },
  { label: 'Billing', icon: 'payments', href: '/orders', match: (p) => p.startsWith('/orders') },
  { label: 'Admin Settings', icon: 'settings', href: '/admin', match: (p) => p.startsWith('/admin') },
];

export default function AppShell() {
  const pathname = useLocation().pathname;
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  async function onLogout() {
    await logout();
    navigate('/login');
  }

  const initials = (user?.name || user?.email || 'U').slice(0, 2).toUpperCase();

  return (
    <div className="app-dark min-h-screen bg-background font-body-md text-on-surface antialiased">
      {/* ── SideNav ── */}
      <nav className="no-print fixed left-0 top-0 z-40 hidden h-full w-64 flex-col border-r border-outline-variant bg-surface-container-low md:flex">
        <Link to="/projects" className="flex items-center gap-sm border-b border-outline-variant p-lg">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container">
            <span className="material-symbols-outlined text-on-primary-container">psychology</span>
          </div>
          <div>
            <div className="font-display text-headline-sm font-bold tracking-tight text-primary">MarketIntel AI</div>
            <div className="font-data-sm text-data-sm text-on-surface-variant">Expert Intelligence</div>
          </div>
        </Link>

        <div className="flex flex-1 flex-col gap-base overflow-y-auto px-sm py-md">
          {NAV.map((item) => {
            const active = item.match?.(pathname) ?? false;
            if (item.placeholder) {
              return (
                <span
                  key={item.label}
                  title="即将上线"
                  className="flex cursor-not-allowed items-center gap-md rounded-lg px-md py-sm font-body-md text-on-surface-variant/40"
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span>{item.label}</span>
                </span>
              );
            }
            return (
              <Link
                key={item.label}
                to={item.href}
                className={`flex items-center gap-md rounded-lg px-md py-sm font-body-md transition-colors ${
                  active
                    ? 'border-r-2 border-secondary bg-surface-container-high font-bold text-secondary'
                    : 'text-on-surface-variant hover:bg-surface-container-highest'
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
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-sm border-t border-outline-variant p-md text-left transition-colors hover:bg-surface-container-highest"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container font-data-sm text-data-sm font-bold text-on-primary-container">
            {initials}
          </div>
          <div className="flex flex-1 flex-col overflow-hidden">
            <span className="truncate font-body-md text-on-surface">{user?.name || user?.email || 'Account'}</span>
            <span className="font-label-caps text-label-caps text-on-surface-variant">Log out</span>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant">logout</span>
        </button>
      </nav>

      {/* ── TopAppBar ── */}
      <header className="no-print fixed left-0 right-0 top-0 z-30 flex h-16 items-center justify-between border-b border-outline-variant bg-background/80 px-lg backdrop-blur-md md:left-64">
        <Link to="/projects" className="font-display text-headline-sm font-bold text-primary md:hidden">MarketIntel</Link>
        <div className="hidden md:block" />
        <div className="flex items-center gap-md">
          <div
            title="计费即将上线"
            className="hidden items-center gap-sm rounded-full border border-outline-variant bg-surface-container px-sm py-xs font-data-sm text-data-sm text-on-surface-variant md:flex"
          >
            <span className="material-symbols-outlined text-[16px]">monetization_on</span>
            <span>Credits: ∞</span>
          </div>
          <Link
            to="/research/new"
            className="flex items-center gap-xs rounded-lg bg-primary px-md py-xs font-body-md text-on-primary transition-opacity hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Research
          </Link>
          <button
            onClick={onLogout}
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high"
            title="Log out"
          >
            <span className="material-symbols-outlined">account_circle</span>
          </button>
        </div>
      </header>

      {/* ── Main canvas ── */}
      <main className="ml-0 mt-16 overflow-y-auto p-lg md:ml-64">
        <Outlet />
      </main>
    </div>
  );
}
