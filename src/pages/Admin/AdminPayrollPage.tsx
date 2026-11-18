import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { IndianRupee, Loader2, Printer, AlertTriangle, Save, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  BONUS_AMOUNT,
  BONUS_MIN_PRESENT_DAYS,
  computeSlipAmounts,
  fmtDays,
  inr,
  monthLabel,
  printSlip,
  toNum,
  type SlipRow,
} from '@/lib/salarySlip';

// ═════════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════════
interface Emp {
  id: string;
  name: string | null;
  employee_code: string | null;
  designation: string | null;
  joining_date: string | null;
  is_active: boolean | null;
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

interface IncentiveRow {
  emp_id: string;
  month: string;
  total_sale: number | null;
  per_sale_incentive: number | string | null;
  total_incentive: number | string | null;
}

interface RowInputs {
  bonus: boolean;
  special: string;
  deductions: string;
  manual: string;
}

type Tab = 'slips' | 'incentives';

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════
const IST = 'Asia/Kolkata';
const SELECT_CLS =
  'h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900';
const NUM_CLS =
  'h-8 w-24 rounded-md border border-slate-300 bg-white px-2 text-right text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900';

const istToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: IST });

const lastTwelveMonths = (today: string): string[] => {
  const [y, m] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

/** Parses a text box value into a positive number (blank / invalid → 0) */
const parseAmount = (s: string | undefined): number => {
  const v = parseFloat(s ?? '');
  return Number.isFinite(v) && v > 0 ? v : 0;
};

const empName = (e?: Emp): string => e?.name || e?.employee_code || 'Unknown';
const isActive = (e: Emp): boolean => e.is_active !== false;

const MonthPicker: React.FC<{ value: string; onChange: (m: string) => void; months: string[] }> = ({
  value, onChange, months,
}) => (
  <select className={SELECT_CLS} value={value} onChange={e => onChange(e.target.value)} aria-label="Month">
    {months.map(m => (
      <option key={m} value={m}>{monthLabel(m)}</option>
    ))}
  </select>
);

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1 — Salary slips
// ═════════════════════════════════════════════════════════════════════════════
const SlipsTab: React.FC<{
  employees: Emp[];
  payroll: Map<string, number>;
  refreshKey: number;
}> = ({ employees, payroll, refreshKey }) => {
  const { user } = useAuth();
  const today = istToday();
  const months = useMemo(() => lastTwelveMonths(today), [today]);
  const [month, setMonth] = useState<string>(() => months[1] ?? months[0]); // payroll is usually for last month
  const keptMonthList = useMemo(() => months.slice(0, 2), [months]);

  const [summary, setSummary] = useState<Map<string, SummaryRow>>(new Map());
  const [incentives, setIncentives] = useState<Map<string, number>>(new Map());
  const [slips, setSlips] = useState<Map<string, SlipRow>>(new Map());
  const [edits, setEdits] = useState<Record<string, Partial<RowInputs>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // employee id, or 'all'
  const req = useRef(0);

  const load = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    try {
      // Current and previous month: live numbers. Older months: the saved monthly summary.
      const sumPromise = keptMonthList.includes(month)
        ? supabase.rpc('attendance_month_summary', { p_month: month })
        : supabase.from('attendance_monthly_summary').select('*').eq('month', month);
      const [sumRes, incRes, slipRes] = await Promise.all([
        sumPromise,
        supabase.from('incentives').select('emp_id,total_incentive').eq('month', month),
        supabase.from('salary_slips').select('*').eq('month', month),
      ]);
      if (sumRes.error) throw new Error(sumRes.error.message);
      if (incRes.error) throw new Error(incRes.error.message);
      if (slipRes.error) throw new Error(slipRes.error.message);
      if (id !== req.current) return;

      const sumRows: SummaryRow[] = keptMonthList.includes(month)
        ? ((sumRes.data as SummaryRow[]) ?? [])
        : ((sumRes.data as Array<Record<string, any>>) ?? []).map(r => ({
            employee_id: r.emp_id,
            present_days: r.present_days,
            absent_days: r.absent_days,
            half_days: r.half_days,
            leave_days: r.leave_days,
            weekoff_days: r.weekoff_days,
            holiday_days: r.holiday_days,
            payable_days: r.payable_days,
            days_in_month: r.days_in_month,
            marked_days: r.marked_days,
            unmarked_days: r.unmarked_days,
          }));
      setSummary(new Map(sumRows.map(r => [r.employee_id, r] as [string, SummaryRow])));
      setIncentives(
        new Map(
          ((incRes.data as Array<{ emp_id: string; total_incentive: number | string | null }>) ?? []).map(
            r => [r.emp_id, toNum(r.total_incentive)] as [string, number]
          )
        )
      );
      setSlips(new Map(((slipRes.data as SlipRow[]) ?? []).map(r => [r.emp_id as string, r] as [string, SlipRow])));
    } catch (e) {
      if (id === req.current) toast.error((e as Error).message || 'Could not load payroll data');
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [month, keptMonthList]);

  useEffect(() => { setEdits({}); }, [month]);
  useEffect(() => { load(); }, [load, refreshKey]);

  // Active employees, plus anyone who already has attendance or a slip in this month
  const team = useMemo(
    () =>
      employees
        .filter(e => isActive(e) || slips.has(e.id) || (summary.get(e.id)?.marked_days ?? 0) > 0)
        .sort((a, b) => empName(a).localeCompare(empName(b))),
    [employees, slips, summary]
  );

  const inputsFor = useCallback(
    (empId: string): RowInputs => {
      const edit = edits[empId] ?? {};
      const slip = slips.get(empId);
      const sum = summary.get(empId);
      const defaultBonus = slip
        ? toNum(slip.attendance_bonus) > 0
        : (sum?.present_days ?? 0) >= BONUS_MIN_PRESENT_DAYS;
      return {
        bonus: edit.bonus ?? defaultBonus,
        special: edit.special ?? (slip && toNum(slip.special_allowance) > 0 ? String(toNum(slip.special_allowance)) : ''),
        deductions: edit.deductions ?? (slip && toNum(slip.other_deductions) > 0 ? String(toNum(slip.other_deductions)) : ''),
        manual:
          edit.manual ??
          (slip?.is_manual_override && toNum(slip.manual_salary) > 0 ? String(toNum(slip.manual_salary)) : ''),
      };
    },
    [edits, slips, summary]
  );

  const setEdit = (empId: string, patch: Partial<RowInputs>) =>
    setEdits(prev => ({ ...prev, [empId]: { ...prev[empId], ...patch } }));

  /** Everything needed to show a row and to write its slip */
  const calc = useCallback(
    (e: Emp) => {
      const inp = inputsFor(e.id);
      const sum = summary.get(e.id);
      const fixed = payroll.get(e.id) ?? 0;
      const amounts = computeSlipAmounts({
        fixedSalary: fixed,
        payableDays: toNum(sum?.payable_days),
        daysInMonth: sum?.days_in_month ?? 0,
        manualSalary: parseAmount(inp.manual),
        specialAllowance: parseAmount(inp.special),
        attendanceBonus: inp.bonus,
        incentive: incentives.get(e.id) ?? 0,
        otherDeductions: parseAmount(inp.deductions),
      });
      return { inp, sum, fixed, amounts };
    },
    [inputsFor, summary, payroll, incentives]
  );

  const buildPayload = (e: Emp) => {
    const { inp, sum, fixed, amounts } = calc(e);
    return {
      emp_id: e.id,
      month,
      basic_salary: amounts.basic,
      hra: amounts.hra,
      conveyance: amounts.conveyance,
      special_allowance: amounts.special,
      attendance_bonus: amounts.bonus,
      incentive_amount: amounts.incentive,
      other_deductions: amounts.deductions,
      total_earnings: amounts.totalEarnings,
      net_salary: amounts.net,
      present_days: sum?.present_days ?? 0,
      absent_days: sum?.absent_days ?? 0,
      half_days: sum?.half_days ?? 0,
      leave_days: sum?.leave_days ?? 0,
      weekoff_days: sum?.weekoff_days ?? 0,
      holiday_days: sum?.holiday_days ?? 0,
      working_days: toNum(sum?.payable_days),
      fixed_salary: fixed,
      days_in_month: sum?.days_in_month ?? 0,
      payable_days: toNum(sum?.payable_days),
      prorated_salary: amounts.base,
      is_manual_override: amounts.isManual,
      manual_salary: amounts.isManual ? parseAmount(inp.manual) : null,
      generated_by: user?.id ?? null,
    };
  };

  const hasSalary = (e: Emp): boolean => {
    const { fixed, amounts } = calc(e);
    return fixed > 0 || amounts.isManual;
  };

  const isCurrentMonth = month === today.slice(0, 7);
  // Older months have no raw attendance any more, so their numbers come from the saved monthly summary
  const usesSaved = !keptMonthList.includes(month);
  const noSavedData = usesSaved && !loading && summary.size === 0;

  const deleteSlip = async (e: Emp) => {
    if (!user || busy) return;
    if (!window.confirm(`Delete the ${monthLabel(month)} salary slip of ${empName(e)}? The employee will no longer see it.`)) return;
    setBusy(e.id);
    const { error } = await supabase.from('salary_slips').delete().eq('emp_id', e.id).eq('month', month);
    setBusy(null);
    if (error) {
      toast.error(error.message || 'Could not delete the slip');
      return;
    }
    toast.success('Salary slip deleted');
    await load();
  };

  const generate = async (list: Emp[], busyKey: string) => {
    if (!user || busy) return;
    if (noSavedData) {
      toast.error('There is no saved attendance summary for this month, so a slip cannot be calculated.');
      return;
    }
    const ready = list.filter(hasSalary);
    const skipped = list.filter(e => !hasSalary(e));
    if (ready.length === 0) {
      toast.error('No salary is set for the selected employees. Set it first in Employees → Details → Salary.');
      return;
    }

    const warnings: string[] = [];
    if (isCurrentMonth) warnings.push('This month is not over yet, so payable days can still change.');
    const withGaps = ready.filter(e => (summary.get(e.id)?.unmarked_days ?? 0) > 0);
    if (withGaps.length) {
      warnings.push(
        `${withGaps.length} employee(s) have days with no attendance marked (${withGaps
          .slice(0, 4)
          .map(e => empName(e))
          .join(', ')}${withGaps.length > 4 ? ', …' : ''}). Those days are not counted as payable.`
      );
    }
    const overwrite = ready.filter(e => slips.has(e.id)).length;
    if (overwrite) warnings.push(`${overwrite} existing slip(s) will be replaced.`);
    if (skipped.length) warnings.push(`${skipped.length} employee(s) will be skipped because no salary is set.`);

    const message =
      `Generate ${ready.length} salary slip(s) for ${monthLabel(month)}?` +
      (warnings.length ? `\n\n• ${warnings.join('\n• ')}` : '');
    if (!window.confirm(message)) return;

    setBusy(busyKey);
    try {
      const { error } = await supabase
        .from('salary_slips')
        .upsert(ready.map(buildPayload), { onConflict: 'emp_id,month' });
      if (error) throw new Error(error.message);
      toast.success(`${ready.length} salary slip(s) generated`);
      if (!usesSaved) {
        // Keep the monthly summary permanently, so this slip can still be recalculated after the daily rows are archived
        const snap = await supabase.rpc('snapshot_attendance_summary', { p_month: month });
        if (snap.error) toast.warning('The monthly attendance summary could not be saved: ' + snap.error.message);
      }
      await load();
    } catch (e) {
      toast.error((e as Error).message || 'Could not generate slips');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} months={months} />
        <Button
          className="gap-2"
          disabled={loading || !!busy || noSavedData || team.length === 0}
          onClick={() => generate(team, 'all')}
        >
          {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Generate all slips
        </Button>
      </div>

      {usesSaved && !noSavedData && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          The daily attendance for {monthLabel(month)} has been archived. Payable days below come from the saved monthly
          summary.
        </div>
      )}
      {noSavedData && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          There is no saved attendance summary for {monthLabel(month)}, so a new slip cannot be calculated. Slips that
          were already generated can still be printed or deleted.
        </div>
      )}

      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <p>
          Pay = Fixed salary × Payable days ÷ Days in month. Basic 65% · HRA 25% · Conveyance 10%.
          Net = Pay + Special allowance + Attendance bonus ({inr(BONUS_AMOUNT)}) + Incentive − Deductions.
        </p>
        <p>
          A manual amount replaces the pro-rated pay for that employee. Attendance bonus is pre-selected when the
          employee has {BONUS_MIN_PRESENT_DAYS}+ present days.
        </p>
      </div>

      <Card>
        <CardContent className="px-0 pt-4 sm:px-6">
          {loading ? (
            <div className="space-y-2 px-4">
              {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Fixed</TableHead>
                    <TableHead className="text-center">Payable</TableHead>
                    <TableHead className="text-center">Bonus</TableHead>
                    <TableHead>Special</TableHead>
                    <TableHead>Deductions</TableHead>
                    <TableHead>Manual pay</TableHead>
                    <TableHead className="text-right">Incentive</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Slip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-8 text-center text-slate-500">
                        No employees found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    team.map(e => {
                      const { inp, sum, fixed, amounts } = calc(e);
                      const slip = slips.get(e.id);
                      const noSalary = fixed <= 0 && !amounts.isManual;
                      const gaps = sum?.unmarked_days ?? 0;
                      const changed = !!slip && Math.abs(toNum(slip.net_salary) - amounts.net) > 0.5;
                      return (
                        <TableRow key={e.id}>
                          <TableCell>
                            <p className="font-medium">{empName(e)}{isActive(e) ? '' : ' (inactive)'}</p>
                            <p className="text-xs text-slate-500">{e.employee_code || '—'}</p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {noSalary ? <span className="text-red-600" title="Set it in Employees → Details → Salary">Not set</span> : inr(fixed)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-center">
                            <span className="font-semibold tabular-nums">{fmtDays(sum?.payable_days)}</span>
                            <span className="text-slate-500"> / {sum?.days_in_month ?? '—'}</span>
                            {gaps > 0 && (
                              <span
                                className="ml-1 inline-flex items-center gap-0.5 text-xs text-amber-600"
                                title={`${gaps} day(s) have no attendance marked`}
                              >
                                <AlertTriangle className="h-3 w-3" />{gaps}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-blue-600"
                              checked={inp.bonus}
                              onChange={ev => setEdit(e.id, { bonus: ev.target.checked })}
                              aria-label="Attendance bonus"
                            />
                          </TableCell>
                          <TableCell>
                            <input
                              type="number" min="0" step="0.01" className={NUM_CLS}
                              value={inp.special} placeholder="0"
                              onChange={ev => setEdit(e.id, { special: ev.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <input
                              type="number" min="0" step="0.01" className={NUM_CLS}
                              value={inp.deductions} placeholder="0"
                              onChange={ev => setEdit(e.id, { deductions: ev.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <input
                              type="number" min="0" step="0.01" className={NUM_CLS}
                              value={inp.manual} placeholder="auto"
                              onChange={ev => setEdit(e.id, { manual: ev.target.value })}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{inr(amounts.incentive)}</TableCell>
                          <TableCell className={cn('text-right font-bold tabular-nums', amounts.net < 0 && 'text-red-600')}>
                            {inr(amounts.net)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            {slip && (
                              <Button
                                size="sm" variant="outline" className="mr-1 gap-1"
                                onClick={() =>
                                  printSlip(slip, {
                                    name: empName(e),
                                    designation: e.designation ?? '',
                                    employee_code: e.employee_code ?? '',
                                    joining_date: e.joining_date ?? '',
                                  })
                                }
                                title="Print / save as PDF"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {slip && (
                              <Button
                                size="sm" variant="outline" className="mr-1 gap-1 text-red-600"
                                disabled={!!busy}
                                onClick={() => deleteSlip(e)}
                                title="Delete this salary slip"
                                aria-label="Delete salary slip"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={slip ? 'outline' : 'default'}
                              disabled={!!busy || noSalary || noSavedData}
                              onClick={() => generate([e], e.id)}
                              className="gap-1"
                            >
                              {busy === e.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              {slip ? 'Regenerate' : 'Generate'}
                            </Button>
                            {changed && (
                              <p className="mt-1 text-[11px] text-amber-600">
                                Differs from saved slip ({inr(slip?.net_salary)})
                              </p>
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
// TAB 2 — Incentives
// ═════════════════════════════════════════════════════════════════════════════
const IncentivesTab: React.FC<{
  employees: Emp[];
  refreshKey: number;
  onSaved: () => void;
}> = ({ employees, refreshKey, onSaved }) => {
  const today = istToday();
  const months = useMemo(() => lastTwelveMonths(today), [today]);
  const [month, setMonth] = useState<string>(months[0]);
  const [saved, setSaved] = useState<Map<string, IncentiveRow>>(new Map());
  const [edits, setEdits] = useState<Record<string, { sale?: string; per?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const req = useRef(0);

  const load = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    const { data, error } = await supabase.from('incentives').select('*').eq('month', month);
    if (id !== req.current) return;
    if (error) toast.error(error.message || 'Could not load incentives');
    else setSaved(new Map(((data as IncentiveRow[]) ?? []).map(r => [r.emp_id, r] as [string, IncentiveRow])));
    setEdits({});
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const team = useMemo(
    () => employees.filter(e => isActive(e) || saved.has(e.id)).sort((a, b) => empName(a).localeCompare(empName(b))),
    [employees, saved]
  );

  const valuesOf = (empId: string) => {
    const s = saved.get(empId);
    const ed = edits[empId] ?? {};
    const sale = ed.sale ?? (s ? String(s.total_sale ?? 0) : '');
    const per = ed.per ?? (s ? String(toNum(s.per_sale_incentive)) : '');
    return { sale, per, total: Math.round(parseAmount(sale)) * parseAmount(per), dirty: ed.sale !== undefined || ed.per !== undefined };
  };

  const dirtyIds = team.filter(e => valuesOf(e.id).dirty).map(e => e.id);

  const saveAll = async () => {
    if (dirtyIds.length === 0) return;
    setSaving(true);
    try {
      const payload = dirtyIds.map(id => {
        const v = valuesOf(id);
        const totalSale = Math.round(parseAmount(v.sale));
        const per = parseAmount(v.per);
        return {
          emp_id: id,
          month,
          total_sale: totalSale,
          per_sale_incentive: per,
          total_incentive: Math.round(totalSale * per * 100) / 100,
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await supabase.from('incentives').upsert(payload, { onConflict: 'emp_id,month' });
      if (error) throw new Error(error.message);
      toast.success(`${payload.length} incentive record(s) saved`);
      await load();
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || 'Could not save incentives');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} months={months} />
        <Button className="gap-2" onClick={saveAll} disabled={saving || dirtyIds.length === 0}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes{dirtyIds.length ? ` (${dirtyIds.length})` : ''}
        </Button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Incentive = Total sales × Incentive per sale.</p>

      <Card>
        <CardContent className="px-0 pt-4 sm:px-6">
          {loading ? (
            <div className="space-y-2 px-4">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Total sales</TableHead>
                    <TableHead>Per sale (₹)</TableHead>
                    <TableHead className="text-right">Incentive</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.map(e => {
                    const v = valuesOf(e.id);
                    return (
                      <TableRow key={e.id} className={cn(v.dirty && 'bg-amber-50/60 dark:bg-amber-950/20')}>
                        <TableCell>
                          <p className="font-medium">{empName(e)}</p>
                          <p className="text-xs text-slate-500">{e.employee_code || '—'}</p>
                        </TableCell>
                        <TableCell>
                          <input
                            type="number" min="0" step="1" className={NUM_CLS} placeholder="0"
                            value={v.sale}
                            onChange={ev => setEdits(p => ({ ...p, [e.id]: { ...p[e.id], sale: ev.target.value } }))}
                          />
                        </TableCell>
                        <TableCell>
                          <input
                            type="number" min="0" step="0.01" className={NUM_CLS} placeholder="0"
                            value={v.per}
                            onChange={ev => setEdits(p => ({ ...p, [e.id]: { ...p[e.id], per: ev.target.value } }))}
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{inr(v.total)}</TableCell>
                      </TableRow>
                    );
                  })}
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
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'slips', label: 'Salary Slips' },
  { id: 'incentives', label: 'Incentives' },
];

const AdminPayrollPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('slips');
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [payroll, setPayroll] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadBase = useCallback(async () => {
    const [empRes, payRes] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('id,name,employee_code,designation,joining_date,is_active')
        .eq('role', 'employee')
        .order('name'),
      supabase.from('employee_payroll').select('emp_id,salary'),
    ]);
    if (empRes.error) toast.error(empRes.error.message || 'Could not load employees');
    else setEmployees((empRes.data as Emp[]) ?? []);
    if (payRes.error) toast.error(payRes.error.message || 'Could not load salaries');
    else {
      setPayroll(
        new Map(
          ((payRes.data as Array<{ emp_id: string; salary: number | string }>) ?? []).map(
            r => [r.emp_id, toNum(r.salary)] as [string, number]
          )
        )
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  const bump = useCallback(() => {
    setRefreshKey(k => k + 1);
    loadBase();
  }, [loadBase]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex items-center gap-2">
        <IndianRupee className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold">Payroll</h2>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b dark:border-slate-800">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors',
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
          {tab === 'slips' && <SlipsTab employees={employees} payroll={payroll} refreshKey={refreshKey} />}
          {tab === 'incentives' && <IncentivesTab employees={employees} refreshKey={refreshKey} onSaved={bump} />}
        </>
      )}
    </div>
  );
};

export default AdminPayrollPage;
