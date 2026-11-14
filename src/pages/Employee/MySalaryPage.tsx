import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { FileText, Printer, Eye } from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Types + helpers
// ─────────────────────────────────────────────────────────────────────────────
interface Slip {
  id: string;
  month: string; // YYYY-MM
  basic_salary: number | string | null;
  hra: number | string | null;
  conveyance: number | string | null;
  special_allowance: number | string | null;
  attendance_bonus: number | string | null;
  incentive_amount: number | string | null;
  other_deductions: number | string | null;
  total_earnings: number | string | null;
  net_salary: number | string | null;
  present_days: number | null;
  absent_days: number | null;
  half_days: number | null;
  leave_days: number | null;
  weekoff_days: number | null;
  holiday_days: number | null;
  fixed_salary: number | string | null;
  days_in_month: number | null;
  payable_days: number | string | null;
  prorated_salary: number | string | null;
  is_manual_override: boolean | null;
  notes: string | null;
}

interface EmpInfo {
  name: string;
  designation: string;
  employee_code: string;
  joining_date: string;
}

const n = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

const inr = (v: number | string | null | undefined): string =>
  '₹' +
  n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const days = (v: number | string | null | undefined): string => {
  const x = n(v);
  return x % 1 === 0 ? String(x) : x.toFixed(1);
};

const monthLabel = (m: string): string =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

const fmtDate = (d: string): string => {
  if (!d) return '—';
  const x = new Date(`${d}T00:00:00`);
  return isNaN(x.getTime())
    ? d
    : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );

/** Printable A4 slip (opens in a new tab → browser "Save as PDF" / Print) */
const buildSlipHtml = (s: Slip, e: EmpInfo): string => {
  const row = (label: string, value: string) =>
    `<tr><td>${esc(label)}</td><td class="r">${esc(value)}</td></tr>`;
  const prorationNote = !s.is_manual_override && n(s.days_in_month) > 0
    ? `<p class="note">Fixed salary ${esc(inr(s.fixed_salary))} × ${esc(days(s.payable_days))} payable days ÷ ${esc(s.days_in_month)} days = ${esc(inr(s.prorated_salary))}</p>`
    : s.is_manual_override
      ? '<p class="note">Salary amount set manually by admin.</p>'
      : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Salary Slip - ${esc(e.name)} - ${esc(monthLabel(s.month))}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;color:#111}
  .box{max-width:760px;margin:0 auto;border:1px solid #cbd5e1;border-radius:8px;padding:24px}
  h1{margin:0;font-size:20px;color:#1d4ed8;text-align:center} h2{margin:4px 0 0;font-size:13px;font-weight:normal;color:#475569;text-align:center}
  h3{text-align:center;margin:14px 0;font-size:16px}
  table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}
  td,th{border:1px solid #e2e8f0;padding:7px 9px;text-align:left} th{background:#eff6ff}
  .r{text-align:right} .sec{background:#f1f5f9;font-weight:bold}
  .tot td{font-weight:bold;background:#eff6ff} .net td{font-weight:bold;background:#16a34a;color:#fff;font-size:14px}
  .note{font-size:12px;color:#475569;margin:6px 0} .foot{margin-top:18px;text-align:center;font-size:11px;color:#64748b}
  @media print{body{padding:0}.box{border:none}}
</style></head><body><div class="box">
<h1>Radhey Enterprises</h1><h2>Authorized Partner Vodafone Idea Ltd · Gurgaon, Haryana</h2>
<h3>Salary Slip — ${esc(monthLabel(s.month))}</h3>
<table>
<tr><td><b>Employee</b></td><td>${esc(e.name)}</td><td><b>Employee ID</b></td><td>${esc(e.employee_code || '—')}</td></tr>
<tr><td><b>Designation</b></td><td>${esc(e.designation || '—')}</td><td><b>Date of Joining</b></td><td>${esc(fmtDate(e.joining_date))}</td></tr>
</table>
<table>
<tr class="sec"><td colspan="4">Attendance</td></tr>
<tr><td>Present</td><td>${esc(s.present_days ?? 0)}</td><td>Half Days</td><td>${esc(s.half_days ?? 0)}</td></tr>
<tr><td>Leave</td><td>${esc(s.leave_days ?? 0)}</td><td>Week Offs</td><td>${esc(s.weekoff_days ?? 0)}</td></tr>
<tr><td>Holidays</td><td>${esc(s.holiday_days ?? 0)}</td><td>Absent</td><td>${esc(s.absent_days ?? 0)}</td></tr>
<tr><td><b>Payable Days</b></td><td colspan="3"><b>${esc(days(s.payable_days))} of ${esc(s.days_in_month ?? '—')}</b></td></tr>
</table>
${prorationNote}
<table>
<tr class="sec"><td>Earnings</td><td class="r">Amount</td></tr>
${row('Basic Salary', inr(s.basic_salary))}
${row('HRA', inr(s.hra))}
${row('Conveyance', inr(s.conveyance))}
${row('Special Allowance', inr(s.special_allowance))}
${row('Attendance Bonus', inr(s.attendance_bonus))}
${row('Incentive', inr(s.incentive_amount))}
<tr class="tot"><td>Total Earnings</td><td class="r">${esc(inr(s.total_earnings))}</td></tr>
<tr class="sec"><td>Deductions</td><td class="r">Amount</td></tr>
${row('Other Deductions', inr(s.other_deductions))}
<tr class="net"><td>Net Salary Payable</td><td class="r">${esc(inr(s.net_salary))}</td></tr>
</table>
${s.notes ? `<p class="note">Note: ${esc(s.notes)}</p>` : ''}
<p class="foot">This is a computer generated salary slip and does not require a signature.</p>
</div></body></html>`;
};

const printSlip = (s: Slip, e: EmpInfo) => {
  const w = window.open('', '_blank');
  if (!w) {
    toast.error('Pop-up block ho gaya. Browser me pop-up allow karke dobara try karein.');
    return;
  }
  w.document.open();
  w.document.write(buildSlipHtml(s, e));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
};

// ─────────────────────────────────────────────────────────────────────────────
// Slip view inside the dialog (outside the page component → no remount)
// ─────────────────────────────────────────────────────────────────────────────
const Line: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value, bold }) => (
  <div className={`flex items-center justify-between py-1.5 text-sm ${bold ? 'font-bold' : ''}`}>
    <span className="text-slate-600 dark:text-slate-300">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

const SlipView: React.FC<{ slip: Slip }> = ({ slip }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center text-xs dark:bg-slate-800/60 sm:grid-cols-6">
      {[
        ['Present', slip.present_days],
        ['Half Day', slip.half_days],
        ['Leave', slip.leave_days],
        ['Week Off', slip.weekoff_days],
        ['Holiday', slip.holiday_days],
        ['Absent', slip.absent_days],
      ].map(([label, v]) => (
        <div key={label as string}>
          <p className="text-slate-500">{label}</p>
          <p className="text-base font-bold">{v ?? 0}</p>
        </div>
      ))}
    </div>

    <p className="text-sm">
      Payable Days: <b>{days(slip.payable_days)}</b> / {slip.days_in_month ?? '—'}
    </p>
    {!slip.is_manual_override && n(slip.days_in_month) > 0 && (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {inr(slip.fixed_salary)} × {days(slip.payable_days)} ÷ {slip.days_in_month} = {inr(slip.prorated_salary)}
      </p>
    )}

    <div className="divide-y rounded-lg border px-3 dark:divide-slate-800 dark:border-slate-800">
      <Line label="Basic Salary" value={inr(slip.basic_salary)} />
      <Line label="HRA" value={inr(slip.hra)} />
      <Line label="Conveyance" value={inr(slip.conveyance)} />
      <Line label="Special Allowance" value={inr(slip.special_allowance)} />
      <Line label="Attendance Bonus" value={inr(slip.attendance_bonus)} />
      <Line label="Incentive" value={inr(slip.incentive_amount)} />
      <Line label="Total Earnings" value={inr(slip.total_earnings)} bold />
      <Line label="Other Deductions" value={`− ${inr(slip.other_deductions)}`} />
      <Line label="Net Salary Payable" value={inr(slip.net_salary)} bold />
    </div>

    {slip.notes && <p className="text-xs text-slate-500">Note: {slip.notes}</p>}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
const MySalaryPage: React.FC = () => {
  const { user, profile } = useAuth();
  const userId = user?.id;

  const [slips, setSlips] = useState<Slip[]>([]);
  const [emp, setEmp] = useState<EmpInfo>({
    name: profile?.name ?? '',
    designation: '',
    employee_code: '',
    joining_date: '',
  });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Slip | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [slipRes, profRes] = await Promise.all([
        supabase
          .from('salary_slips')
          .select('*')
          .eq('emp_id', userId)
          .order('month', { ascending: false }),
        supabase
          .from('user_profiles')
          .select('name, designation, employee_code, joining_date')
          .eq('id', userId)
          .maybeSingle(),
      ]);
      if (slipRes.error) throw slipRes.error;
      setSlips((slipRes.data as Slip[]) ?? []);
      if (profRes.data) {
        const p: any = profRes.data;
        setEmp({
          name: p.name ?? '',
          designation: p.designation ?? '',
          employee_code: p.employee_code ?? '',
          joining_date: p.joining_date ?? '',
        });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Salary slips load nahi ho paayi');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileText className="h-5 w-5 text-blue-600" />
            Meri Salary Slips
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <>
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </>
          ) : slips.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Abhi koi salary slip ready nahi hai. Admin slip banayega to yahan dikhegi.
            </p>
          ) : (
            slips.map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-xl border p-3 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{monthLabel(s.month)}</p>
                  <p className="text-xs text-slate-500">
                    Payable {days(s.payable_days)} / {s.days_in_month ?? '—'} din
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden font-bold tabular-nums text-green-700 dark:text-green-400 sm:inline">
                    {inr(s.net_salary)}
                  </span>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(s)}>
                    <Eye className="h-3.5 w-3.5" /> Dekhein
                  </Button>
                  <Button size="sm" className="gap-1" onClick={() => printSlip(s, emp)}>
                    <Printer className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={v => { if (!v) setOpen(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Salary Slip — {open ? monthLabel(open.month) : ''}</DialogTitle>
            <DialogDescription>
              {emp.name}
              {emp.employee_code ? ` · ${emp.employee_code}` : ''}
              {emp.designation ? ` · ${emp.designation}` : ''}
            </DialogDescription>
          </DialogHeader>
          {open && <SlipView slip={open} />}
          {open && (
            <Button className="w-full gap-2" onClick={() => printSlip(open, emp)}>
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MySalaryPage;
