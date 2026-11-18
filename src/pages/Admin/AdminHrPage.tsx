import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck, IndianRupee, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import AdminAttendancePage from './AdminAttendancePage';
import AdminPayrollPage from './AdminPayrollPage';
import HrBackupPage from './HrBackupPage';

type HrTab = 'attendance' | 'payroll' | 'backup';

const TABS: Array<{ id: HrTab; label: string; icon: React.ElementType }> = [
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'payroll', label: 'Payroll', icon: IndianRupee },
  { id: 'backup', label: 'Backup & Archive', icon: Archive },
];

/**
 * One place for everything HR related.
 * The selected section is kept in the address (?tab=payroll), so it can be bookmarked and the browser
 * back button works.
 */
const AdminHrPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: HrTab = raw === 'payroll' || raw === 'backup' ? raw : 'attendance';

  const select = (next: HrTab) => setParams({ tab: next }, { replace: true });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'attendance' && <AdminAttendancePage />}
      {tab === 'payroll' && <AdminPayrollPage />}
      {tab === 'backup' && <HrBackupPage />}
    </div>
  );
};

export default AdminHrPage;
