import React from 'react';
import CelebrationSystem, { RecentActivityPanel } from '@/components/CelebrationSystem';
import PWAInstallButton from '@/components/PWAInstallButton';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  LayoutDashboard, Users, Share2, PhoneMissed, 
  BarChart3, Database, LogOut, Menu, Sun, Moon, Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const DashboardLayout: React.FC = () => {
  const [showActivity, setShowActivity] = React.useState(false);
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const [isDarkMode, setIsDarkMode] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cp-dark');
      return saved === '1' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const activityRef = React.useRef<HTMLDivElement>(null);

  // Dark mode toggle with optimization
  const toggleDarkMode = React.useCallback(() => {
    setIsDarkMode(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('cp-dark', next ? '1' : '0');
      return next;
    });
  }, []);

  // Initialize dark mode on mount
  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Close activity panel on outside click
  React.useEffect(() => {
    if (!showActivity) return;
    
    const handler = (e: MouseEvent) => {
      if (activityRef.current && !activityRef.current.contains(e.target as Node)) {
        setShowActivity(false);
      }
    };
    
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActivity]);

  // Close mobile menu on route change
  React.useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const navItems = React.useMemo(() => [
    { name: 'Dashboard', path: `/${profile?.role}`, icon: LayoutDashboard, roles: ['admin', 'employee', 'field_boy'] },
    { name: 'Employees', path: '/admin/employees', icon: Users, roles: ['admin'] },
    { name: 'All Leads', path: '/admin/leads', icon: Share2, roles: ['admin'] },
    { name: 'Fake Calls', path: '/admin/fake-calls', icon: PhoneMissed, roles: ['admin'] },
    { name: 'Reports', path: '/admin/reports', icon: BarChart3, roles: ['admin'] },
    { name: 'Backup', path: '/admin/backup', icon: Database, roles: ['admin'] },
    { name: 'My Leads', path: '/employee/leads', icon: Users, roles: ['employee'] },
    { name: 'Announcements', path: '/announcements', icon: Bell, roles: ['admin', 'employee', 'field_boy'] },
  ].filter(item => item.roles.includes(profile?.role || '')), [profile?.role]);

  const handleSignOut = React.useCallback(async () => {
    await signOut();
    navigate('/login');
  }, [signOut, navigate]);

  // Helper to check if nav item is active - FIXED LOGIC
  const isNavItemActive = React.useCallback((item: typeof navItems[0]) => {
    const currentPath = location.pathname;
    const itemPath = item.path;
    
    // Exact match first
    if (currentPath === itemPath) return true;
    
    // For Dashboard items (role root paths), ONLY exact match
    if (item.name === 'Dashboard') return false;
    
    // For other items, check if current path is a sub-route
    // Use `startsWith(itemPath + '/')` to avoid false matches
    // e.g., /admin/leads matches /admin/leads/123 but NOT /admin
    return currentPath.startsWith(itemPath + '/');
  }, [location.pathname]);

  const SidebarContent = React.memo(({ onNavClick }: { onNavClick?: () => void }) => (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3 border-b border-slate-800">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center font-bold text-lg text-white shadow-lg">
          C+
        </div>
        <span className="text-xl font-bold tracking-tight">Connect Pro</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">
          {profile?.role === 'admin' ? 'Admin Menu' : 'Main Menu'}
        </p>
        
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = isNavItemActive(item);
          
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavClick}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm",
                isActive
                  ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-900/30"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn(isActive && "font-semibold")}>{item.name}</span>
            </Link>
          );
        })}

        {/* Sign Out */}
        <div className="pt-3 border-t border-slate-800 mt-3">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition-all duration-200 text-sm"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center font-bold text-white text-sm shadow-lg">
          {profile?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{profile?.name || 'User'}</p>
          <p className="text-xs text-slate-500 capitalize truncate">
            {profile?.role?.replace('_', ' ') || 'Role'}
          </p>
        </div>
      </div>
    </div>
  ));

  SidebarContent.displayName = 'SidebarContent';

  // Get current page title
  const currentPageTitle = React.useMemo(() => {
    const activeItem = navItems.find(item => isNavItemActive(item));
    return activeItem?.name || 'Dashboard';
  }, [navItems, isNavItemActive]);

  return (
    <div
      className={cn(
        "flex h-screen overflow-hidden font-sans transition-colors duration-200",
        "bg-slate-50 text-slate-900",
        "dark:bg-slate-950 dark:text-slate-100"
      )}
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 bg-slate-900 shrink-0 shadow-xl">
        <SidebarContent />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header
          className={cn(
            "h-14 sm:h-16 shrink-0 flex items-center justify-between px-3 sm:px-6 z-20 shadow-sm border-b transition-colors",
            "bg-white border-slate-200",
            "dark:bg-slate-900 dark:border-slate-800"
          )}
        >
          {/* Left Section */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {/* Mobile Menu Toggle */}
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden h-8 w-8 dark:text-slate-300"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 bg-slate-900 border-none">
                <SidebarContent onNavClick={() => setIsMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            {/* Page Title */}
            <h1 className="text-sm sm:text-lg font-bold truncate dark:text-white">
              {currentPageTitle}
            </h1>

            {/* Live Badge */}
            <span className="hidden sm:inline-flex px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 text-[10px] font-bold rounded uppercase shrink-0">
              Live
            </span>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className={cn(
                "p-2 rounded-lg transition-colors",
                "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              )}
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? (
                <Sun className="h-4 w-4 sm:h-5 sm:w-5" />
              ) : (
                <Moon className="h-4 w-4 sm:h-5 sm:w-5" />
              )}
            </button>

            {/* PWA Install - Hidden on mobile */}
            <div className="hidden sm:block">
              <PWAInstallButton />
            </div>

            {/* Activity/Notifications Bell */}
            <div className="relative" ref={activityRef}>
              <button
                onClick={() => setShowActivity(v => !v)}
                className={cn(
                  "p-2 rounded-lg border transition-colors relative",
                  "bg-white border-slate-200 text-slate-500 hover:bg-slate-50",
                  "dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700",
                  showActivity && "bg-slate-100 dark:bg-slate-700"
                )}
                aria-label="View recent activity"
                aria-expanded={showActivity}
              >
                <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
              </button>

              {/* Activity Dropdown */}
              {showActivity && (
                <div
                  className={cn(
                    "absolute top-12 right-0 w-80 max-w-[calc(100vw-24px)] rounded-xl shadow-2xl z-50 overflow-hidden border",
                    "bg-white border-slate-200",
                    "dark:bg-slate-900 dark:border-slate-700"
                  )}
                >
                  {/* Dropdown Header */}
                  <div
                    className={cn(
                      "flex items-center justify-between px-4 py-3 border-b",
                      "bg-slate-50 border-slate-100",
                      "dark:bg-slate-800 dark:border-slate-700"
                    )}
                  >
                    <span className="text-sm font-bold dark:text-white">Recent Activity</span>
                    <button
                      onClick={() => setShowActivity(false)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none"
                      aria-label="Close activity panel"
                    >
                      &times;
                    </button>
                  </div>

                  {/* Activity Content */}
                  <div className="p-3 dark:bg-slate-900 max-h-96 overflow-y-auto">
                    <RecentActivityPanel />
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Page Content */}
        <main
          className={cn(
            "flex-1 overflow-y-auto p-3 sm:p-6 transition-colors",
            "bg-slate-50/50",
            "dark:bg-slate-950"
          )}
        >
          <Outlet />
        </main>
      </div>

      {/* Celebration System */}
      <CelebrationSystem />
    </div>
  );
};

export default DashboardLayout;
