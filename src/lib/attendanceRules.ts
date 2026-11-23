import { supabase } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Settings (one row in the attendance_settings table, editable by the admin)
// ─────────────────────────────────────────────────────────────────────────────
export interface AttendanceSettings {
  shift_start: string;      // 'HH:MM'
  shift_end: string;        // 'HH:MM'
  grace_minutes: number;    // late arrival / early leave counts from this many minutes
  halfday_before: string;   // check-out before this time turns the day into a Half Day
  confirm_before: string;   // ask "are you sure?" when checking out before this time
  streak_days: number;      // flagged days in a row before the admin is alerted
  weekly_off_rule: boolean; // Sunday weekly-off check
}

export const DEFAULT_SETTINGS: AttendanceSettings = {
  shift_start: '10:00',
  shift_end: '18:00',
  grace_minutes: 15,
  halfday_before: '15:00',
  confirm_before: '17:00',
  streak_days: 3,
  weekly_off_rule: true,
};

const hhmm = (v: unknown, fallback: string): string =>
  typeof v === 'string' && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : fallback;

export async function fetchAttendanceSettings(): Promise<AttendanceSettings> {
  const { data, error } = await supabase.from('attendance_settings').select('*').eq('id', 1).maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  const d = data as Record<string, unknown>;
  return {
    shift_start: hhmm(d.shift_start, DEFAULT_SETTINGS.shift_start),
    shift_end: hhmm(d.shift_end, DEFAULT_SETTINGS.shift_end),
    grace_minutes: Number(d.grace_minutes ?? DEFAULT_SETTINGS.grace_minutes),
    halfday_before: hhmm(d.halfday_before, DEFAULT_SETTINGS.halfday_before),
    confirm_before: hhmm(d.confirm_before, DEFAULT_SETTINGS.confirm_before),
    streak_days: Number(d.streak_days ?? DEFAULT_SETTINGS.streak_days),
    weekly_off_rule: d.weekly_off_rule !== false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Flags returned by the database (attendance_late_flags / attendance_weekoff_flags)
// ─────────────────────────────────────────────────────────────────────────────
export interface LateFlag {
  att_id: string;
  employee_id: string;
  att_date: string;
  day_status: string;
  in_t: string | null;
  out_t: string | null;
  late_minutes: number;
  early_minutes: number;
  flagged: boolean;
  streak: number;
  eligible: boolean;
  reviewed: boolean;
  remarks: string | null;
}

export interface WeekoffFlag {
  att_id: string;
  employee_id: string;
  att_date: string;
  saturday_status: string;
  monday_status: string;
  reviewed: boolean;
  remarks: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates and times (everything is India time, same as the database)
// ─────────────────────────────────────────────────────────────────────────────
const IST = 'Asia/Kolkata';

/** Today's date in India as YYYY-MM-DD */
export const istToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: IST });

/** The current time in India as HH:MM (24 hour) */
export const istNowHHMM = (): string =>
  new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST });

/** '17:00' -> '5:00 PM' */
export const clock12 = (value: string): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};

/** Adds (or subtracts) days from a YYYY-MM-DD date */
export const shiftDate = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** First day of the previous month: older daily attendance is archived */
export const firstOfPreviousMonth = (today: string = istToday()): string => {
  const [y, m] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Working hours. Same rule as the database: use the real timestamp when there is
// one, otherwise the typed HH:MM text. Nothing is counted when a time is missing
// or the out time is not after the in time.
// ─────────────────────────────────────────────────────────────────────────────
export interface TimedRow {
  check_in_at: string | null;
  check_out_at: string | null;
  in_time: string | null;
  out_time: string | null;
}

const TIME_TEXT = /^(?:[01]?\d|2[0-3]):[0-5]\d/;

const minutesOfDay = (iso: string | null, text: string | null): number | null => {
  let value: string | null = null;
  if (iso) {
    value = new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST });
  } else if (text && TIME_TEXT.test(text)) {
    value = text;
  }
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

export function workedMinutes(r: TimedRow): number | null {
  const a = minutesOfDay(r.check_in_at, r.in_time);
  const b = minutesOfDay(r.check_out_at, r.out_time);
  if (a === null || b === null || b <= a) return null;
  return b - a;
}

/** 495 -> '8h 15m'. Empty value -> '—' */
export const fmtMinutes = (m: number | null | undefined): string => {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—';
  return `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
};

/** Hours of a day, only for days that count as worked (present or half day) */
export const dayHours = (status: string, r: TimedRow): string =>
  status === 'present' || status === 'halfday' ? fmtMinutes(workedMinutes(r)) : '—';

/** Average minutes per worked day */
export const avgMinutes = (total: number | null | undefined, days: number | null | undefined): number | null =>
  total && days ? Math.round(total / days) : null;
