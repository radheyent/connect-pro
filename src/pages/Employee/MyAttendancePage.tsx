import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import AttendanceTodayCard from '@/components/attendance/AttendanceTodayCard';
import { avgMinutes, clock12, dayHours, fmtMinutes, istToday } from '@/lib/attendanceRules';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Status = 'present' | 'absent' | 'halfday' | 'leave' | 'weekoff' | 'holiday';

interface AttendanceRow {
  id: string;
  date: string; // YYYY-MM-DD
  status: Status;
  in_time: string | null;
  out_time: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  remarks: string | null;
  source: string | null;
}

interface MonthSummary {
  present_days: number;
  absent_days: number;
  half_days: number;
  leave_days: number;
  weekoff_days: number;
  holiday_days: number;
  payable_days: number | string;
  days_in_month: number;
  marked_days: number;
  unmarked_days: number;
  worked_minutes: number;
  timed_days: number;
}

interface HistoryRow {
  month: string;
  present_days: number;
  half_days: number;
  leave_days: number;
  weekoff_days: number;
  holiday_days: number;
  absent_days: number;
  payable_days: number | string;
  days_in_month: number;
  worked_minutes: number | null;
  timed_days: number | null;
}

const ROW_COLUMNS = 'id,date,status,in_time,out_time,check_in_at,check_out_at,remarks,source';

const STATUS_META: Record<Status, { label: string; badge: string; cell: string }> = {
  present: {
    label: 'Present',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    cell: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  },
  absent: {
    label: 'Absent',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    cell: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  },
  halfday: {
    label: 'Half Day',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    cell: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  leave: {
    label: 'Leave',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    cell: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  },
  weekoff: {
    label: 'Week Off',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    cell: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  },
  holiday: {
    label: 'Holiday',
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    cell: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (all dates are India dates, same as the database)
// ─────────────────────────────────────────────────────────────────────────────
const IST = 'Asia/Kolkata';

const monthOf = (dateStr: string): string => dateStr.slice(0, 7);

const monthLabel = (m: string): string =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** Only the current and the previous month are kept in the database (YYYY-MM, newest first) */
const keptMonths = (today: string): string[] => {
  const [y, m] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < 2; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

const nextMonthStart = (m: string): string => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
};

const fmtIsoTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST })
    : '—';

const inTimeOf = (r: AttendanceRow): string =>
  r.check_in_at ? fmtIsoTime(r.check_in_at) : r.in_time ? clock12(r.in_time) : '—';

const outTimeOf = (r: AttendanceRow): string =>
  r.check_out_at ? fmtIsoTime(r.check_out_at) : r.out_time ? clock12(r.out_time) : '—';

const dayLabel = (dateStr: string): string =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    weekday: 'short',
  });

const num = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

const fmtDays = (v: number | string | null | undefined): string => {
  const n = num(v);
  return n % 1 === 0 ? String(n) : n.toFixed(1);
};

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational pieces (defined OUTSIDE the page so they never remount)
// ─────────────────────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: Status }> = ({ status }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
      STATUS_META[status]?.badge
    )}
  >
    {STATUS_META[status]?.label ?? status}
  </span>
);

const StatCard: React.FC<{
  label: string;
  value: string;
  tone?: string;
  highlight?: boolean;
}> = ({ label, value, tone, highlight }) => (
  <div
    className={cn(
      'rounded-xl border bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4',
      highlight && 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40'
    )}
  >
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
    <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone)}>{value}</p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
const MyAttendancePage: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const todayStr = istToday();
  const months = useMemo(() => keptMonths(todayStr), [todayStr]);

  const [month, setMonth] = useState<string>(() => monthOf(istToday()));
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(true);

  const monthReq = useRef(0); // ignore out-of-date responses when the month changes quickly

  const loadMonth = useCallback(
    async (m: string) => {
      if (!userId) return;
      const req = ++monthReq.current;
      setLoadingMonth(true);
      try {
        const [recRes, sumRes] = await Promise.all([
          supabase
            .from('attendance')
            .select(ROW_COLUMNS)
            .eq('emp_id', userId)
            .gte('date', `${m}-01`)
            .lt('date', nextMonthStart(m))
            .order('date', { ascending: false }),
          supabase.rpc('attendance_month_summary', { p_month: m }),
        ]);
        if (req !== monthReq.current) return;
        if (recRes.error) throw recRes.error;
        if (sumRes.error) throw sumRes.error;
        setRows((recRes.data as AttendanceRow[]) ?? []);
        setSummary(((sumRes.data as MonthSummary[]) ?? [])[0] ?? null);
      } catch (e: any) {
        if (req === monthReq.current) {
          toast.error(e?.message || 'Could not load attendance');
        }
      } finally {
        if (req === monthReq.current) setLoadingMonth(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    loadMonth(month);
  }, [loadMonth, month]);

  // Earlier months come from the permanent monthly summary (the daily rows are archived)
  useEffect(() => {
    if (!userId) return;
    let off = false;
    (async () => {
      const { data } = await supabase
        .from('attendance_monthly_summary')
        .select('month,present_days,half_days,leave_days,weekoff_days,holiday_days,absent_days,payable_days,days_in_month,worked_minutes,timed_days')
        .eq('emp_id', userId)
        .order('month', { ascending: false })
        .limit(12);
      if (!off) setHistory((data as HistoryRow[]) ?? []);
    })();
    return () => { off = true; };
  }, [userId]);

  // ── Calendar cells ────────────────────────────────────────────────────────
  const calendar = useMemo(() => {
    const [y, mo] = month.split('-').map(Number);
    const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(); // 0 = Sunday
    const total = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const byDate = new Map<string, AttendanceRow>(rows.map(r => [r.date, r] as [string, AttendanceRow]));
    const cells: Array<{ day: number; date: string; row?: AttendanceRow } | null> = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, date, row: byDate.get(date) });
    }
    return cells;
  }, [month, rows]);

  const bonusEligible = month === monthOf(todayStr) && num(summary?.present_days) >= 25;
  const totalMinutes = summary?.worked_minutes ?? 0;
  const avg = avgMinutes(totalMinutes, summary?.timed_days);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      {/* ── Check in / out (same card as on the dashboard) ────────────────── */}
      <AttendanceTodayCard onChanged={() => loadMonth(month)} />

      {/* ── Month picker + summary ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Monthly Summary</h2>
        <div className="flex items-center gap-2">
          {bonusEligible && (
            <Badge className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <Star className="h-3 w-3" /> Bonus Eligible
            </Badge>
          )}
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            aria-label="Month"
          >
            {months.map(m => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadingMonth && !summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Present" value={fmtDays(summary?.present_days)} tone="text-green-600" />
          <StatCard label="Half Day" value={fmtDays(summary?.half_days)} tone="text-amber-600" />
          <StatCard label="Leave" value={fmtDays(summary?.leave_days)} tone="text-blue-600" />
          <StatCard label="Week Off" value={fmtDays(summary?.weekoff_days)} tone="text-purple-600" />
          <StatCard label="Holiday" value={fmtDays(summary?.holiday_days)} tone="text-cyan-600" />
          <StatCard label="Absent" value={fmtDays(summary?.absent_days)} tone="text-red-600" />
          <StatCard label="Not Marked" value={fmtDays(summary?.unmarked_days)} tone="text-slate-500" />
          <StatCard
            label={`Payable Days / ${summary?.days_in_month ?? '—'}`}
            value={fmtDays(summary?.payable_days)}
            tone="text-blue-700 dark:text-blue-300"
            highlight
          />
          <StatCard label="Total Working Hours" value={fmtMinutes(totalMinutes)} tone="text-slate-800 dark:text-slate-100" />
          <StatCard label="Average Per Day" value={fmtMinutes(avg)} tone="text-slate-800 dark:text-slate-100" />
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Payable Days = Present + Leave + Week Off + Holiday + (Half Day × 0.5). Working hours are counted for Present
        and Half Day days that have both an in time and an out time.
      </p>

      {/* ── Calendar ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{monthLabel(month)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendar.map((c, i) =>
              c === null ? (
                <div key={`b${i}`} />
              ) : (
                <div
                  key={c.date}
                  title={c.row ? STATUS_META[c.row.status]?.label : undefined}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center rounded-lg text-sm font-semibold',
                    c.row
                      ? STATUS_META[c.row.status]?.cell
                      : c.date > todayStr
                        ? 'text-slate-300 dark:text-slate-700'
                        : 'border border-dashed border-slate-300 text-slate-400 dark:border-slate-700',
                    c.date === todayStr && 'ring-2 ring-blue-500'
                  )}
                >
                  {c.day}
                </div>
              )
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(STATUS_META) as Status[]).map(s => (
              <StatusBadge key={s} status={s} />
            ))}
            <span className="inline-flex items-center rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs text-slate-500 dark:border-slate-700">
              Not marked
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Records ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">My Attendance — {monthLabel(month)}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Working hours</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                      {loadingMonth ? 'Loading…' : 'There are no attendance records for this month.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-medium">{dayLabel(r.date)}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="whitespace-nowrap">{inTimeOf(r)}</TableCell>
                      <TableCell className="whitespace-nowrap">{outTimeOf(r)}</TableCell>
                      <TableCell className="whitespace-nowrap">{dayHours(r.status, r)}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-slate-500">{r.remarks || '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Earlier months (saved monthly summary) ────────────────────────── */}
      {history.filter(h => !months.includes(h.month)).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Earlier months</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-center">Present</TableHead>
                    <TableHead className="text-center">Half Day</TableHead>
                    <TableHead className="text-center">Leave</TableHead>
                    <TableHead className="text-center">Week Off</TableHead>
                    <TableHead className="text-center">Holiday</TableHead>
                    <TableHead className="text-center">Absent</TableHead>
                    <TableHead className="text-center">Hours</TableHead>
                    <TableHead className="text-right">Payable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history
                    .filter(h => !months.includes(h.month))
                    .map(h => (
                      <TableRow key={h.month}>
                        <TableCell className="whitespace-nowrap font-medium">{monthLabel(h.month)}</TableCell>
                        <TableCell className="text-center">{h.present_days}</TableCell>
                        <TableCell className="text-center">{h.half_days}</TableCell>
                        <TableCell className="text-center">{h.leave_days}</TableCell>
                        <TableCell className="text-center">{h.weekoff_days}</TableCell>
                        <TableCell className="text-center">{h.holiday_days}</TableCell>
                        <TableCell className="text-center">{h.absent_days}</TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          {h.timed_days ? fmtMinutes(h.worked_minutes) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-bold tabular-nums">
                          {fmtDays(h.payable_days)} <span className="font-normal text-slate-500">/ {h.days_in_month}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MyAttendancePage;
