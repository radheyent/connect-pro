import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Archive, Download, Loader2, Trash2, Users, CalendarCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// ═════════════════════════════════════════════════════════════════════════════
// Types + helpers
// ═════════════════════════════════════════════════════════════════════════════
interface ProfileRow {
  id: string;
  name: string | null;
  employee_code: string | null;
  designation: string | null;
  joining_date: string | null;
  role: string | null;
  is_active: boolean | null;
}

interface AttRow {
  id: string;
  emp_id: string;
  date: string;
  status: string;
  in_time: string | null;
  out_time: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  remarks: string | null;
  source: string | null;
}

interface Stats {
  total: number;
  kept: number;
  old: number;
  oldest: string | null;
  savedMonths: number;
}

const IST = 'Asia/Kolkata';
const HR_LAST_KEY = 'hrBackupLastAt';

const istToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: IST });

/** First day of the previous month. Attendance before this date is "old". */
const archiveCutoff = (): string => {
  const [y, m] = istToday().split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

const fmtIso = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST }) : '';

const fmt24 = (t: string | null): string => {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};

const worked = (r: AttRow): string => {
  if (!r.check_in_at || !r.check_out_at) return '';
  const mins = Math.max(0, Math.round((new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};

const STATUS_LABEL: Record<string, string> = {
  present: 'Present', absent: 'Absent', halfday: 'Half Day', leave: 'Leave', weekoff: 'Week Off', holiday: 'Holiday',
};

/** PostgREST returns max 1000 rows per request, so read in pages. */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(error.message);
    const page = (data as T[]) ?? [];
    out.push(...page);
    if (page.length < size) break;
  }
  return out;
}

const fmtStamp = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'never';

/** Attendance rows -> the two Excel sheets (detail + monthly summary) */
function attendanceSheets(rows: AttRow[], people: Map<string, ProfileRow>) {
  const nameOf = (id: string) => people.get(id)?.name ?? '';
  const codeOf = (id: string) => people.get(id)?.employee_code ?? '';

  const detail = rows.map(r => ({
    Date: r.date,
    'Emp Code': codeOf(r.emp_id),
    Name: nameOf(r.emp_id),
    Status: STATUS_LABEL[r.status] ?? r.status,
    In: r.check_in_at ? fmtIso(r.check_in_at) : fmt24(r.in_time),
    Out: r.check_out_at ? fmtIso(r.check_out_at) : fmt24(r.out_time),
    Hours: worked(r),
    Remarks: r.remarks ?? '',
    Source: r.source ?? '',
  }));

  const groups = new Map<string, { month: string; emp: string; p: number; h: number; l: number; w: number; o: number; a: number }>();
  rows.forEach(r => {
    const key = `${r.date.slice(0, 7)}|${r.emp_id}`;
    const g = groups.get(key) ?? { month: r.date.slice(0, 7), emp: r.emp_id, p: 0, h: 0, l: 0, w: 0, o: 0, a: 0 };
    if (r.status === 'present') g.p++;
    else if (r.status === 'halfday') g.h++;
    else if (r.status === 'leave') g.l++;
    else if (r.status === 'weekoff') g.w++;
    else if (r.status === 'holiday') g.o++;
    else if (r.status === 'absent') g.a++;
    groups.set(key, g);
  });
  const summary = Array.from(groups.values())
    .sort((a, b) => a.month.localeCompare(b.month) || nameOf(a.emp).localeCompare(nameOf(b.emp)))
    .map(g => ({
      Month: g.month,
      'Emp Code': codeOf(g.emp),
      Name: nameOf(g.emp),
      Present: g.p,
      'Half Day': g.h,
      Leave: g.l,
      'Week Off': g.w,
      Holiday: g.o,
      Absent: g.a,
      'Payable Days': g.p + g.l + g.w + g.o + g.h * 0.5,
    }));

  return { detail, summary };
}

// ═════════════════════════════════════════════════════════════════════════════
// Page
// ═════════════════════════════════════════════════════════════════════════════
const HrBackupPage: React.FC = () => {
  const [hrBusy, setHrBusy] = useState(false);
  const [hrLast, setHrLast] = useState<string | null>(() => {
    try { return localStorage.getItem(HR_LAST_KEY); } catch { return null; }
  });

  const [stats, setStats] = useState<Stats | null>(null);
  const [attBusy, setAttBusy] = useState<'all' | 'old' | 'delete' | null>(null);
  const [archived, setArchived] = useState<{ count: number; at: string } | null>(null);
  const [typed, setTyped] = useState('');

  const cutoff = archiveCutoff();

  const loadStats = useCallback(async () => {
    const count = async (build: (q: ReturnType<typeof base>) => unknown) => {
      const { count: c, error } = (await build(base())) as { count: number | null; error: { message: string } | null };
      if (error) throw new Error(error.message);
      return c ?? 0;
    };
    const base = () => supabase.from('attendance').select('id', { count: 'exact', head: true });
    try {
      const [total, old] = await Promise.all([
        count(q => q),
        count(q => (q as ReturnType<typeof base>).lt('date', cutoff)),
      ]);
      let oldest: string | null = null;
      if (old > 0) {
        const { data } = await supabase.from('attendance').select('date').order('date', { ascending: true }).limit(1);
        oldest = (data as Array<{ date: string }> | null)?.[0]?.date ?? null;
      }
      const { data: monthRows } = await supabase.from('attendance_monthly_summary').select('month').limit(1000);
      const savedMonths = new Set(((monthRows as Array<{ month: string }> | null) ?? []).map(r => r.month)).size;
      setStats({ total, kept: total - old, old, oldest, savedMonths });
    } catch (e) {
      toast.error((e as Error).message || 'Could not read attendance counts');
    }
  }, [cutoff]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const loadPeople = async (): Promise<Map<string, ProfileRow>> => {
    const rows = await fetchAll<ProfileRow>((f, t) =>
      supabase.from('user_profiles').select('id,name,employee_code,designation,joining_date,role,is_active').range(f, t)
    );
    return new Map(rows.map(r => [r.id, r] as [string, ProfileRow]));
  };

  // ── HR backup ─────────────────────────────────────────────────────────────
  const downloadHr = async () => {
    if (hrBusy) return;
    setHrBusy(true);
    try {
      const people = await loadPeople();
      const nameOf = (id: string) => people.get(id)?.name ?? '';
      const codeOf = (id: string) => people.get(id)?.employee_code ?? '';

      // Login emails live in the auth system, so they come from the secured admin endpoint
      let authInfo = new Map<string, { email: string | null; last_sign_in_at: string | null }>();
      try {
        const res = await adminFetch('/api/admin/employees/list');
        const json = await res.json();
        if (res.ok) {
          authInfo = new Map(
            ((json.employees as Array<{ id: string; email: string | null; last_sign_in_at: string | null }>) ?? []).map(
              e => [e.id, { email: e.email, last_sign_in_at: e.last_sign_in_at }] as [string, { email: string | null; last_sign_in_at: string | null }]
            )
          );
        } else {
          toast.warning('Login emails could not be included in the backup');
        }
      } catch {
        toast.warning('Login emails could not be included in the backup');
      }

      const monthly = await fetchAll<Record<string, any>>((f, t) =>
        supabase.from('attendance_monthly_summary').select('*').order('month').range(f, t));

      const [details, payroll, incentives, slips, docs] = await Promise.all([
        fetchAll<{ emp_id: string; mobile_number: string | null; personal_email: string | null }>((f, t) =>
          supabase.from('employee_details').select('*').range(f, t)),
        fetchAll<{ emp_id: string; salary: number }>((f, t) => supabase.from('employee_payroll').select('*').range(f, t)),
        fetchAll<Record<string, any>>((f, t) => supabase.from('incentives').select('*').order('month').range(f, t)),
        fetchAll<Record<string, any>>((f, t) => supabase.from('salary_slips').select('*').order('month').range(f, t)),
        fetchAll<Record<string, any>>((f, t) => supabase.from('employee_documents').select('*').range(f, t)),
      ]);
      const detailMap = new Map(details.map(d => [d.emp_id, d]));
      const payMap = new Map(payroll.map(p => [p.emp_id, p.salary]));

      const employees = Array.from(people.values())
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
        .map(p => ({
          'Emp Code': p.employee_code ?? '',
          Name: p.name ?? '',
          'Login Email': authInfo.get(p.id)?.email ?? '',
          Role: p.role ?? '',
          Active: p.is_active === false ? 'No' : 'Yes',
          Designation: p.designation ?? '',
          'Joining Date': p.joining_date ?? '',
          'Mobile Number': detailMap.get(p.id)?.mobile_number ?? '',
          'Personal Email': detailMap.get(p.id)?.personal_email ?? '',
          'Monthly Salary': payMap.get(p.id) ?? '',
          'Last Login': authInfo.get(p.id)?.last_sign_in_at ? fmtStamp(authInfo.get(p.id)?.last_sign_in_at ?? null) : '',
        }));

      const incentiveRows = incentives.map(i => ({
        Month: i.month, 'Emp Code': codeOf(i.emp_id), Name: nameOf(i.emp_id),
        'Total Sales': i.total_sale, 'Per Sale': i.per_sale_incentive, 'Total Incentive': i.total_incentive,
      }));

      const slipRows = slips.map(s => ({
        Month: s.month, 'Emp Code': codeOf(s.emp_id), Name: nameOf(s.emp_id),
        'Fixed Salary': s.fixed_salary, 'Days In Month': s.days_in_month, 'Payable Days': s.payable_days,
        'Pay (pro-rated)': s.prorated_salary, Basic: s.basic_salary, HRA: s.hra, Conveyance: s.conveyance,
        'Special Allowance': s.special_allowance, 'Attendance Bonus': s.attendance_bonus, Incentive: s.incentive_amount,
        'Other Deductions': s.other_deductions, 'Total Earnings': s.total_earnings, 'Net Salary': s.net_salary,
        Present: s.present_days, 'Half Day': s.half_days, Leave: s.leave_days, 'Week Off': s.weekoff_days,
        Holiday: s.holiday_days, Absent: s.absent_days, 'Manual Pay': s.is_manual_override ? 'Yes' : 'No', Notes: s.notes ?? '',
      }));

      const docRows = docs.map(d => ({
        'Emp Code': codeOf(d.emp_id), Name: nameOf(d.emp_id), Type: d.doc_type, 'File Name': d.file_name,
        'Stored In': d.storage_path ? 'Supabase Storage' : 'Google Drive link',
        'Path / Link': d.storage_path ?? d.file_url ?? '', Uploaded: d.created_at ? String(d.created_at).slice(0, 10) : '',
      }));

      const monthlyRows = monthly.map(m => ({
        Month: m.month, 'Emp Code': codeOf(m.emp_id), Name: nameOf(m.emp_id),
        Present: m.present_days, 'Half Day': m.half_days, Leave: m.leave_days, 'Week Off': m.weekoff_days,
        Holiday: m.holiday_days, Absent: m.absent_days, 'Payable Days': m.payable_days,
        'Days In Month': m.days_in_month, 'Not Marked': m.unmarked_days, Final: m.finalized ? 'Yes' : 'No',
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employees), 'Employees');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), 'Monthly Attendance');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incentiveRows), 'Incentives');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(slipRows), 'Salary Slips');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(docRows), 'Documents');
      XLSX.writeFile(wb, `HR-backup-${istToday()}.xlsx`);

      const now = new Date().toISOString();
      try { localStorage.setItem(HR_LAST_KEY, now); } catch { /* storage unavailable */ }
      setHrLast(now);
      toast.success('HR backup downloaded');
    } catch (e) {
      toast.error((e as Error).message || 'Could not create the HR backup');
    } finally {
      setHrBusy(false);
    }
  };

  // ── Attendance: download ──────────────────────────────────────────────────
  const downloadAttendance = async (which: 'all' | 'old') => {
    if (attBusy) return;
    setAttBusy(which);
    try {
      const people = await loadPeople();
      const rows = await fetchAll<AttRow>((f, t) => {
        let q = supabase
          .from('attendance')
          .select('id,emp_id,date,status,in_time,out_time,check_in_at,check_out_at,remarks,source')
          .order('date', { ascending: true })
          .range(f, t);
        if (which === 'old') q = q.lt('date', cutoff);
        return q;
      });
      if (rows.length === 0) {
        toast.info(which === 'old' ? 'There are no old attendance records to archive.' : 'There is no attendance data.');
        return;
      }
      const { detail, summary } = attendanceSheets(rows, people);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Attendance');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Monthly Summary');
      const label = which === 'old' ? `archive-before-${cutoff}` : `all-${istToday()}`;
      XLSX.writeFile(wb, `Attendance-${label}.xlsx`);

      if (which === 'old') {
        setArchived({ count: rows.length, at: new Date().toISOString() });
        setTyped('');
        toast.success(`${rows.length} old records saved to Excel. Check the file, then confirm the clean-up below.`);
      } else {
        toast.success('Attendance Excel downloaded');
      }
    } catch (e) {
      toast.error((e as Error).message || 'Could not create the Excel file');
    } finally {
      setAttBusy(null);
    }
  };

  // ── Attendance: delete the archived (old) rows ───────────────────────────
  const deleteOld = async () => {
    if (!archived || attBusy) return;
    setAttBusy('delete');
    try {
      // Make sure nothing changed since the Excel file was made
      const { count, error: cErr } = await supabase
        .from('attendance').select('id', { count: 'exact', head: true }).lt('date', cutoff);
      if (cErr) throw new Error(cErr.message);
      if ((count ?? 0) !== archived.count) {
        setArchived(null);
        throw new Error('The old records changed since the Excel file was created. Download the archive again.');
      }
      // Save the monthly summaries of every month first. Nothing is removed if this fails.
      const snap = await supabase.rpc('snapshot_all_attendance_summaries');
      if (snap.error) throw new Error('The monthly summaries could not be saved, so nothing was removed: ' + snap.error.message);

      const { error, count: removed } = await supabase
        .from('attendance').delete({ count: 'exact' }).lt('date', cutoff);
      if (error) throw new Error(error.message);
      toast.success(`${removed ?? archived.count} old attendance records removed. The monthly summaries are saved.`);
      setArchived(null);
      setTyped('');
      await loadStats();
    } catch (e) {
      toast.error((e as Error).message || 'Could not remove the old records');
    } finally {
      setAttBusy(null);
    }
  };

  const cutoffLabel = new Date(`${cutoff}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <Archive className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold">HR & Attendance Backup</h2>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        These two backups are separate from the calling / CRM backup. Every backup gives you a complete Excel file you
        can save yourself. The optional Google Drive script can also do the same automatically every month.
      </p>

      {/* ── HR backup ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-blue-600" /> HR backup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Employees (with contact details and monthly salary), the saved monthly attendance summaries, incentives,
            all salary slips and the list of uploaded documents. The document files themselves stay in Supabase Storage.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={downloadHr} disabled={hrBusy} className="gap-2">
              {hrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download HR backup (Excel)
            </Button>
            <span className="text-xs text-slate-500">Last downloaded from this browser: {fmtStamp(hrLast)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Attendance ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4 text-blue-600" /> Attendance backup and archive
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Only the current and the previous month stay in the database, which keeps the free Supabase storage small.
            Older months are saved to Excel first and then removed.
          </p>

          <p className="text-xs text-slate-500">
            Saved monthly summaries (kept permanently): {stats ? `${stats.savedMonths} month(s)` : '…'}
          </p>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border p-3 dark:border-slate-800">
              <p className="text-[11px] font-semibold uppercase text-slate-500">In database</p>
              <p className="text-2xl font-bold tabular-nums">{stats ? stats.total : '…'}</p>
            </div>
            <div className="rounded-xl border p-3 dark:border-slate-800">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Kept (2 months)</p>
              <p className="text-2xl font-bold tabular-nums text-green-600">{stats ? stats.kept : '…'}</p>
            </div>
            <div className="rounded-xl border p-3 dark:border-slate-800">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Older, can be archived</p>
              <p className="text-2xl font-bold tabular-nums text-amber-600">{stats ? stats.old : '…'}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadAttendance('all')} disabled={!!attBusy}>
              {attBusy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download all attendance (Excel)
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
            <p className="text-sm font-semibold">Archive old attendance</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Records before {cutoffLabel}
              {stats?.oldest ? ` (oldest: ${stats.oldest})` : ''} will be removed from the database. The monthly summary
              of every month is saved permanently first, so salary slips can still be generated for those months.
              Slips that already exist are not affected.
            </p>

            <div className="space-y-2">
              <p className="text-xs font-semibold">Step 1 — Save the old records to Excel</p>
              <Button
                variant="outline" className="gap-2"
                onClick={() => downloadAttendance('old')}
                disabled={!!attBusy || !stats || stats.old === 0}
              >
                {attBusy === 'old' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {stats && stats.old === 0 ? 'Nothing to archive' : `Download ${stats?.old ?? ''} old records (Excel)`}
              </Button>
              {archived && (
                <p className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {archived.count} records saved to Excel at {fmtStamp(archived.at)}.
                  Keep that file safe.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold">Step 2 — Remove them from the database</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 sm:max-w-[240px]"
                  placeholder='Type DELETE to confirm'
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  disabled={!archived}
                />
                <Button
                  variant="outline" className="gap-2 text-red-600"
                  onClick={deleteOld}
                  disabled={!archived || typed !== 'DELETE' || !!attBusy}
                >
                  {attBusy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remove old records
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">This is only possible after Step 1 has been done in this session, and it cannot be undone.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HrBackupPage;
