import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { LogIn, LogOut, Clock, CalendarCheck, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SETTINGS,
  clock12,
  fetchAttendanceSettings,
  fmtMinutes,
  istNowHHMM,
  istToday,
  shiftDate,
  workedMinutes,
  type AttendanceSettings,
  type LateFlag,
} from '@/lib/attendanceRules';

interface TodayRow {
  id: string;
  date: string;
  status: string;
  in_time: string | null;
  out_time: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  remarks: string | null;
}

const COLUMNS = 'id,date,status,in_time,out_time,check_in_at,check_out_at,remarks';
const IST = 'Asia/Kolkata';

const STATUS_LABEL: Record<string, string> = {
  present: 'Present', absent: 'Absent', halfday: 'Half Day', leave: 'Leave', weekoff: 'Week Off', holiday: 'Holiday',
};
const STATUS_STYLE: Record<string, string> = {
  present: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  halfday: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  absent: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  leave: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  weekoff: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  holiday: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
};

const fmtIso = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST })
    : '—';

const fmtTyped = (t: string | null): string => (t ? clock12(t) : '—');

const dayLabel = (d: string): string =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' });

/**
 * Check In / Check Out for the logged-in employee.
 * Used on the Employee Dashboard and on the My Attendance page.
 *
 *  - Check-out before the "confirm" time (5:00 PM) asks "are you sure?".
 *  - Check-out before the half-day time (3:00 PM) turns the day into a Half Day (done by the database).
 *  - A gentle reminder is shown the day after 3 working days in a row of late arrival / early leave.
 */
const AttendanceTodayCard: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { user } = useAuth();
  const userId = user?.id;

  const [now, setNow] = useState<Date>(() => new Date());
  const todayStr = useMemo(() => istToday(), [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const [settings, setSettings] = useState<AttendanceSettings>(DEFAULT_SETTINGS);
  const [today, setToday] = useState<TodayRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [missed, setMissed] = useState<string[]>([]);
  const [warnDate, setWarnDate] = useState<string | null>(null);
  const [acting, setActing] = useState<'in' | 'out' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let off = false;
    fetchAttendanceSettings().then(s => { if (!off) setSettings(s); });
    return () => { off = true; };
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const t = istToday();
    const [todayRes, missedRes, flagRes] = await Promise.all([
      supabase.from('attendance').select(COLUMNS).eq('emp_id', userId).eq('date', t).maybeSingle(),
      supabase
        .from('attendance')
        .select('date')
        .eq('emp_id', userId)
        .not('check_in_at', 'is', null)
        .is('check_out_at', null)
        .lt('date', t)
        .order('date', { ascending: false })
        .limit(5),
      supabase.rpc('attendance_late_flags', { p_from: shiftDate(t, -10), p_to: shiftDate(t, -1) }),
    ]);

    if (todayRes.error) toast.error(todayRes.error.message || "Could not load today's attendance");
    else setToday((todayRes.data as TodayRow) ?? null);

    if (!missedRes.error) {
      setMissed(((missedRes.data as Array<{ date: string }>) ?? []).map(r => r.date));
    }

    // Light reminder on the day after the 3rd late / early day in a row
    if (!flagRes.error) {
      const rows = ((flagRes.data as LateFlag[]) ?? []).slice().sort((a, b) => b.att_date.localeCompare(a.att_date));
      const latest = rows[0];
      setWarnDate(latest && latest.eligible && latest.att_date >= shiftDate(t, -3) ? latest.att_date : null);
    }
    setLoading(false);
  }, [userId]);

  // Load at the start, and again when the India date changes while the app stays open
  useEffect(() => { load(); }, [load, todayStr]);

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const checkIn = async () => {
    if (acting) return;
    setActing('in');
    const { error } = await supabase.rpc('attendance_check_in');
    setActing(null);
    if (error) toast.error(error.message || 'Could not check in');
    else toast.success('Checked in ✅');
    await refresh();
  };

  const doCheckOut = async () => {
    setConfirmOpen(false);
    if (acting) return;
    setActing('out');
    const { data, error } = await supabase.rpc('attendance_check_out');
    setActing(null);
    if (error) {
      toast.error(error.message || 'Could not check out');
    } else if ((data as { status?: string } | null)?.status === 'halfday') {
      toast.warning(`You checked out before ${clock12(settings.halfday_before)}, so today is marked as a Half Day.`);
    } else {
      toast.success('Checked out ✅');
    }
    await refresh();
  };

  const requestCheckOut = () => {
    if (acting) return;
    // Before the usual closing time, ask first. After it, check out straight away.
    if (istNowHHMM() < settings.confirm_before) setConfirmOpen(true);
    else void doCheckOut();
  };

  // ── What is shown ─────────────────────────────────────────────────────────
  const state: 'none' | 'open' | 'done' | 'admin' = !today
    ? 'none'
    : !today.check_in_at
      ? 'admin'
      : !today.check_out_at && (today.status === 'present' || today.status === 'halfday')
        ? 'open'
        : today.check_out_at
          ? 'done'
          : 'admin';
  const row = today as TodayRow; // only used where state !== 'none'

  const elapsed =
    state === 'open' && row.check_in_at
      ? Math.max(0, Math.floor((now.getTime() - new Date(row.check_in_at).getTime()) / 60000))
      : null;

  const clock = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST });
  const heading = new Date(`${todayStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const inLabel = (r: TodayRow) => (r.check_in_at ? fmtIso(r.check_in_at) : fmtTyped(r.in_time));
  const outLabel = (r: TodayRow) => (r.check_out_at ? fmtIso(r.check_out_at) : fmtTyped(r.out_time));

  const beforeHalfDay = istNowHHMM() < settings.halfday_before;

  return (
    <div className="space-y-3">
      {missed.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          You did not check out on {missed.map(dayLabel).join(', ')}. Please tell your admin so the correct out time can
          be added.
        </div>
      )}

      {warnDate && (
        <div className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Friendly reminder: you arrived late or left early on your last {settings.streak_days} working days. Please
            try to follow the shift timing ({clock12(settings.shift_start)} – {clock12(settings.shift_end)}). If this
            continues, your admin may mark a half day.
          </p>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base sm:text-lg">
            <span className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-blue-600" />
              Today's Attendance
            </span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
              <Clock className="h-4 w-4" />
              {clock}
            </span>
          </CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">{heading}</p>
        </CardHeader>

        <CardContent>
          {loading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : state === 'none' ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">You have not checked in yet</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Press Check In when you start work. The time is recorded automatically. Shift:{' '}
                  {clock12(settings.shift_start)} – {clock12(settings.shift_end)}.
                </p>
              </div>
              <Button
                onClick={checkIn}
                disabled={!!acting}
                className="h-12 w-full gap-2 bg-green-600 px-6 text-base text-white hover:bg-green-700 sm:w-auto"
              >
                {acting === 'in' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                Check In
              </Button>
            </div>
          ) : state === 'open' ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLE[row.status])}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </span>
                <p className="text-sm">
                  Checked in at <span className="font-semibold">{inLabel(row)}</span>
                  {elapsed !== null && (
                    <>
                      {'  •  '}Working time so far: <span className="font-semibold">{fmtMinutes(elapsed)}</span>
                    </>
                  )}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Press Check Out when you finish work.</p>
              </div>
              <Button
                onClick={requestCheckOut}
                disabled={!!acting}
                className="h-12 w-full gap-2 bg-orange-600 px-6 text-base text-white hover:bg-orange-700 sm:w-auto"
              >
                {acting === 'out' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                Check Out
              </Button>
            </div>
          ) : state === 'done' ? (
            <div className="space-y-1">
              <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLE[row.status])}>
                {STATUS_LABEL[row.status] ?? row.status}
              </span>
              <p className="text-sm">
                Checked in <span className="font-semibold">{inLabel(row)}</span>
                {'  •  '}Checked out <span className="font-semibold">{outLabel(row)}</span>
                {'  •  '}Worked <span className="font-semibold">{fmtMinutes(workedMinutes(row))}</span>
              </p>
              {row.status === 'halfday' ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Checked out before {clock12(settings.halfday_before)}, so today is counted as a Half Day.
                </p>
              ) : (
                <p className="text-sm text-green-700 dark:text-green-400">Your day is complete. ✅</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLE[row.status])}>
                {STATUS_LABEL[row.status] ?? row.status}
              </span>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This attendance was marked by the admin.{row.remarks ? ` Remarks: ${row.remarks}` : ''}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Check out now?</DialogTitle>
            <DialogDescription>
              It is {clock12(istNowHHMM())}, before the usual closing time of {clock12(settings.confirm_before)}. Are you
              sure you want to check out?
              {beforeHalfDay && (
                <>
                  {' '}
                  <strong>
                    Checking out before {clock12(settings.halfday_before)} will mark today as a Half Day.
                  </strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              No, stay checked in
            </Button>
            <Button className="bg-orange-600 text-white hover:bg-orange-700" onClick={doCheckOut}>
              Yes, check out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AttendanceTodayCard;
