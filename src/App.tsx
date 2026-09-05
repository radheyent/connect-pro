import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/Auth/LoginPage';
import AdminDashboard from './pages/Admin/AdminDashboard';
import EmployeeDashboard from './pages/Employee/EmployeeDashboard';
import FieldBoyDashboard from './pages/FieldBoy/FieldBoyDashboard';
import EmployeeManagement from './pages/Admin/EmployeeManagement';
import LeadManagement from './pages/Admin/LeadManagement';
import FakeCallsPanel from './pages/Admin/FakeCallsPanel';
import ReportsPage from './pages/Admin/ReportsPage';
import BackupPage from './pages/Admin/BackupPage';
import StoreExpensesPage from './pages/Admin/StoreExpensesPage';
import FieldExpensesPage from './pages/Admin/FieldExpensesPage';
import EmployeeLeadsPage from './pages/Employee/EmployeeLeadsPage';
import EmployeeExpensesPage from './pages/Employee/EmployeeExpensesPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import MyConveyancePage from './pages/FieldBoy/MyConveyancePage';
import DashboardLayout from './components/layout/DashboardLayout';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';

// ── ProtectedRoute ─────────────────────────────────────────────────────────
const ProtectedRoute = React.memo(({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
});
ProtectedRoute.displayName = 'ProtectedRoute';

// ── RoleRedirect ───────────────────────────────────────────────────────────
const RoleRedirect = React.memo(() => {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Redirecting...</p>
        </div>
      </div>
    );
  }

  if (!profile) return <Navigate to="/login" replace />;

  switch (profile.role) {
    case 'admin':     return <Navigate to="/admin"     replace />;
    case 'field_boy': return <Navigate to="/field-boy" replace />;
    case 'employee':  return <Navigate to="/employee"  replace />;
    default:          return <Navigate to="/login"     replace />;
  }
});
RoleRedirect.displayName = 'RoleRedirect';

// ── App ────────────────────────────────────────────────────────────────────
function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/"      element={<RoleRedirect />} />

            {/* ── Shared routes (all roles) ── */}
            <Route
              path="/"
              element={
                <ProtectedRoute allowedRoles={['admin', 'employee', 'field_boy']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="announcements" element={<AnnouncementsPage />} />
            </Route>

            {/* ── Admin routes ── */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index              element={<AdminDashboard />} />
              <Route path="employees"  element={<EmployeeManagement />} />
              <Route path="leads"      element={<LeadManagement />} />
              <Route path="fake-calls" element={<FakeCallsPanel />} />
              <Route path="reports"    element={<ReportsPage />} />
              <Route path="backup"     element={<BackupPage />} />
              <Route path="expenses/store" element={<StoreExpensesPage />} />
              <Route path="expenses/field" element={<FieldExpensesPage />} />
              <Route path="expenses" element={<StoreExpensesPage />} />
            </Route>

            {/* ── Employee routes ── */}
            <Route
              path="/employee"
              element={
                <ProtectedRoute allowedRoles={['employee']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index            element={<EmployeeDashboard />} />
              <Route path="leads"     element={<EmployeeLeadsPage />} />
              <Route path="expenses"  element={<EmployeeExpensesPage />} />
            </Route>

            {/* ── Field Boy routes ── */}
            <Route
              path="/field-boy"
              element={
                <ProtectedRoute allowedRoles={['field_boy']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index              element={<FieldBoyDashboard />} />
              <Route path="conveyance"  element={<MyConveyancePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  );
}

export default App;
