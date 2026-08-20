import React from 'react';
import CelebrationSystem, { RecentActivityPanel } from '@/components/CelebrationSystem';
import PWAInstallButton from '@/components/PWAInstallButton';
import NotificationPrompt from '@/components/NotificationPrompt';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, Users, Share2, PhoneMissed,
  BarChart3, Database, LogOut, Menu, Sun, Moon,
  Bell, Wallet, Car, Receipt, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

// ── Page title map ─────────────────────────────────────────────────────────
const PAGE_TITLES: Record<string, string> = {
  '/admin':                   'Dashboard',
  '/admin/employees':         'Employee Management',
  '/admin/leads':             'Lead Management',
  '/admin/fake-calls':        'Fake Calls',
  '/admin/reports':           'Reports',
  '/admin/backup':            'Backup & Reset',
  '/admin/expenses':          'Expenses',
  '/employee':                'My Dashboard',
  '/employee/leads':          'My Leads',
  '/employee/expenses':       'My Expenses',
  '/field-boy':               'Field Closure Desk',
  '/field-boy/conveyance':    'My Conveyance',
  '/announcements':           'Announcements',
};

const getPageTitle = (pathname: string): string => {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const sorted = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (pathname.startsWith(key + '/')) return PAGE_TITLES[key];
  }
  return 'Dashboard';
};

const DashboardLayout: React.FC = () => {
  const [showActivity, setShowActivity] = React.useState(false);
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const [isDarkMode, setIsDarkMode] = React.useState(() =>
    typeof window !== 'undefined' && (
      localStorage.getItem('cp-dark') === '1' ||
      document.documentElement.classList.contains('dark')
    )
  );
  const { profile, signOut } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();
  const activityRef = React.useRef<HTMLDivElement>(null);

  const pageTitle = React.useMemo(() => getPageTitle(location.pathname), [location.pathname]);

  React.useEffect(() => {
    document.title = `${pageTitle} — Connect Pro`;
  }, [pageTitle]);

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('cp-dark', next ? '1' : '0');
  };

  React.useEffect(() => {
    const saved = localStorage.getItem('cp-dark');
    if (saved === '1' && !document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    }
  }, []);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (activityRef.current && !activityRef.current.contains(e.target as Node)) {
        setShowActivity(false);
      }
    };
    if (showActivity) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActivity]);

  // ── Nav items per role ────────────────────────────────────────────────────
  const navItems = React.useMemo(() => {
    const role = profile?.role || '';
    const dashPath =
      role === 'field_boy' ? '/field-boy' :
      role === 'employee'  ? '/employee'  :
      '/admin';

    const all = [
      // ── Admin ──
      { name: 'Dashboard',      path: dashPath,              icon: LayoutDashboard, roles: ['admin','employee','field_boy'] },
      { name: 'Employees',      path: '/admin/employees',    icon: Users,           roles: ['admin'] },
      { name: 'All Leads',      path: '/admin/leads',        icon: Share2,          roles: ['admin'] },
      { name: 'Fake Calls',     path: '/admin/fake-calls',   icon: PhoneMissed,     roles: ['admin'] },
      { name: 'Reports',        path: '/admin/reports',      icon: BarChart3,       roles: ['admin'] },
      { name: 'Expenses',       path: '/admin/expenses',     icon: Wallet,          roles: ['admin'] },
      { name: 'Backup',         path: '/admin/backup',       icon: Database,        roles: ['admin'] },
      // ── Employee ──
      { name: 'My Leads',       path: '/employee/leads',     icon: Users,           roles: ['employee'] },
      { name: 'My Expenses',    path: '/employee/expenses',  icon: Receipt,         roles: ['employee'] },
      // ── Field Boy ──
      { name: 'My Conveyance',  path: '/field-boy/conveyance', icon: Car,           roles: ['field_boy'] },
      // ── Shared ──
      { name: 'Announcements',  path: '/announcements',      icon: Bell,            roles: ['admin','employee','field_boy'] },
      { name: 'Attendance',     path: 'external',            url: 'https://script.google.com/macros/s/AKfycbyRxMMBPeEOPWHBi4rWSQ_tneLOxgltRsnP6aCwSp34-zsHx-XWQtfMHoatY7RdZwX3/exec', icon: ExternalLink, roles: ['admin','employee'] },
    ];

    return all.filter(item => item.roles.includes(role));
  }, [profile?.role]);

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  // ── Sidebar content ───────────────────────────────────────────────────────
  const SidebarContent = React.useCallback(
    ({ onNavClick }: { onNavClick?: () => void } = {}) => (
      <div className="flex flex-col h-full bg-slate-900 text-white">
        {/* Logo */}
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-lg text-white">
            C+
          </div>
          <span className="text-xl font-bold tracking-tight">Connect Pro</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">
            {profile?.role === 'admin' ? 'Admin Menu' : 'Main Menu'}
          </p>

          {navItems.map(item => {
            const Icon     = item.icon;
            const isDash   = item.name === 'Dashboard';
            const isExternal = item.path === 'external';
            const isActive = !isExternal && (isDash
              ? location.pathname === item.path
              : location.pathname === item.path ||
                location.pathname.startsWith(item.path + '/'));

            const linkClass = cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm',
              isActive
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            );

            return isExternal ? (
              <a
                key={item.name}
                href={(item as any).url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onNavClick}
                className={linkClass}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.name}</span>
              </a>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                onClick={onNavClick}
                className={linkClass}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn(isActive && 'font-semibold')}>{item.name}</span>
              </Link>
            );
          })}

          {/* Sign out */}
          <div className="pt-3 border-t border-slate-800 mt-3">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition-all text-sm"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-bold text-blue-400 text-sm">
            {profile?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{profile?.name}</p>
            <p className="text-xs text-slate-500 capitalize">
              {profile?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>
    ),
    [navItems, location.pathname, profile, handleSignOut]
  );

  return (
    <div className={cn(
      'flex h-screen overflow-hidden font-sans transition-colors duration-200',
      'bg-slate-50 text-slate-900',
      'dark:bg-slate-950 dark:text-slate-100'
    )}>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 bg-slate-900 shrink-0">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className={cn(
          'h-14 sm:h-16 shrink-0 flex items-center justify-between px-3 sm:px-6 z-20 shadow-sm border-b transition-colors',
          'bg-white border-slate-200',
          'dark:bg-slate-900 dark:border-slate-800'
        )}>
          {/* Left side */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {/* Mobile hamburger */}
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon"
                  className="lg:hidden h-8 w-8 dark:text-slate-300">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 bg-slate-900 border-none">
                <SidebarContent onNavClick={() => setIsMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            {/* Dynamic page title */}
            <h1 className="text-sm sm:text-lg font-bold truncate dark:text-white">
              {pageTitle}
            </h1>
            <span className="hidden sm:inline-flex px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 text-[10px] font-bold rounded uppercase shrink-0">
              Live
            </span>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Dark mode */}
            <button
              onClick={toggleDarkMode}
              className={cn(
                'p-2 rounded-lg transition-colors',
                'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
                'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
              )}
            >
              {isDarkMode
                ? <Sun className="h-4 w-4 sm:h-5 sm:w-5" />
                : <Moon className="h-4 w-4 sm:h-5 sm:w-5" />}
            </button>

            {/* PWA install button */}
            <PWAInstallButton />

            {/* Activity bell */}
            <div className="relative" ref={activityRef}>
              <button
                onClick={() => setShowActivity(v => !v)}
                className={cn(
                  'p-2 rounded-lg border transition-colors relative',
                  'bg-white border-slate-200 text-slate-500 hover:bg-slate-50',
                  'dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700',
                  showActivity && 'bg-slate-100 dark:bg-slate-700'
                )}
              >
                <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-white dark:border-slate-900 animate-pulse" />
              </button>

              {/* Activity dropdown */}
              {showActivity && (
                <div
                  className={cn(
                    'absolute top-11 w-80 rounded-2xl shadow-2xl z-50 overflow-hidden border',
                    'right-0',
                    'bg-white border-slate-200',
                    'dark:bg-slate-900 dark:border-slate-700'
                  )}
                  style={{ maxWidth: 'calc(100vw - 24px)' }}
                >
                  <div className={cn(
                    'flex items-center justify-between px-4 py-3 border-b',
                    'bg-slate-50 border-slate-100',
                    'dark:bg-slate-800 dark:border-slate-700'
                  )}>
                    <span className="text-sm font-bold dark:text-white">Recent Activity</span>
                    <button
                      onClick={() => setShowActivity(false)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="p-3 dark:bg-slate-900">
                    <RecentActivityPanel />
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className={cn(
          'flex-1 overflow-y-auto p-3 sm:p-6 transition-colors',
          'bg-slate-50/50',
          'dark:bg-slate-950'
        )}>
          <Outlet />
        </main>
      </div>

      <CelebrationSystem />
      <NotificationPrompt />
    </div>
  );
};

export default DashboardLayout;
