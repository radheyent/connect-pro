import React from 'react';
import CelebrationSystem, { RecentActivityPanel } from '@/components/CelebrationSystem';
import PWAInstallButton from '@/components/PWAInstallButton';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Share2, 
  PhoneMissed, 
  BarChart3, 
  Database, 
  LogOut, 
  Menu, 
  X, 
  Sun, 
  Moon,
  Briefcase,
  Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Sheet, 
  SheetContent, 
  SheetTrigger 
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const DashboardLayout: React.FC = () => {
  const [showActivity, setShowActivity] = React.useState(false);
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  const navItems = [
    { name: 'Dashboard', path: `/${profile?.role}`, icon: LayoutDashboard, roles: ['admin', 'employee', 'field_boy'] },
    { name: 'Employees', path: '/admin/employees', icon: Users, roles: ['admin'] },
    { name: 'All Leads', path: '/admin/leads', icon: Share2, roles: ['admin'] },
    { name: 'Fake Calls', path: '/admin/fake-calls', icon: PhoneMissed, roles: ['admin'] },
    { name: 'Reports', path: '/admin/reports', icon: BarChart3, roles: ['admin'] },
    { name: 'Backup', path: '/admin/backup', icon: Database, roles: ['admin'] },
    { name: 'My Leads', path: '/employee/leads', icon: Users, roles: ['employee'] },
    { name: 'Announcements', path: '/announcements', icon: Bell, roles: ['admin', 'employee', 'field_boy'] },
  ].filter(item => item.roles.includes(profile?.role || ''));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      <div className="p-6 flex items-center gap-3 border-b border-slate-800">
        <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-lg italic text-white">C+</div>
        <span className="text-xl font-bold tracking-tight">Connect Pro</span>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
          {profile?.role === 'admin' ? 'Admin Menu' : 'Main Menu'}
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 p-2 rounded-lg transition-colors",
                isActive 
                  ? "bg-blue-600/10 text-blue-400" 
                  : "text-slate-400 hover:bg-slate-800"
              )}
            >
              <span className={cn(
                "w-2 h-2 rounded-full",
                isActive ? "bg-blue-500" : "bg-transparent"
              )}></span>
              <Icon className="h-4 w-4" />
              <span className={cn(isActive && "font-medium")}>{item.name}</span>
            </Link>
          );
        })}
        <div className="pt-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">System</div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 p-2 text-slate-400 hover:bg-slate-800 rounded-lg cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-transparent"></span>
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </nav>
      <div className="p-4 border-t border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-semibold text-slate-300">
          {profile?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
        </div>
        <div>
          <p className="text-sm font-medium">{profile?.name}</p>
          <p className="text-xs text-slate-500 capitalize">{profile?.role?.replace('_', ' ')}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 bg-slate-900">
        <SidebarContent />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" />}>
                <Menu className="h-6 w-6 text-slate-600" />
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 bg-slate-900 border-none">
                <SidebarContent />
              </SheetContent>
            </Sheet>
            <h1 className="text-lg font-bold text-slate-800 capitalize">
              {navItems.find(item => item.path === location.pathname)?.name || 'Dashboard'}
            </h1>
            <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded uppercase">System Live</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
              {isDarkMode ? <Sun className="h-5 w-5 text-slate-500" /> : <Moon className="h-5 w-5 text-slate-500" />}
            </Button>
            <PWAInstallButton />
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowActivity(v => !v)}
                className="p-2 text-slate-500 border border-slate-200 rounded-md bg-white hover:bg-slate-50 relative transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
                </svg>
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white animate-pulse" />
              </button>

              {showActivity && (
                <div className="absolute right-0 top-11 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <span className="text-sm font-bold text-slate-800">Recent Activity</span>
                    <button onClick={() => setShowActivity(false)} className="text-slate-400 hover:text-slate-700 text-lg leading-none">&times;</button>
                  </div>
                  <div className="p-3">
                    <RecentActivityPanel />
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          <Outlet />
        </main>
      </main>
      <CelebrationSystem />
    </div>
  );
};

export default DashboardLayout;
