import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  CalendarCheck, RefreshCw, Pencil, Trash2, Plus, Download, Loader2, Users, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ═════════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════════
type Status = 'present' | 'absent' | 'halfday' | 'leave' | 'weekoff' | 'holiday';

interface Emp {
  id: string;
  name: string | null;
  employee_code: string | null;
  designation: string | null;
  joining_date: string | null;
  is_active: boolean | null;
}

interface AttRow {
  id: string;
  emp_id: string;
  date: string; // YYYY-MM-DD
  status: Status;
  in_time: string | null;
  out_time: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  remarks: string | null;
  source: string | null;
}

interface SummaryRow {
  employee_id: string;
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

interface DialogState {
  empId?: string;
  date?: string;
  row?: AttRow;
}

interface BulkLine {
  status: Status;
  inT: string;
  outT: string;
  remarks: string;
}

type Tab = 'live' | 'mark' | 'fix' | 'records' | 'summary';

// ═════════════════════════════════════════════════════════════════════════════
// Constants + helpers  (all dates are India dates, same as the database)
// ═════════════════════════════════════════════════════════════════════════════
const IST = 'Asia/Kolkata';
const COLS = 'id,emp_id,date,status,in_time,out_time,check_in_at,check_out_at,remarks,source';

const STATUS_META: Record<Status, { label: string; badge: string }> = {
  present: { label: 'Present', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  absent:  { label: 'Absent',  badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  halfday: { label: 'Half Day', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  leave:   { label: 'Leave',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  weekoff: { label: 'Week Off', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  holiday: { label: 'Holiday', badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' },
};
const STATUSES = Object.keys(STATUS_META) as Status[];

const SELECT_CLS =
  'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900';
const INPUT_CLS = SELECT_CLS;
const CELL_INPUT_CLS =
  'h-8 rounded-md border border-slate-300 bg-white px-2 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900';

const istToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: IST });

const monthLabel = (m: string): string =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** Only the current and the previous month are kept in the database */
const keptMonths = (today: string): string[] => {
  const [y, m] = today.split('-').map(Number);
  return [0, 1].map(i => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
};

const monthRange = (m: string): { start: string; end: string } => {
  const [y, mo] = m.split('-').map(Number);
  const end = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  return { start: `${m}-01`, end };
};

const fmtIso = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST })
    : '—';

const fmt24 = (t: string | null): string => {
  if (!t) return '—';
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};

const inOf = (r: AttRow): string => (r.check_in_at ? fmtIso(r.check_in_at) : fmt24(r.in_time));
const outOf = (r: AttRow): string => (r.check_out_at ? fmtIso(r.check_out_at) : fmt24(r.out_time));

const workedOf = (r: AttRow): string => {
  if (!r.check_in_at || !r.check_out_at) return '—';
  const mins = Math.max(0, Math.round((new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};

/** ISO timestamp -> 'HH:MM' in India time (for <input type="time">) */
const isoToHHMM = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST })
    : '';

const timeInputOf = (r?: AttRow): { inT: string; outT: string } => {
  if (!r) return { inT: '', outT: '' };
  const pick = (iso: string | null, txt: string | null): string =>
    iso ? isoToHHMM(iso) : /^(\d{1,2}):(\d{2})/.test(txt ?? '') ? (txt as string).slice(0, 5).padStart(5, '0') : '';
  return { inT: pick(r.check_in_at, r.in_time), outT: pick(r.check_out_at, r.out_time) };
};

const hhmmToIso = (date: string, hhmm: string): string | null =>
  hhmm ? new Date(`${date}T${hhmm}:00+05:30`).toISOString() : null;

const dayLabel = (d: string): string =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' });

const shortDay = (d: string): string =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

const n = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;
const fmtDays = (v: number | string | null | undefined): string => {
  const x = n(v);
  return x % 1 === 0 ? String(x) : x.toFixed(1);
};

const empName = (e?: Emp): string => e?.name || e?.employee_code || 'Unknown';
const isActive = (e: Emp): boolean => e.is_active !== false;
const isTimed = (s: Status): boolean => s === 'present' || s === 'halfday';

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

const csvCell = (v: unknown): string => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadCsv = (fileName: string, rows: Array<Array<string | number>>) => {
  const csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'); // BOM so Excel reads UTF-8 names
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/** Dates in the month (up to today, from the joining date) that have no record */
const unmarkedDatesOf = (emp: Emp, month: string, today: string, marked: Set<string>): string[] => {
  const { start, end } = monthRange(month);
  const first = emp.joining_date && emp.joining_date > start ? emp.joining_date : start;
  const out: string[] = [];
  const cur = new Date(`${first}T00:00:00Z`);
  const endD = new Date(`${end}T00:00:00Z`);
  while (cur < endD) {
    const ds = cur.toISOString().slice(0, 10);
    if (ds > today) break;
    if (!marked.has(ds)) out.push(ds);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
};

// ═════════════════════════════════════════════════════════════════════════════
// Small presentational pieces (defined OUTSIDE the page, so they never remount)
// ═════════════════════════════════════════════════════════════════════════════
const StatusBadge: React.FC<{ status: Status }> = ({ status }) => (
  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_META[status]?.badge)}>
    {STATUS_META[status]?.label ?? status}
  </span>
);

const Stat: React.FC<{ label: string; value: number | string; tone?: string }> = ({ label, value, tone }) => (
  <div className="rounded-xl border bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
    <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone)}>{value}</p>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
    {children}
  </label>
);

const UnmarkedChips: React.FC<{ dates: string[]; onPick: (date: string) => void }> = ({ dates, onPick }) => {
  const [all, setAll] = useState(false);
  if (dates.length === 0) return <span className="text-slate-400">—</span>;
  const shown = all ? dates : dates.slice(0, 6);
  return (
    <div className="flex max-w-[260px] flex-wrap gap-1">
      {shown.map(d => (
        <button
          key={d}
          type="button"
          onClick={() => onPick(d)}
          className="rounded-full border border-dashed border-red-300 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
          title="Mark attendance for this day"
        >
          {shortDay(d)}
        </button>
      ))}
      {dates.length > 6 && (
        <button type="button" onClick={() => setAll(v => !v)} className="text-[11px] text-blue-600 underline">
          {all ? 'show less' : `+${dates.length - 6} more`}
        </button>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// Single mark / edit dialog
// ═════════════════════════════════════════════════════════════════════════════
const RecordDialog: React.FC<{
  state: DialogState | null;
  employees: Emp[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ state, employees, onClose, onSaved }) => {
  const { user } = useAuth();
  const editing = !!state?.row;

  const [empId, setEmpId] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<Status>('present');
  const [inT, setInT] = useState('');
  const [outT, setOutT] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  // Fill the form each time the dialog opens
  useEffect(() => {
    if (!state) return;
    const t = timeInputOf(state.row);
    setEmpId(state.row?.emp_id ?? state.empId ?? '');
    setDate(state.row?.date ?? state.date ?? istToday());
    setStatus(state.row?.status ?? 'present');
    setInT(t.inT);
    setOutT(t.outT);
    setRemarks(state.row?.remarks ?? '');
  }, [state]);

  const timed = isTimed(status);
  const options = useMemo(
    () => employees.filter(e => isActive(e) || e.id === empId),
    [employees, empId]
  );

  const save = async () => {
    if (!user) return;
    if (!empId) { toast.error('Select an employee'); return; }
    if (!date) { toast.error('Select a date'); return; }
    if (timed && inT && outT && outT <= inT) {
      toast.error('Out time must be later than in time');
      return;
    }
    setSaving(true);
    try {
      const inVal = timed && inT ? inT : null;
      const outVal = timed && outT ? outT : null;

      if (editing && state?.row) {
        const hadSelf = !!state.row.check_in_at;
        const patch: Record<string, unknown> = {
          status,
          in_time: inVal,
          out_time: outVal,
          remarks: remarks.trim() || null,
          marked_by: user.id,
        };
        // Keep the real timestamps in step with the edited times
        if (hadSelf || state.row.check_out_at) {
          patch.check_in_at = inVal ? hhmmToIso(date, inVal) : null;
          patch.check_out_at = outVal ? hhmmToIso(date, outVal) : null;
        }
        const { error } = await supabase.from('attendance').update(patch).eq('id', state.row.id);
        if (error) throw new Error(error.message);
        toast.success('Attendance updated');
      } else {
        const { error } = await supabase.from('attendance').insert({
          emp_id: empId,
          date,
          status,
          in_time: inVal,
          out_time: outVal,
          remarks: remarks.trim() || null,
          source: 'admin',
          marked_by: user.id,
        });
        if (error) {
          if ((error as { code?: string }).code === '23505') {
            throw new Error('A record already exists for this date. Use the Records tab to edit it.');
          }
          throw new Error(error.message);
        }
        toast.success('Attendance marked');
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={v => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit attendance' : 'Mark attendance'}</DialogTitle>
          <DialogDescription>
            {editing ? "Change this day's record." : 'Mark attendance for any employee on any date.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Employee">
            <select className={SELECT_CLS} value={empId} onChange={e => setEmpId(e.target.value)} disabled={editing}>
              <option value="">— Select —</option>
              {options.map(e => (
                <option key={e.id} value={e.id}>
                  {empName(e)}{e.employee_code ? ` (${e.employee_code})` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Date">
            <input type="date" className={INPUT_CLS} value={date} onChange={e => setDate(e.target.value)} disabled={editing} />
          </Field>

          <Field label="Status">
            <select className={SELECT_CLS} value={status} onChange={e => setStatus(e.target.value as Status)}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
          </Field>

          {timed && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="In time (optional)">
                <input type="time" className={INPUT_CLS} value={inT} onChange={e => setInT(e.target.value)} />
              </Field>
              <Field label="Out time (optional)">
                <input type="time" className={INPUT_CLS} value={outT} onChange={e => setOutT(e.target.value)} />
              </Field>
            </div>
          )}

          <Field label="Remarks">
            <textarea
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Optional"
            />
          </Field>

          <Button className="w-full gap-2" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Update' : 'Mark'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1 — Live (today)
// ═════════════════════════════════════════════════════════════════════════════
const LiveTab: React.FC<{
  employees: Emp[];
  refreshKey: number;
  onOpen: (s: DialogState) => void;
}> = ({ employees, refreshKey, onOpen }) => {
  const [rows, setRows] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState(istToday());

  const load = useCallback(async () => {
    const t = istToday();
    setToday(t);
    const { data, error } = await supabase.from('attendance').select(COLS).eq('date', t);
    if (error) toast.error(error.message || "Could not load today's attendance");
    else setRows((data as AttRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Auto-refresh every minute
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const team = useMemo(
    () => employees.filter(e => isActive(e) && (!e.joining_date || e.joining_date <= today)),
    [employees, today]
  );
  const byEmp = useMemo(() => new Map(rows.map(r => [r.emp_id, r] as [string, AttRow])), [rows]);

  const count = (s: Status) => team.filter(e => byEmp.get(e.id)?.status === s).length;
  const notMarked = team.filter(e => !byEmp.has(e.id)).length;
  const workingNow = team.filter(e => {
    const r = byEmp.get(e.id);
    return !!r && !!r.check_in_at && !r.check_out_at && isTimed(r.status);
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {new Date(`${today}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <Button size="sm" variant="outline" className="gap-1" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Team" value={team.length} />
        <Stat label="Present" value={count('present')} tone="text-green-600" />
        <Stat label="Working now" value={workingNow} tone="text-blue-600" />
        <Stat label="Half Day" value={count('halfday')} tone="text-amber-600" />
        <Stat label="Leave" value={count('leave')} tone="text-blue-600" />
        <Stat label="Off / Holiday" value={count('weekoff') + count('holiday')} tone="text-purple-600" />
        <Stat label="Absent" value={count('absent')} tone="text-red-600" />
        <Stat label="Not marked" value={notMarked} tone="text-slate-500" />
      </div>

      <Card>
        <CardContent className="px-0 pt-4 sm:px-6">
          {loading ? (
            <div className="space-y-2 px-4">
              {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>In</TableHead>
                    <TableHead>Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-slate-500">No active employees found.</TableCell>
                    </TableRow>
                  ) : (
                    team.map(e => {
                      const r = byEmp.get(e.id);
                      return (
                        <TableRow key={e.id}>
                          <TableCell>
                            <p className="font-medium">{empName(e)}</p>
                            <p className="text-xs text-slate-500">{e.employee_code || '—'}{e.designation ? ` · ${e.designation}` : ''}</p>
                          </TableCell>
                          <TableCell>
                            {r ? <StatusBadge status={r.status} /> : (
                              <span className="inline-flex rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs text-slate-500 dark:border-slate-700">Not marked</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{r ? inOf(r) : '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">{r ? outOf(r) : '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">{r ? workedOf(r) : '—'}</TableCell>
                          <TableCell className="text-right">
                            {r ? (
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => onOpen({ row: r })}>
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </Button>
                            ) : (
                              <Button size="sm" className="gap-1" onClick={() => onOpen({ empId: e.id, date: today })}>
                                <Plus className="h-3.5 w-3.5" /> Mark
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2 — Bulk mark (status and time per line, saved in one action)
// ═════════════════════════════════════════════════════════════════════════════
const BulkTab: React.FC<{
  employees: Emp[];
  refreshKey: number;
  onSaved: () => void;
  onSingle: () => void;
}> = ({ employees, refreshKey, onSaved, onSingle }) => {
  const { user } = useAuth();
  const [date, setDate] = useState(istToday());
  const [defStatus, setDefStatus] = useState<Status>('present');
  const [defIn, setDefIn] = useState('');
  const [defOut, setDefOut] = useState('');
  const [lines, setLines] = useState<Record<string, BulkLine>>({});
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const team = useMemo(
    () => employees.filter(e => isActive(e) && (!e.joining_date || e.joining_date <= date)),
    [employees, date]
  );

  // Who is already marked on the chosen date? (they cannot be overwritten here)
  useEffect(() => {
    let off = false;
    (async () => {
      if (!date) return;
      setLoading(true);
      const { data, error } = await supabase.from('attendance').select('emp_id').eq('date', date);
      if (off) return;
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      const ex = new Set<string>(((data as Array<{ emp_id: string }>) ?? []).map(r => r.emp_id));
      setExisting(ex);
      setPicked(new Set(team.filter(e => !ex.has(e.id)).map(e => e.id)));
    })();
    return () => { off = true; };
  }, [date, team, refreshKey]);

  const lineOf = (id: string): BulkLine =>
    lines[id] ?? { status: defStatus, inT: defIn, outT: defOut, remarks: '' };

  const setLine = (id: string, patch: Partial<BulkLine>) =>
    setLines(prev => ({ ...prev, [id]: { ...lineOf(id), ...prev[id], ...patch } }));

  const applyToAll = () => {
    setLines(prev => {
      const next = { ...prev };
      team.forEach(e => {
        if (existing.has(e.id)) return;
        next[e.id] = {
          status: defStatus,
          inT: isTimed(defStatus) ? defIn : '',
          outT: isTimed(defStatus) ? defOut : '',
          remarks: prev[e.id]?.remarks ?? '',
        };
      });
      return next;
    });
  };

  const toggle = (id: string) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectable = team.filter(e => !existing.has(e.id));
  const allChecked = selectable.length > 0 && selectable.every(e => picked.has(e.id));

  const submit = async () => {
    if (!user) return;
    const chosen = selectable.filter(e => picked.has(e.id));
    if (chosen.length === 0) { toast.error('Select at least one employee'); return; }

    for (const e of chosen) {
      const l = lineOf(e.id);
      if (isTimed(l.status) && l.inT && l.outT && l.outT <= l.inT) {
        toast.error(`${empName(e)}: out time must be later than in time`);
        return;
      }
    }
    if (!window.confirm(`Save attendance for ${chosen.length} employee(s) on ${date}?`)) return;

    setSaving(true);
    try {
      const payload = chosen.map(e => {
        const l = lineOf(e.id);
        return {
          emp_id: e.id,
          date,
          status: l.status,
          in_time: isTimed(l.status) && l.inT ? l.inT : null,
          out_time: isTimed(l.status) && l.outT ? l.outT : null,
          remarks: l.remarks.trim() || null,
          source: 'admin',
          marked_by: user.id,
        };
      });
      const { data, error } = await supabase
        .from('attendance')
        .upsert(payload, { onConflict: 'emp_id,date', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(error.message);
      const done = (data as unknown[] | null)?.length ?? 0;
      toast.success(`${done} attendance record(s) saved${done < chosen.length ? ` (${chosen.length - done} already existed)` : ''}`);
      setLines({});
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" /> Bulk attendance</span>
            <Button size="sm" variant="outline" className="gap-1" onClick={onSingle}>
              <Plus className="h-3.5 w-3.5" /> Single entry
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Field label="Date">
              <input type="date" className={INPUT_CLS} value={date} onChange={e => setDate(e.target.value)} />
            </Field>
            <Field label="Default status">
              <select className={SELECT_CLS} value={defStatus} onChange={e => setDefStatus(e.target.value as Status)}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </Field>
            <Field label="Default in (optional)">
              <input type="time" className={INPUT_CLS} value={defIn} onChange={e => setDefIn(e.target.value)} disabled={!isTimed(defStatus)} />
            </Field>
            <Field label="Default out (optional)">
              <input type="time" className={INPUT_CLS} value={defOut} onChange={e => setDefOut(e.target.value)} disabled={!isTimed(defStatus)} />
            </Field>
            <div className="flex items-end">
              <Button variant="outline" className="w-full gap-1" onClick={applyToAll}>
                <Wand2 className="h-4 w-4" /> Apply to all rows
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Set the default once and press "Apply to all rows", then change any single row if needed. Everything is saved
            together with one button. Employees already marked on this date are not changed (use the Records tab).
            Times are optional; nothing is filled in automatically.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0 pt-4 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-0">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-blue-600"
                checked={allChecked}
                onChange={e => setPicked(e.target.checked ? new Set(selectable.map(x => x.id)) : new Set())}
              />
              Select all ({picked.size} / {selectable.length})
            </label>
            <Button onClick={submit} disabled={saving || loading} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save selected
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map(e => {
                  const done = existing.has(e.id);
                  const l = lineOf(e.id);
                  const timed = isTimed(l.status);
                  return (
                    <TableRow key={e.id} className={cn(done && 'opacity-50')}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-blue-600"
                          disabled={done}
                          checked={!done && picked.has(e.id)}
                          onChange={() => toggle(e.id)}
                          aria-label={`Select ${empName(e)}`}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{empName(e)}</p>
                        <p className="text-xs text-slate-500">{done ? 'already marked' : (e.employee_code || '—')}</p>
                      </TableCell>
                      <TableCell>
                        <select
                          className={cn(CELL_INPUT_CLS, 'w-28')}
                          value={l.status}
                          disabled={done}
                          onChange={ev => setLine(e.id, { status: ev.target.value as Status })}
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                        </select>
                      </TableCell>
                      <TableCell>
                        <input
                          type="time" className={cn(CELL_INPUT_CLS, 'w-28')}
                          value={timed ? l.inT : ''} disabled={done || !timed}
                          onChange={ev => setLine(e.id, { inT: ev.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="time" className={cn(CELL_INPUT_CLS, 'w-28')}
                          value={timed ? l.outT : ''} disabled={done || !timed}
                          onChange={ev => setLine(e.id, { outT: ev.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          className={cn(CELL_INPUT_CLS, 'w-44')} placeholder="Optional"
                          value={l.remarks} disabled={done}
                          onChange={ev => setLine(e.id, { remarks: ev.target.value })}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {team.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-slate-500">No employees for this date.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3 — Missing check-outs (review and fix many at once)
// ═════════════════════════════════════════════════════════════════════════════
const FixTab: React.FC<{
  employees: Emp[];
  refreshKey: number;
  onSaved: () => void;
}> = ({ employees, refreshKey, onSaved }) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [outTimes, setOutTimes] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkOut, setBulkOut] = useState('');
  const [bulkStatus, setBulkStatus] = useState<'' | 'present' | 'halfday'>('');
  const [saving, setSaving] = useState(false);

  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e] as [string, Emp])), [employees]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('attendance')
      .select(COLS)
      .not('check_in_at', 'is', null)
      .is('check_out_at', null)
      .in('status', ['present', 'halfday'])
      .lt('date', istToday())
      .order('date', { ascending: false });
    if (error) toast.error(error.message || 'Could not load missing check-outs');
    else {
      setRows((data as AttRow[]) ?? []);
      setOutTimes({});
      setStatuses({});
      setPicked(new Set());
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const statusOf = (r: AttRow): Status => statuses[r.id] ?? r.status;

  const applyBulk = () => {
    if (picked.size === 0) { toast.error('Select at least one row first'); return; }
    if (!bulkOut && !bulkStatus) { toast.error('Enter an out time and/or choose a status to apply'); return; }
    if (bulkOut) setOutTimes(prev => { const next = { ...prev }; picked.forEach(id => { next[id] = bulkOut; }); return next; });
    if (bulkStatus) setStatuses(prev => { const next = { ...prev }; picked.forEach(id => { next[id] = bulkStatus; }); return next; });
  };

  const toggle = (id: string) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const saveSelected = async () => {
    if (!user) return;
    const chosen = rows.filter(r => picked.has(r.id));
    if (chosen.length === 0) { toast.error('Select at least one row'); return; }

    for (const r of chosen) {
      const out = outTimes[r.id] ?? '';
      const who = `${empName(empMap.get(r.emp_id))} (${shortDay(r.date)})`;
      if (!out) { toast.error(`${who}: enter the out time`); return; }
      const inT = isoToHHMM(r.check_in_at);
      if (inT && out <= inT) { toast.error(`${who}: out time must be later than the check-in (${inT})`); return; }
    }
    if (!window.confirm(`Save the check-out for ${chosen.length} record(s)?`)) return;

    setSaving(true);
    try {
      let failed = 0;
      for (let i = 0; i < chosen.length; i += 10) {
        const batch = chosen.slice(i, i + 10);
        const results = await Promise.all(
          batch.map(r =>
            supabase
              .from('attendance')
              .update({
                status: statusOf(r),
                out_time: outTimes[r.id],
                check_out_at: hhmmToIso(r.date, outTimes[r.id]),
                marked_by: user.id,
              })
              .eq('id', r.id)
          )
        );
        failed += results.filter(x => x.error).length;
      }
      if (failed) toast.error(`${failed} record(s) could not be saved`);
      else toast.success(`${chosen.length} check-out(s) saved`);
      onSaved();
      await load();
    } catch (e) {
      toast.error((e as Error).message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const allChecked = rows.length > 0 && rows.every(r => picked.has(r.id));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Missing check-outs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            These employees checked in but never checked out. Nothing is filled in automatically, because a made-up
            time (like 6 PM) could be wrong. Enter the real out time for each row, or select rows and apply one time
            and/or status to all of them, then save everything together. Choose Half Day for anyone who left early.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Out time for selected rows">
              <input type="time" className={INPUT_CLS} value={bulkOut} onChange={e => setBulkOut(e.target.value)} />
            </Field>
            <Field label="Status for selected rows">
              <select className={SELECT_CLS} value={bulkStatus} onChange={e => setBulkStatus(e.target.value as '' | 'present' | 'halfday')}>
                <option value="">Keep as it is</option>
                <option value="present">Present</option>
                <option value="halfday">Half Day</option>
              </select>
            </Field>
            <div className="flex items-end">
              <Button variant="outline" className="w-full gap-1" onClick={applyBulk}>
                <Wand2 className="h-4 w-4" /> Apply to selected
              </Button>
            </div>
            <div className="flex items-end">
              <Button className="w-full gap-2" onClick={saveSelected} disabled={saving || picked.size === 0}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save selected ({picked.size})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0 pt-4 sm:px-6">
          {loading ? (
            <div className="space-y-2 px-4">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No missing check-outs. Everything is up to date.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-600"
                        checked={allChecked}
                        onChange={e => setPicked(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Checked in</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Out time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-blue-600"
                          checked={picked.has(r.id)}
                          onChange={() => toggle(r.id)}
                          aria-label="Select row"
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{dayLabel(r.date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{empName(empMap.get(r.emp_id))}</TableCell>
                      <TableCell className="whitespace-nowrap">{inOf(r)}</TableCell>
                      <TableCell>
                        <select
                          className={cn(CELL_INPUT_CLS, 'w-28')}
                          value={statusOf(r)}
                          onChange={ev => setStatuses(p => ({ ...p, [r.id]: ev.target.value as Status }))}
                        >
                          <option value="present">Present</option>
                          <option value="halfday">Half Day</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <input
                          type="time" className={cn(CELL_INPUT_CLS, 'w-28')}
                          value={outTimes[r.id] ?? ''}
                          onChange={ev => setOutTimes(p => ({ ...p, [r.id]: ev.target.value }))}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4 — Records (filter, edit, delete)
// ═════════════════════════════════════════════════════════════════════════════
const RecordsTab: React.FC<{
  employees: Emp[];
  refreshKey: number;
  onOpen: (s: DialogState) => void;
  onChanged: () => void;
}> = ({ employees, refreshKey, onOpen, onChanged }) => {
  const [empFilter, setEmpFilter] = useState('');
  const [from, setFrom] = useState(() => `${istToday().slice(0, 7)}-01`);
  const [to, setTo] = useState(istToday());
  const [rows, setRows] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const req = useRef(0);

  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e] as [string, Emp])), [employees]);

  const load = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    try {
      const data = await fetchAll<AttRow>((f, t) => {
        let q = supabase.from('attendance').select(COLS).order('date', { ascending: false }).range(f, t);
        if (empFilter) q = q.eq('emp_id', empFilter);
        if (from) q = q.gte('date', from);
        if (to) q = q.lte('date', to);
        return q;
      });
      if (id === req.current) setRows(data);
    } catch (e) {
      if (id === req.current) toast.error((e as Error).message || 'Could not load records');
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [empFilter, from, to]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const remove = async (r: AttRow) => {
    const who = empName(empMap.get(r.emp_id));
    if (!window.confirm(`Delete ${who}'s record for ${shortDay(r.date)}? This cannot be undone.`)) return;
    const { error } = await supabase.from('attendance').delete().eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Record deleted');
    onChanged();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-3">
          <Field label="Employee">
            <select className={SELECT_CLS} value={empFilter} onChange={e => setEmpFilter(e.target.value)}>
              <option value="">All employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{empName(e)}{isActive(e) ? '' : ' (inactive)'}</option>)}
            </select>
          </Field>
          <Field label="From">
            <input type="date" className={INPUT_CLS} value={from} onChange={e => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" className={INPUT_CLS} value={to} onChange={e => setTo(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0 pt-4 sm:px-6">
          <p className="mb-2 px-4 text-xs text-slate-500 sm:px-0">{loading ? 'Loading…' : `${rows.length} records`}</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-slate-500">No records found.</TableCell>
                  </TableRow>
                ) : (
                  rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-medium">{dayLabel(r.date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{empName(empMap.get(r.emp_id))}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="whitespace-nowrap">{inOf(r)}</TableCell>
                      <TableCell className="whitespace-nowrap">{outOf(r)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-slate-500">{r.remarks || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button size="sm" variant="outline" className="mr-1 gap-1" onClick={() => onOpen({ row: r })} aria-label="Edit record">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-red-600" onClick={() => remove(r)} aria-label="Delete record">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
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

// ═════════════════════════════════════════════════════════════════════════════
// TAB 5 — Monthly summary (payable days, unmarked days, CSV export)
// ═════════════════════════════════════════════════════════════════════════════
const SummaryTab: React.FC<{
  employees: Emp[];
  refreshKey: number;
  onOpen: (s: DialogState) => void;
}> = ({ employees, refreshKey, onOpen }) => {
  const today = istToday();
  const months = useMemo(() => keptMonths(today), [today]);
  const [month, setMonth] = useState(months[0]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [records, setRecords] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const req = useRef(0);

  const load = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    try {
      const { start, end } = monthRange(month);
      const [sumRes, recs] = await Promise.all([
        supabase.rpc('attendance_month_summary', { p_month: month }),
        fetchAll<AttRow>((f, t) =>
          supabase.from('attendance').select(COLS).gte('date', start).lt('date', end).order('date').range(f, t)
        ),
      ]);
      if (sumRes.error) throw new Error(sumRes.error.message);
      if (id !== req.current) return;
      setSummary((sumRes.data as SummaryRow[]) ?? []);
      setRecords(recs);
    } catch (e) {
      if (id === req.current) toast.error((e as Error).message || 'Could not load the summary');
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e] as [string, Emp])), [employees]);

  const markedByEmp = useMemo(() => {
    const m = new Map<string, Set<string>>();
    records.forEach(r => {
      if (!m.has(r.emp_id)) m.set(r.emp_id, new Set());
      m.get(r.emp_id)!.add(r.date);
    });
    return m;
  }, [records]);

  const lines = useMemo(() => {
    return summary
      .map(s => ({ s, e: empMap.get(s.employee_id) }))
      .filter(x => x.e && (isActive(x.e) || x.s.marked_days > 0))
      .sort((a, b) => empName(a.e).localeCompare(empName(b.e)))
      .map(x => ({
        s: x.s,
        e: x.e as Emp,
        unmarked: isActive(x.e as Emp)
          ? unmarkedDatesOf(x.e as Emp, month, today, markedByEmp.get(x.s.employee_id) ?? new Set())
          : [],
      }));
  }, [summary, empMap, month, today, markedByEmp]);

  const totals = useMemo(() => {
    const t = { p: 0, h: 0, l: 0, w: 0, o: 0, a: 0, u: 0, pay: 0 };
    lines.forEach(({ s, unmarked }) => {
      t.p += s.present_days; t.h += s.half_days; t.l += s.leave_days;
      t.w += s.weekoff_days; t.o += s.holiday_days; t.a += s.absent_days;
      t.u += unmarked.length; t.pay += n(s.payable_days);
    });
    return t;
  }, [lines]);

  const exportSummary = () => {
    const head = ['Emp Code', 'Name', 'Designation', 'Present', 'Half Day', 'Leave', 'Week Off', 'Holiday', 'Absent', 'Not Marked', 'Payable Days', 'Days In Month'];
    const body = lines.map(({ s, e, unmarked }) => [
      e.employee_code ?? '', empName(e), e.designation ?? '',
      s.present_days, s.half_days, s.leave_days, s.weekoff_days, s.holiday_days, s.absent_days,
      unmarked.length, fmtDays(s.payable_days), s.days_in_month,
    ]);
    downloadCsv(`attendance-summary-${month}.csv`, [head, ...body]);
  };

  const exportDaily = () => {
    const head = ['Date', 'Emp Code', 'Name', 'Status', 'In', 'Out', 'Hours', 'Remarks', 'Source'];
    const body = records.map(r => {
      const e = empMap.get(r.emp_id);
      return [
        r.date, e?.employee_code ?? '', empName(e), STATUS_META[r.status]?.label ?? r.status,
        inOf(r) === '—' ? '' : inOf(r), outOf(r) === '—' ? '' : outOf(r),
        workedOf(r) === '—' ? '' : workedOf(r), r.remarks ?? '', r.source ?? '',
      ];
    });
    downloadCsv(`attendance-daily-${month}.csv`, [head, ...body]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select className={cn(SELECT_CLS, 'w-auto')} value={month} onChange={e => setMonth(e.target.value)} aria-label="Month">
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={exportSummary} disabled={loading || lines.length === 0}>
            <Download className="h-3.5 w-3.5" /> Summary CSV
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={exportDaily} disabled={loading || records.length === 0}>
            <Download className="h-3.5 w-3.5" /> Daily CSV
          </Button>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Only the current and the previous month are kept here. Older attendance is archived from the HR Backup page.
        Payable Days = Present + Leave + Week Off + Holiday + (Half Day × 0.5). Click a red date to mark that day.
      </p>

      <Card>
        <CardContent className="px-0 pt-4 sm:px-6">
          {loading ? (
            <div className="space-y-2 px-4">
              {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-center">P</TableHead>
                    <TableHead className="text-center">HD</TableHead>
                    <TableHead className="text-center">L</TableHead>
                    <TableHead className="text-center">WO</TableHead>
                    <TableHead className="text-center">H</TableHead>
                    <TableHead className="text-center">A</TableHead>
                    <TableHead>Not marked</TableHead>
                    <TableHead className="text-right">Payable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-slate-500">No data for this month.</TableCell>
                    </TableRow>
                  ) : (
                    lines.map(({ s, e, unmarked }) => (
                      <TableRow key={s.employee_id}>
                        <TableCell>
                          <p className="font-medium">{empName(e)}{isActive(e) ? '' : ' (inactive)'}</p>
                          <p className="text-xs text-slate-500">{e.employee_code || '—'}</p>
                        </TableCell>
                        <TableCell className="text-center font-semibold text-green-600">{s.present_days}</TableCell>
                        <TableCell className="text-center text-amber-600">{s.half_days}</TableCell>
                        <TableCell className="text-center text-blue-600">{s.leave_days}</TableCell>
                        <TableCell className="text-center text-purple-600">{s.weekoff_days}</TableCell>
                        <TableCell className="text-center text-cyan-600">{s.holiday_days}</TableCell>
                        <TableCell className="text-center text-red-600">{s.absent_days}</TableCell>
                        <TableCell>
                          <UnmarkedChips dates={unmarked} onPick={d => onOpen({ empId: s.employee_id, date: d })} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-bold tabular-nums">
                          {fmtDays(s.payable_days)} <span className="font-normal text-slate-500">/ {s.days_in_month}</span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {lines.length > 1 && (
                    <TableRow className="bg-slate-50 font-bold dark:bg-slate-800/50">
                      <TableCell>Total ({lines.length})</TableCell>
                      <TableCell className="text-center">{totals.p}</TableCell>
                      <TableCell className="text-center">{totals.h}</TableCell>
                      <TableCell className="text-center">{totals.l}</TableCell>
                      <TableCell className="text-center">{totals.w}</TableCell>
                      <TableCell className="text-center">{totals.o}</TableCell>
                      <TableCell className="text-center">{totals.a}</TableCell>
                      <TableCell>{totals.u}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtDays(totals.pay)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// PAGE
// ═════════════════════════════════════════════════════════════════════════════
const AdminAttendancePage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('live');
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let off = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id,name,employee_code,designation,joining_date,is_active')
        .eq('role', 'employee')
        .order('name');
      if (off) return;
      if (error) toast.error(error.message || 'Could not load employees');
      else setEmployees((data as Emp[]) ?? []);
      setLoading(false);
    })();
    return () => { off = true; };
  }, []);

  // Number of missing check-outs, shown as a badge on the tab
  useEffect(() => {
    let off = false;
    (async () => {
      const { count } = await supabase
        .from('attendance')
        .select('id', { count: 'exact', head: true })
        .not('check_in_at', 'is', null)
        .is('check_out_at', null)
        .in('status', ['present', 'halfday'])
        .lt('date', istToday());
      if (!off) setPending(count ?? 0);
    })();
    return () => { off = true; };
  }, [refreshKey]);

  const bump = useCallback(() => setRefreshKey(k => k + 1), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const openDialog = useCallback((s: DialogState) => setDialog(s), []);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'live', label: 'Today (Live)' },
    { id: 'mark', label: 'Mark' },
    { id: 'fix', label: pending > 0 ? `Missing check-outs (${pending})` : 'Missing check-outs' },
    { id: 'records', label: 'Records / Edit' },
    { id: 'summary', label: 'Monthly Summary' },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold">Attendance</h2>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b dark:border-slate-800">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors',
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
              t.id === 'fix' && pending > 0 && tab !== 'fix' && 'text-amber-600'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : (
        <>
          {tab === 'live' && <LiveTab employees={employees} refreshKey={refreshKey} onOpen={openDialog} />}
          {tab === 'mark' && (
            <BulkTab employees={employees} refreshKey={refreshKey} onSaved={bump} onSingle={() => openDialog({})} />
          )}
          {tab === 'fix' && <FixTab employees={employees} refreshKey={refreshKey} onSaved={bump} />}
          {tab === 'records' && (
            <RecordsTab employees={employees} refreshKey={refreshKey} onOpen={openDialog} onChanged={bump} />
          )}
          {tab === 'summary' && <SummaryTab employees={employees} refreshKey={refreshKey} onOpen={openDialog} />}
        </>
      )}

      <RecordDialog state={dialog} employees={employees} onClose={closeDialog} onSaved={bump} />
    </div>
  );
};

export default AdminAttendancePage;
