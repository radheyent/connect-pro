import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
/** Fixed amount added when "attendance bonus" is switched on */
export const BONUS_AMOUNT = 1000;
/** A month with at least this many present days is suggested for the bonus */
export const BONUS_MIN_PRESENT_DAYS = 25;

const BASIC_PCT = 0.65;
const HRA_PCT = 0.25;
// Conveyance is the remainder (10 %), so the three parts always add up exactly.

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface SlipRow {
  id?: string;
  emp_id?: string;
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
  manual_salary?: number | string | null;
  notes: string | null;
}

export interface SlipEmployee {
  name: string;
  designation: string;
  employee_code: string;
  joining_date: string;
}

export interface SlipInputs {
  fixedSalary: number;
  payableDays: number;
  daysInMonth: number;
  /** When set (> 0) it replaces the pro-rated salary completely */
  manualSalary: number;
  specialAllowance: number;
  attendanceBonus: boolean;
  incentive: number;
  otherDeductions: number;
}

export interface SlipAmounts {
  isManual: boolean;
  base: number; // pro-rated (or manual) salary
  basic: number;
  hra: number;
  conveyance: number;
  special: number;
  bonus: number;
  incentive: number;
  totalEarnings: number;
  deductions: number;
  net: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Number / text helpers
// ─────────────────────────────────────────────────────────────────────────────
export const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export const toNum = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

export const inr = (v: number | string | null | undefined): string =>
  '₹' + toNum(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDays = (v: number | string | null | undefined): string => {
  const x = toNum(v);
  return x % 1 === 0 ? String(x) : x.toFixed(1);
};

export const monthLabel = (m: string): string =>
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

// ─────────────────────────────────────────────────────────────────────────────
// Calculation
//   base     = fixed salary × payable days ÷ days in month     (or the manual amount)
//   earnings = base + special allowance + attendance bonus + incentive
//   net      = earnings − other deductions
// ─────────────────────────────────────────────────────────────────────────────
export function computeSlipAmounts(i: SlipInputs): SlipAmounts {
  const isManual = i.manualSalary > 0;
  const base = isManual
    ? round2(i.manualSalary)
    : i.daysInMonth > 0
      ? round2((i.fixedSalary * i.payableDays) / i.daysInMonth)
      : 0;

  const basic = round2(base * BASIC_PCT);
  const hra = round2(base * HRA_PCT);
  const conveyance = round2(base - basic - hra);

  const special = round2(i.specialAllowance);
  const bonus = i.attendanceBonus ? BONUS_AMOUNT : 0;
  const incentive = round2(i.incentive);
  const totalEarnings = round2(base + special + bonus + incentive);
  const deductions = round2(i.otherDeductions);
  const net = round2(totalEarnings - deductions);

  return { isManual, base, basic, hra, conveyance, special, bonus, incentive, totalEarnings, deductions, net };
}

// ─────────────────────────────────────────────────────────────────────────────
// Printable slip (opens in a new tab → browser "Save as PDF" / Print)
// ─────────────────────────────────────────────────────────────────────────────
export function buildSlipHtml(s: SlipRow, e: SlipEmployee): string {
  const row = (label: string, value: string) =>
    `<tr><td>${esc(label)}</td><td class="r">${esc(value)}</td></tr>`;

  const note =
    s.is_manual_override
      ? '<p class="note">Salary amount was set manually by the administrator.</p>'
      : toNum(s.days_in_month) > 0
        ? `<p class="note">Fixed salary ${esc(inr(s.fixed_salary))} × ${esc(fmtDays(s.payable_days))} payable days ÷ ${esc(s.days_in_month)} days = ${esc(inr(s.prorated_salary))}</p>`
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
<tr><td><b>Payable Days</b></td><td colspan="3"><b>${esc(fmtDays(s.payable_days))} of ${esc(s.days_in_month ?? '—')}</b></td></tr>
</table>
${note}
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
}

export function printSlip(s: SlipRow, e: SlipEmployee): void {
  const w = window.open('', '_blank');
  if (!w) {
    toast.error('The pop-up was blocked. Allow pop-ups for this site and try again.');
    return;
  }
  w.document.open();
  w.document.write(buildSlipHtml(s, e));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
