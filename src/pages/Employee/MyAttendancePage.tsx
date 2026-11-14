import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { LogIn, LogOut, Clock, CalendarCheck, Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
}

const ROW_COLUMNS =
  'id,date,status,in_time,out_time,check_in_at,check_out_at,remarks,source';

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
// Helpers  (all dates are India dates, same as the database)
// ─────────────────────────────────────────────────────────────────────────────
const IST = 'Asia/Kolkata';

/** Today's date in India as YYYY-MM-DD */
const istToday = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: IST });

const monthOf = (dateStr: string): string => dateStr.slice(0, 7);

const monthLabel = (m: string): string =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

/** Last 12 months (including this one) as YYYY-MM, newest first */
const lastTwelveMonths = (today: string): string[] => {
  const [y, m] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
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
    ? new Date(iso).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: IST,
      })
    : '—';

/** 'HH:MM' (old/imported rows) -> '10:30 AM' */
const fmt24 = (t: string | null): string => {
  if (!t) return '—';
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};

const inTimeOf = (r: AttendanceRow): string =>
  r.check_in_at ? fmtIsoTime(r.check_in_at) : fmt24(r.in_time);

const outTimeOf = (r: AttendanceRow): string =>
  r.check_out_at ? fmtIsoTime(r.check_out_at) : fmt24(r.out_time);

const workedOf = (r: AttendanceRow): string => {
  if (!r.check_in_at || !r.check_out_at) return '—';
  const mins = Math.max(
    0,
    Math.round((new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 60000)
  );
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};

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
      'rounded-xl border p-3 sm:p-4 bg-white dark:bg-slate-900 dark:border-slate-800',
      highlight && 'border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-800'
    )}
  >
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {label}
    </p>
    <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone)}>{value}</p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
const MyAttendancePage: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const [now, setNow] = useState<Date>(() => new Date());
  const todayStr = useMemo(() => istToday(), [now]); // eslint-disable-line react-hooks/exhaustive-deps
  const months = useMemo(() => lastTwelveMonths(todayStr), [todayStr]);

  const [month, setMonth] = useState<string>(() => monthOf(istToday()));
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [loadingToday, setLoadingToday] = useState(true);
  const [acting, setActing] = useState<'in' | 'out' | null>(null);

  const monthReq = useRef(0); // ignore out-of-date responses when the month changes quickly

  // Live clock (once every 30 s is plenty)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const loadToday = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('attendance')
      .select(ROW_COLUMNS)
      .eq('emp_id', userId)
      .eq('date', istToday())
      .maybeSingle();
    if (error) {
      toast.error(error.message || 'Aaj ki attendance load nahi ho paayi');
    } else {
      setToday((data as AttendanceRow) ?? null);
    }
    setLoadingToday(false);
  }, [userId]);

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
          toast.error(e?.message || 'Attendance load nahi ho paayi');
        }
      } finally {
        if (req === monthReq.current) setLoadingMonth(false);
      }
    },
    [userId]
  );

  // Reload "today" at start and again if the India date rolls over while the app is open
  useEffect(() => {
    loadToday();
  }, [loadToday, todayStr]);

  useEffect(() => {
    loadMonth(month);
  }, [loadMonth, month]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadToday(), loadMonth(month)]);
  }, [loadToday, loadMonth, month]);

  const handleCheckIn = async () => {
    if (acting) return;
    setActing('in');
    const { error } = await supabase.rpc('attendance_check_in');
    setActing(null);
    if (error) {
      toast.error(error.message || 'Check-in nahi ho paaya');
    } else {
      toast.success('Check-in ho gaya ✅');
    }
    await refreshAll();
  };

  const handleCheckOut = async () => {
    if (acting) return;
    setActing('out');
    const { error } = await supabase.rpc('attendance_check_out');
    setActing(null);
    if (error) {
      toast.error(error.message || 'Check-out nahi ho paaya');
    } else {
      toast.success('Check-out ho gaya ✅');
    }
    await refreshAll();
  };

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

  const clock = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: IST,
  });
  const dateHeading = new Date(`${todayStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // ── Today card state ──────────────────────────────────────────────────────
  type TodayState = 'none' | 'open' | 'done' | 'admin';
  const todayState: TodayState = !today
    ? 'none'
    : !today.check_in_at
      ? 'admin'
      : !today.check_out_at && (today.status === 'present' || today.status === 'halfday')
        ? 'open'
        : today.check_out_at
          ? 'done'
          : 'admin';
  const td = today as AttendanceRow; // only read inside branches where todayState !== 'none'

  const bonusEligible = month === monthOf(todayStr) && num(summary?.present_days) >= 25;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      {/* ── Today ─────────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base sm:text-lg">
            <span className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-blue-600" />
              Aaj ki Attendance
            </span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
              <Clock className="h-4 w-4" />
              {clock}
            </span>
          </CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">{dateHeading}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {loadingToday ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : todayState === 'none' ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Aaj ki attendance abhi mark nahi hui</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Kaam shuru karte hi Check In dabayein. Time server se apne aap lagega.
                </p>
              </div>
              <Button
                onClick={handleCheckIn}
                disabled={!!acting}
                className="h-12 w-full gap-2 bg-green-600 px-6 text-base text-white hover:bg-green-700 sm:w-auto"
              >
                {acting === 'in' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                Check In
              </Button>
            </div>
          ) : todayState === 'open' ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <StatusBadge status={td.status} />
                <p className="text-sm">
                  Check-in: <span className="font-semibold">{inTimeOf(td)}</span>
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Jaate waqt Check Out zaroor dabayein.
                </p>
              </div>
              <Button
                onClick={handleCheckOut}
                disabled={!!acting}
                className="h-12 w-full gap-2 bg-orange-600 px-6 text-base text-white hover:bg-orange-700 sm:w-auto"
              >
                {acting === 'out' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                Check Out
              </Button>
            </div>
          ) : todayState === 'done' ? (
            <div className="space-y-1">
              <StatusBadge status={td.status} />
              <p className="text-sm">
                Check-in: <span className="font-semibold">{inTimeOf(td)}</span>
                {'  •  '}
                Check-out: <span className="font-semibold">{outTimeOf(td)}</span>
                {'  •  '}
                Kaam ke ghante: <span className="font-semibold">{workedOf(td)}</span>
              </p>
              <p className="text-sm text-green-700 dark:text-green-400">Aaj ka din poora hua. ✅</p>
            </div>
          ) : (
            <div className="space-y-1">
              <StatusBadge status={td.status} />
              {todayState === 'admin' && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Ye attendance admin ne mark ki hai.
                  {td.remarks ? ` Remarks: ${td.remarks}` : ''}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Month picker + summary ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Mahine ka Summary</h2>
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
          {Array.from({ length: 8 }).map((_, i) => (
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
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Payable Days = Present + Leave + Week Off + Holiday + (Half Day × 0.5)
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
          <CardTitle className="text-base">Meri Attendance — {monthLabel(month)}</CardTitle>
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
                  <TableHead>Hours</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                      {loadingMonth ? 'Load ho raha hai…' : 'Is mahine koi attendance record nahi hai.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-medium">{dayLabel(r.date)}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="whitespace-nowrap">{inTimeOf(r)}</TableCell>
                      <TableCell className="whitespace-nowrap">{outTimeOf(r)}</TableCell>
                      <TableCell className="whitespace-nowrap">{workedOf(r)}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-slate-500">{r.remarks || '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MyAttendancePage;
