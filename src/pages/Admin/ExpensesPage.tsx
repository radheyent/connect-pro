import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CheckCircle, XCircle, Trash2, Edit, Download, Plus, Settings, TrendingUp, TrendingDown, IndianRupee, Users, ShieldAlert, BadgeIndianRupee } from 'lucide-react';
import * as XLSX from 'xlsx';

const TABS = ['Overview', 'Pending', 'Field Expenses', 'Office Expenses', 'Credits', 'Ledger', 'Budget'] as const;
type TabType = typeof TABS[number];

const OFFICE_CATS = [
  'tea_refreshments','stationary','rent',
  'electricity','internet','salary','miscellaneous','other',
];

// Credit categories for admin-added credits
const CREDIT_CATS = [
  'charges_collected',
  'incentive_payout',
  'security_amt_taken',
  'premium_number_payout',
  'sales_payout',
  'service_payout',
  'other',
] as const;
type CreditCat = typeof CREDIT_CATS[number];

const CREDIT_CAT_LABELS: Record<string, string> = {
  charges_collected:     'Charges Collected from Customer',
  incentive_payout:      'Incentive Payout',
  security_amt_taken:    'Security Amt Taken',
  premium_number_payout: 'Premium Number Payout',
  sales_payout:          'Sales Payout',
  service_payout:        'Service Related Payout',
  other:                 'Other Credit',
};

const CREDIT_CAT_ICONS: Record<string, string> = {
  charges_collected:     '💳',
  incentive_payout:      '🏆',
  security_amt_taken:    '🔒',
  premium_number_payout: '⭐',
  sales_payout:          '📈',
  service_payout:        '🔧',
  other:                 '➕',
};

const CAT_LABELS: Record<string,string> = {
  tea_refreshments:'Tea & Refreshments', stationary:'Stationary', rent:'Rent',
  electricity:'Electricity', internet:'Internet', salary:'Salary',
  miscellaneous:'Miscellaneous', other:'Other',
  travel:'Travel', food:'Food', printing:'Printing',
};

const CAT_ICONS: Record<string,string> = {
  tea_refreshments:'☕', stationary:'📝', travel:'🚗', food:'🍱',
  internet:'📶', printing:'🖨️', miscellaneous:'📦', other:'➕',
  rent:'🏠', electricity:'⚡', salary:'💰',
};

const EMPTY_OFFICE_FORM = {
  category: 'tea_refreshments',
  custom_category: '',
  amount: '',
  description: '',
  expense_date: new Date().toISOString().split('T')[0],
};

const EMPTY_CREDIT_FORM = {
  category: 'charges_collected' as CreditCat,
  custom_category: '',
  amount: '',
  description: '',
  credit_date: new Date().toISOString().split('T')[0],
  reference: '',
};

const StatusBadge = ({ s }: { s: string }) => {
  const c: Record<string,string> = {
    pending:  'bg-yellow-100 text-yellow-800 border-yellow-200',
    approved: 'bg-green-100 text-green-800 border-green-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
  };
  const ic: Record<string,string> = { pending:'🟡', approved:'✅', rejected:'❌' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${c[s] || ''}`}>
      {ic[s]} {s}
    </span>
  );
};

interface BudgetEntry {
  id?: string;
  user_id: string;
  monthly_limit: number;
  note: string;
}

// ── Formatting helpers ─────────────────────────────────────────────────────
/** Show expense amount always as negative (red) */
const fmtExpense = (amt: number) =>
  amt === 0 ? '₹0' : `-₹${Math.abs(amt).toFixed(0)}`;

/** Show credit amount always as positive (green) */
const fmtCredit = (amt: number) =>
  amt === 0 ? '₹0' : `+₹${Math.abs(amt).toFixed(0)}`;

/** Profit/loss: positive = profit (green +), negative = loss (red -) */
const fmtProfit = (amt: number) =>
  amt >= 0 ? `+₹${amt.toFixed(0)}` : `-₹${Math.abs(amt).toFixed(0)}`;

// ── Main ─────────────────────────────────────────────────────────────────────
const ExpensesPage: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab]         = useState<TabType>('Overview');
  const [loading, setLoading] = useState(true);

  // Data
  const [fieldExp,     setFieldExp]     = useState<any[]>([]);
  const [empExp,       setEmpExp]       = useState<any[]>([]);
  const [officeExp,    setOfficeExp]    = useState<any[]>([]);
  const [adminCredits, setAdminCredits] = useState<any[]>([]);
  const [empMap,       setEmpMap]       = useState<Record<string,string>>({});
  const [leadMap,      setLeadMap]      = useState<Record<string,string>>({});
  const [kmRate,       setKmRate]       = useState(5);
  const [kmRateInput,  setKmRateInput]  = useState('5');

  // Budget
  const [budgets,      setBudgets]      = useState<Record<string, BudgetEntry>>({});
  const [budgetForm,   setBudgetForm]   = useState<Record<string, string>>({});
  const [budgetNotes,  setBudgetNotes]  = useState<Record<string, string>>({});
  const [savingBudget, setSavingBudget] = useState<string | null>(null);
  const [employees,    setEmployees]    = useState<any[]>([]);

  // Filters
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [empFilter, setEmpFilter] = useState('all');
  const [monthView, setMonthView] = useState(() => new Date().toISOString().slice(0,7));

  // Modals
  const [rejectTarget,  setRejectTarget]  = useState<any>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [deleteTarget,  setDeleteTarget]  = useState<any>(null);
  const [editFieldItem, setEditFieldItem] = useState<any>(null);
  const [isOfficeOpen,  setIsOfficeOpen]  = useState(false);
  const [officeForm,    setOfficeForm]    = useState(EMPTY_OFFICE_FORM);
  const [editOfficeId,  setEditOfficeId]  = useState<string|null>(null);
  const [isCreditOpen,  setIsCreditOpen]  = useState(false);
  const [creditForm,    setCreditForm]    = useState(EMPTY_CREDIT_FORM);
  const [editCreditId,  setEditCreditId]  = useState<string|null>(null);
  const [saving,        setSaving]        = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [feRes, oeRes, upRes, setRes, budgetRes, eeRes, acRes] = await Promise.all([
        supabase.from('field_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('office_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('user_profiles').select('id,name,role').eq('is_active', true),
        supabase.from('app_settings').select('value').eq('key','km_rate_per_km').single(),
        supabase.from('expense_budgets').select('*'),
        supabase.from('employee_expenses').select('*').order('expense_date', { ascending: false }),
        // admin_credits table — created by the SQL migration below
        supabase.from('admin_credits').select('*').order('credit_date', { ascending: false }),
      ]);

      const em: Record<string,string> = {};
      (upRes.data||[]).forEach((u:any) => { em[u.id] = u.name; });
      setEmpMap(em);
      setEmployees(upRes.data || []);

      const leadIds = [...new Set((feRes.data||[]).map((e:any) => e.lead_id).filter(Boolean))];
      let lm: Record<string,string> = {};
      if (leadIds.length > 0) {
        const { data: leadsData } = await supabase.from('leads').select('id,name').in('id', leadIds);
        (leadsData||[]).forEach((l:any) => { lm[l.id] = l.name; });
      }
      setLeadMap(lm);

      setFieldExp(feRes.data || []);
      setEmpExp(eeRes.data || []);
      setOfficeExp(oeRes.data || []);
      setAdminCredits(acRes.data || []);

      const rate = parseFloat(setRes.data?.value || '5') || 5;
      setKmRate(rate);
      setKmRateInput(String(rate));

      if (budgetRes.data) {
        const bm: Record<string, BudgetEntry> = {};
        const bf: Record<string, string> = {};
        const bn: Record<string, string> = {};
        (budgetRes.data||[]).forEach((b:any) => {
          bm[b.user_id] = b;
          bf[b.user_id] = String(b.monthly_limit);
          bn[b.user_id] = b.note || '';
        });
        setBudgets(bm);
        setBudgetForm(bf);
        setBudgetNotes(bn);
      }
    } catch (e: any) {
      toast.error('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Pending count ──────────────────────────────────────────────────────────
  const pendingCount = useMemo(() =>
    fieldExp.filter(e => e.status === 'pending').length +
    empExp.filter(e => e.status === 'pending').length,
    [fieldExp, empExp]);

  const thisMonth = new Date().toISOString().slice(0, 7);

  // ── Month summaries ────────────────────────────────────────────────────────
  // Expense = always positive number internally, displayed as negative
  // Credit  = always positive number internally, displayed as positive
  // Profit  = credit - expense (positive = profit, negative = loss)
  const computeSummary = useCallback((month: string) => {
    const af = fieldExp.filter(e => e.status === 'approved' && e.expense_date?.startsWith(month));
    const oe = officeExp.filter(e => e.expense_date?.startsWith(month));
    const ae = empExp.filter(e => e.status === 'approved' && e.expense_date?.startsWith(month));
    const ac = adminCredits.filter(e => e.credit_date?.startsWith(month));

    const fieldConv    = af.reduce((s,e) => s + (Number(e.conveyance_amount)||0), 0);
    const fieldCredit  = af.reduce((s,e) => s + (Number(e.credit_total)||0), 0);
    const km           = af.reduce((s,e) => s + (Number(e.kilometres)||0), 0);
    const officeTotal  = oe.reduce((s,e) => s + (Number(e.amount)||0), 0);
    const empTotal     = ae.reduce((s,e) => s + (Number(e.amount)||0), 0);
    const adminCrTotal = ac.reduce((s,e) => s + (Number(e.amount)||0), 0);

    const totalExpense = fieldConv + officeTotal + empTotal;  // always positive
    const totalCredit  = fieldCredit + adminCrTotal;          // always positive
    const profit       = totalCredit - totalExpense;           // positive=profit, negative=loss

    return {
      fieldConv, fieldCredit, km,
      office: officeTotal + empTotal,
      adminCrTotal,
      totalExpense,
      totalCredit,
      profit,
    };
  }, [fieldExp, officeExp, empExp, adminCredits]);

  const summary      = useMemo(() => computeSummary(thisMonth), [computeSummary, thisMonth]);
  const monthSummary = useMemo(() => computeSummary(monthView), [computeSummary, monthView]);

  const allMonths = useMemo(() => {
    const months = new Set([
      ...fieldExp.map(e => e.expense_date?.slice(0,7)).filter(Boolean),
      ...officeExp.map(e => e.expense_date?.slice(0,7)).filter(Boolean),
      ...empExp.map(e => e.expense_date?.slice(0,7)).filter(Boolean),
      ...adminCredits.map(e => e.credit_date?.slice(0,7)).filter(Boolean),
    ]);
    return [...months].sort().reverse();
  }, [fieldExp, officeExp, empExp, adminCredits]);

  const filteredField = useMemo(() => fieldExp.filter(e => {
    if (empFilter !== 'all' && e.field_boy_id !== empFilter) return false;
    if (dateFrom && e.expense_date < dateFrom) return false;
    if (dateTo   && e.expense_date > dateTo)   return false;
    return true;
  }), [fieldExp, empFilter, dateFrom, dateTo]);

  // ── Ledger: expense rows = negative, credit rows = positive ───────────────
  const ledger = useMemo(() => {
    type LedgerRow = {
      date: string;
      source: string;
      person: string;
      desc: string;
      km: number;
      expense: number;   // always positive amount (will be displayed as negative)
      credit: number;    // always positive amount (will be displayed as positive)
      net: number;       // credit - expense (negative = net cost, positive = net income)
      running: number;
    };

    const rows: Omit<LedgerRow, 'net'|'running'>[] = [
      ...fieldExp
        .filter(e => e.status === 'approved')
        .map(e => ({
          date:    e.expense_date,
          source:  'Field',
          person:  empMap[e.field_boy_id] || '—',
          desc:    leadMap[e.lead_id] || e.description || 'Ad-hoc',
          km:      Number(e.kilometres)||0,
          expense: Number(e.conveyance_amount)||0,
          credit:  Number(e.credit_total)||0,
        })),
      ...officeExp.map(e => ({
        date:    e.expense_date,
        source:  'Office',
        person:  CAT_LABELS[e.category] || e.custom_category || e.category,
        desc:    e.description,
        km:      0,
        expense: Number(e.amount)||0,
        credit:  0,
      })),
      ...empExp
        .filter(e => e.status === 'approved')
        .map(e => ({
          date:    e.expense_date,
          source:  'Employee',
          person:  empMap[e.user_id] || '—',
          desc:    `${CAT_LABELS[e.category] || e.custom_category || e.category} — ${e.description}`,
          km:      0,
          expense: Number(e.amount)||0,
          credit:  0,
        })),
      ...adminCredits.map(e => ({
        date:    e.credit_date,
        source:  'Credit',
        person:  CREDIT_CAT_LABELS[e.category] || e.category,
        desc:    e.description || e.reference || '',
        km:      0,
        expense: 0,
        credit:  Number(e.amount)||0,
      })),
    ].sort((a,b) => (a.date < b.date ? -1 : 1)); // asc: oldest first → correct running balance

    // Calculate oldest→newest so final row = true cumulative total
    let running = 0;
    const withBalance = rows.map(r => {
      const net = r.credit - r.expense;
      running += net;
      return { ...r, net, running } as LedgerRow;
    });
    // Reverse for UI: show newest first (standard ledger view)
    return withBalance.reverse();
  }, [fieldExp, officeExp, empExp, adminCredits, empMap, leadMap]);

  // ── Per-employee budget usage this month (field + employee expenses) ───────
  const empBudgetUsage = useMemo(() => {
    const usage: Record<string, number> = {};

    // Field expenses
    fieldExp
      .filter(e => e.status !== 'rejected' && e.expense_date?.startsWith(thisMonth))
      .forEach(e => {
        const id = e.field_boy_id;
        usage[id] = (usage[id] || 0) + (Number(e.conveyance_amount) || 0);
      });

    // Employee expenses (approved + pending count toward budget)
    empExp
      .filter(e => e.status !== 'rejected' && e.expense_date?.startsWith(thisMonth))
      .forEach(e => {
        const id = e.user_id;
        usage[id] = (usage[id] || 0) + (Number(e.amount) || 0);
      });

    return usage;
  }, [fieldExp, empExp, thisMonth]);

  // ── Save budget for employee ───────────────────────────────────────────────
  const saveBudget = async (empId: string) => {
    const limit = parseFloat(budgetForm[empId] || '0');
    if (!limit || limit < 0) { toast.error('Enter a valid budget amount'); return; }
    setSavingBudget(empId);
    try {
      const payload = {
        user_id: empId,
        monthly_limit: limit,
        note: budgetNotes[empId] || '',
        updated_by: user!.id,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('expense_budgets').upsert(payload, { onConflict: 'user_id' });
      if (error) {
        if (error.code === '42P01') {
          toast.error('Budget table not found. Run the SQL migration first.', { duration: 6000 });
        } else {
          throw error;
        }
        return;
      }
      setBudgets(prev => ({ ...prev, [empId]: { ...payload } }));
      toast.success(`Budget set for ${empMap[empId] || 'employee'}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingBudget(null);
    }
  };

  // ── Approve ────────────────────────────────────────────────────────────────
  const handleApprove = async (id: string, sourceTable: string = 'field_expenses') => {
    try {
      const { error } = await supabase.from(sourceTable).update({
        status: 'approved',
        approved_by: user!.id,
        approved_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      toast.success('Approved ✅');
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectComment.trim()) { toast.error('Enter a reason'); return; }
    const sourceTable = rejectTarget.sourceTable || 'field_expenses';
    try {
      const { error } = await supabase.from(sourceTable).update({
        status: 'rejected',
        admin_comment: rejectComment.trim(),
      }).eq('id', rejectTarget.id);
      if (error) throw error;
      toast.success('Rejected');
      setRejectTarget(null);
      setRejectComment('');
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from(deleteTarget.table).delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Deleted');
      setDeleteTarget(null);
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const saveOffice = async () => {
    if (!officeForm.amount || parseFloat(officeForm.amount) <= 0) { toast.error('Amount required'); return; }
    if (!officeForm.description.trim()) { toast.error('Description required'); return; }
    if (!officeForm.expense_date) { toast.error('Date required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        category: officeForm.category,
        custom_category: officeForm.category === 'other' ? (officeForm.custom_category || null) : null,
        amount: parseFloat(officeForm.amount),
        description: officeForm.description.trim(),
        expense_date: officeForm.expense_date,
        added_by: user!.id,
        updated_at: new Date().toISOString(),
      };
      const { error } = editOfficeId
        ? await supabase.from('office_expenses').update(payload).eq('id', editOfficeId)
        : await supabase.from('office_expenses').insert(payload);
      if (error) throw error;
      toast.success(editOfficeId ? 'Updated' : 'Added');
      setIsOfficeOpen(false);
      setEditOfficeId(null);
      setOfficeForm(EMPTY_OFFICE_FORM);
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // ── Save admin credit ──────────────────────────────────────────────────────
  const saveCredit = async () => {
    if (!creditForm.amount || parseFloat(creditForm.amount) <= 0) { toast.error('Amount required'); return; }
    if (!creditForm.description.trim()) { toast.error('Description required'); return; }
    if (!creditForm.credit_date) { toast.error('Date required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        category: creditForm.category,
        custom_category: creditForm.category === 'other' ? (creditForm.custom_category || null) : null,
        amount: parseFloat(creditForm.amount),
        description: creditForm.description.trim(),
        credit_date: creditForm.credit_date,
        reference: creditForm.reference.trim() || null,
        added_by: user!.id,
        updated_at: new Date().toISOString(),
      };
      const { error } = editCreditId
        ? await supabase.from('admin_credits').update(payload).eq('id', editCreditId)
        : await supabase.from('admin_credits').insert(payload);
      if (error) {
        if (error.code === '42P01') {
          toast.error('admin_credits table not found. Run the SQL migration first.', { duration: 8000 });
        } else throw error;
        return;
      }
      toast.success(editCreditId ? 'Credit Updated ✅' : 'Credit Added ✅');
      setIsCreditOpen(false);
      setEditCreditId(null);
      setCreditForm(EMPTY_CREDIT_FORM);
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const saveFieldEdit = async () => {
    if (!editFieldItem) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('field_expenses').update({
        expense_date:      editFieldItem.expense_date,
        kilometres:        parseFloat(editFieldItem.kilometres) || 0,
        conveyance_amount: parseFloat(editFieldItem.conveyance_amount) || 0,
        credit_total:      parseFloat(editFieldItem.credit_total) || 0,
        status:            editFieldItem.status,
        admin_comment:     editFieldItem.admin_comment || null,
        notes:             editFieldItem.notes || null,
        updated_at:        new Date().toISOString(),
      }).eq('id', editFieldItem.id);
      if (error) throw error;
      toast.success('Updated');
      setEditFieldItem(null);
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const saveKmRate = async () => {
    const r = parseFloat(kmRateInput);
    if (!r || r <= 0) { toast.error('Enter a valid rate'); return; }
    const { error } = await supabase.from('app_settings').upsert({
      key: 'km_rate_per_km', value: String(r),
      updated_by: user!.id, updated_at: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    setKmRate(r);
    toast.success(`Rate set to ₹${r}/km`);
  };

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const fe = fieldExp.map(e => ({
      Date: e.expense_date,
      'Field Boy': empMap[e.field_boy_id] || e.field_boy_id,
      Customer: leadMap[e.lead_id] || e.description || 'Ad-hoc',
      'Closure Type': e.closure_type,
      KM: e.kilometres,
      'Conveyance (Expense) ₹': `-${e.conveyance_amount}`,
      'Credit ₹': `+${e.credit_total || 0}`,
      Status: e.status,
      'Admin Comment': e.admin_comment || '',
      Notes: e.notes || '',
    }));
    const oe = officeExp.map(e => ({
      Date: e.expense_date,
      Category: CAT_LABELS[e.category] || e.custom_category,
      'Amount (Expense) ₹': `-${e.amount}`,
      Description: e.description,
      'Added By': empMap[e.added_by] || e.added_by,
    }));
    const ac = adminCredits.map(e => ({
      Date: e.credit_date,
      Category: CREDIT_CAT_LABELS[e.category] || e.category,
      'Amount (Credit) ₹': `+${e.amount}`,
      Description: e.description,
      Reference: e.reference || '',
      'Added By': empMap[e.added_by] || e.added_by,
    }));
    const ee = empExp.map(e => ({
      Date: e.expense_date,
      Employee: empMap[e.user_id] || e.user_id,
      Category: CAT_LABELS[e.category] || e.custom_category || e.category,
      'Amount (Expense) ₹': `-${e.amount}`,
      Description: e.description,
      Status: e.status,
      'Admin Comment': e.admin_comment || '',
    }));
    const ledgerAsc = ledger.slice().reverse();
    let runBal = 0;
    const ledgerExport = ledgerAsc.map(r => {
      runBal += r.net;
      return {
        Date: r.date, Source: r.source, Person: r.person, Description: r.desc,
        'Expense ₹':  r.expense > 0 ? `-${r.expense.toFixed(0)}` : '',
        'Credit ₹':   r.credit  > 0 ? `+${r.credit.toFixed(0)}`  : '',
        'Line P&L ₹': r.net >= 0    ? `+${r.net.toFixed(0)}`     : `${r.net.toFixed(0)}`,
        'Balance ₹':  runBal >= 0   ? `+${runBal.toFixed(0)}`    : `${runBal.toFixed(0)}`,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fe.length ? fe : [{ info: 'No data' }]), 'Field Expenses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(oe.length ? oe : [{ info: 'No data' }]), 'Office Expenses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ee.length ? ee : [{ info: 'No data' }]), 'Employee Expenses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ac.length ? ac : [{ info: 'No data' }]), 'Admin Credits');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ledgerExport.length ? ledgerExport : [{ info: 'No data' }]), 'Ledger');
    XLSX.writeFile(wb, `Expenses_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Excel downloaded (5 sheets)');
  };

  // ── FieldExpRow ────────────────────────────────────────────────────────────
  const FieldRow = ({ exp, showActions = true }: { exp: any; showActions?: boolean; key?: any }) => {
    const budget = budgets[exp.field_boy_id];
    const used   = empBudgetUsage[exp.field_boy_id] || 0;
    const overBudget = budget && used > budget.monthly_limit;
    const hasCredit = Number(exp.credit_total) > 0;

    return (
      <div className="p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{empMap[exp.field_boy_id] || '—'}</span>
            <StatusBadge s={exp.status} />
            {exp.closure_type && (
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded capitalize">{exp.closure_type}</span>
            )}
            {overBudget && (
              <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-bold">
                ⚠️ Over Budget
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">{leadMap[exp.lead_id] || exp.description || 'Ad-hoc expense'}</p>
          <div className="flex gap-3 flex-wrap text-xs items-center">
            <span className="text-slate-500">{exp.expense_date}</span>
            <span className="text-blue-600 font-medium">{exp.kilometres} km</span>
            {/* Expense always negative/red */}
            <span className="text-red-600 font-bold">{fmtExpense(Number(exp.conveyance_amount))}</span>
            {/* Credit always positive/green */}
            {hasCredit && (
              <span className="text-green-600 font-bold">{fmtCredit(Number(exp.credit_total))}</span>
            )}
            {exp.notes && <span className="text-slate-400 italic">{exp.notes}</span>}
          </div>
          {/* Per-line profit/loss */}
          {(Number(exp.conveyance_amount) > 0 || hasCredit) && (
            <div className="text-[10px] font-semibold mt-0.5">
              {(() => {
                const lineNet = (Number(exp.credit_total)||0) - (Number(exp.conveyance_amount)||0);
                return (
                  <span className={lineNet >= 0 ? 'text-green-600' : 'text-red-500'}>
                    {lineNet >= 0 ? '▲ Line Profit' : '▼ Line Loss'}: {fmtProfit(lineNet)}
                  </span>
                );
              })()}
            </div>
          )}
          {exp.admin_comment && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-1.5 mt-1">
              💬 {exp.admin_comment}
            </p>
          )}
        </div>
        {showActions && (
          <div className="flex gap-1 shrink-0">
            {exp.status === 'pending' && (
              <>
                <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => handleApprove(exp.id)}>✅</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200" onClick={() => { setRejectTarget(exp); setRejectComment(''); }}>❌</Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setEditFieldItem({ ...exp })}>
              <Edit className="h-3.5 w-3.5 text-slate-500" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400"
              onClick={() => setDeleteTarget({ id: exp.id, table: 'field_expenses', name: empMap[exp.field_boy_id] || 'expense' })}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold dark:text-white">Expenses & Credits</h1>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1.5" />Export Excel
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}>
            {t}
            {t === 'Pending' && pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="py-16 text-center text-slate-400">Loading...</div>}

      {/* ── OVERVIEW ── */}
      {!loading && tab === 'Overview' && (
        <div className="space-y-4">
          {/* Key metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: 'Total Expenses',
                val: fmtExpense(summary.totalExpense),
                color: 'text-red-600',
                sub: 'Field + Office + Employee',
              },
              {
                label: 'Total Credits',
                val: fmtCredit(summary.totalCredit),
                color: 'text-green-600',
                sub: 'Field credit + Admin credit',
              },
              {
                label: 'Total KM (month)',
                val: `${summary.km.toFixed(1)} km`,
                color: 'text-blue-600',
                sub: 'Approved field trips',
              },
              {
                label: pendingCount > 0 ? 'Pending Approvals' : 'All Clear',
                val: String(pendingCount),
                color: pendingCount > 0 ? 'text-yellow-600' : 'text-green-600',
                sub: 'Awaiting review',
              },
            ].map(({ label, val, color, sub }) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <p className={`text-2xl font-black ${color}`}>{val}</p>
                  <p className="text-xs text-slate-500 mt-1 font-medium">{label}</p>
                  <p className="text-[10px] text-slate-400">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Net profit/loss banner */}
          <div className={`rounded-2xl p-5 border-2 flex items-center justify-between gap-4 flex-wrap ${
            summary.profit >= 0
              ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
              : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-3">
              {summary.profit >= 0
                ? <TrendingUp className="h-8 w-8 text-green-600 shrink-0" />
                : <TrendingDown className="h-8 w-8 text-red-500 shrink-0" />}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">This Month — Net {summary.profit >= 0 ? 'Profit' : 'Loss'}</p>
                <p className="text-xs text-slate-400 mt-0.5">Total Credit − Total Expense</p>
                <p className="text-xs text-slate-400">{fmtCredit(summary.totalCredit)} − ({fmtExpense(summary.totalExpense)})</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-4xl font-black ${summary.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {fmtProfit(summary.profit)}
              </p>
              <p className={`text-xs font-semibold mt-0.5 ${summary.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {summary.profit >= 0 ? '▲ Profitable' : '▼ Loss This Month'}
              </p>
            </div>
          </div>

          {/* Expense breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Expense Breakdown</p>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Field Conveyance</span>
                  <span className="text-red-600 font-bold">{fmtExpense(summary.fieldConv)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Office + Employee</span>
                  <span className="text-red-600 font-bold">{fmtExpense(summary.office)}</span>
                </div>
                <div className="border-t pt-1 flex justify-between text-xs font-bold">
                  <span>Total Expense</span>
                  <span className="text-red-600">{fmtExpense(summary.totalExpense)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Credit Breakdown</p>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Field Credits</span>
                  <span className="text-green-600 font-bold">{fmtCredit(summary.fieldCredit)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Admin Credits</span>
                  <span className="text-green-600 font-bold">{fmtCredit(summary.adminCrTotal)}</span>
                </div>
                <div className="border-t pt-1 flex justify-between text-xs font-bold">
                  <span>Total Credit</span>
                  <span className="text-green-600">{fmtCredit(summary.totalCredit)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* KM Rate */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings className="h-4 w-4" /> KM Rate
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Input type="number" min="1" step="0.5" className="w-24 h-8 text-sm"
                value={kmRateInput} onChange={e => setKmRateInput(e.target.value)} />
              <span className="text-sm text-slate-500">₹/km</span>
              <Button size="sm" variant="outline" onClick={saveKmRate}>Save</Button>
            </CardContent>
          </Card>

          {/* Monthly breakdown table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base">Monthly Breakdown</CardTitle>
                <input type="month" value={monthView}
                  onChange={e => setMonthView(e.target.value)}
                  className="h-8 px-2 text-xs border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Expenses',  val: fmtExpense(monthSummary.totalExpense), color: 'text-red-600' },
                  { label: 'Total Credits',   val: fmtCredit(monthSummary.totalCredit),   color: 'text-green-600' },
                  { label: 'Total KM',        val: `${monthSummary.km.toFixed(1)} km`,    color: 'text-blue-600' },
                  {
                    label: monthSummary.profit >= 0 ? 'Net Profit' : 'Net Loss',
                    val: fmtProfit(monthSummary.profit),
                    color: monthSummary.profit >= 0 ? 'text-green-600' : 'text-red-500',
                  },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
                    <p className={`text-xl font-black ${color}`}>{val}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {allMonths.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs mt-2">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700">
                        {['Month', 'Expense ₹', 'Credit ₹', 'Profit/Loss ₹'].map(h => (
                          <th key={h} className="text-left px-2 py-1.5 text-[10px] font-bold uppercase text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {allMonths.map(m => {
                        const s = computeSummary(m);
                        return (
                          <tr key={m}
                            className={`hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${monthView === m ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                            onClick={() => setMonthView(m)}>
                            <td className="px-2 py-2 font-semibold">{m}</td>
                            {/* Expense always red negative */}
                            <td className="px-2 py-2 text-red-600 font-bold">{fmtExpense(s.totalExpense)}</td>
                            {/* Credit always green positive */}
                            <td className="px-2 py-2 text-green-600 font-bold">{fmtCredit(s.totalCredit)}</td>
                            {/* Profit/Loss */}
                            <td className={`px-2 py-2 font-black ${s.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {fmtProfit(s.profit)}
                              <span className="ml-1 text-[9px] font-normal">{s.profit >= 0 ? '▲ Profit' : '▼ Loss'}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── PENDING ── */}
      {!loading && tab === 'Pending' && (() => {
        const pendingField = fieldExp.filter(e => e.status === 'pending');
        const pendingEmp   = empExp.filter(e => e.status === 'pending');
        const total = pendingField.length + pendingEmp.length;
        return (
          <div className="space-y-4">
            {total === 0 ? (
              <div className="py-16 text-center text-slate-400">No pending approvals 🎉</div>
            ) : (
              <>
                {pendingEmp.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
                      👔 Employee Expenses ({pendingEmp.length})
                    </p>
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700 shadow-sm">
                      {pendingEmp.map(exp => (
                        <div key={exp.id} className="p-4 flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-lg shrink-0">
                            {CAT_ICONS[exp.category] || '📋'}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-slate-900 dark:text-white">
                                {empMap[exp.user_id] || '—'}
                              </span>
                              <span className="text-xs text-slate-600 dark:text-slate-300">
                                {CAT_LABELS[exp.category] || exp.custom_category || exp.category}
                              </span>
                              <StatusBadge s={exp.status} />
                            </div>
                            <p className="text-xs text-slate-500">{exp.description}</p>
                            <div className="flex gap-3 text-xs">
                              <span className="text-slate-400">{exp.expense_date}</span>
                              {/* Expense always red/negative */}
                              <span className="text-red-600 font-bold">{fmtExpense(Number(exp.amount))}</span>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                              onClick={() => handleApprove(exp.id, 'employee_expenses')}>✅</Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-200"
                              onClick={() => { setRejectTarget({ ...exp, sourceTable: 'employee_expenses' }); setRejectComment(''); }}>❌</Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400"
                              onClick={() => setDeleteTarget({ id: exp.id, table: 'employee_expenses', name: `${empMap[exp.user_id] || 'Employee'} expense` })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pendingField.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
                      🚗 Field Boy Expenses ({pendingField.length})
                    </p>
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700 shadow-sm">
                      {pendingField.map(exp => (
                        <FieldRow key={exp.id} exp={exp} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* ── FIELD EXPENSES ── */}
      {!loading && tab === 'Field Expenses' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <Select value={empFilter} onValueChange={setEmpFilter}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All Employees" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">👥 All Employees</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
            <span className="text-xs text-slate-400">to</span>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-36 text-xs" />
            {(dateFrom || dateTo || empFilter !== 'all') && (
              <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-400"
                onClick={() => { setDateFrom(''); setDateTo(''); setEmpFilter('all'); }}>Clear</Button>
            )}
            <div className="ml-auto flex items-center gap-3 text-xs">
              <span className="text-slate-400">{filteredField.length} entries</span>
              {filteredField.length > 0 && (() => {
                const fExp = filteredField.reduce((s,e) => s + (Number(e.conveyance_amount)||0), 0);
                const fCr  = filteredField.filter(e => e.status === 'approved').reduce((s,e) => s + (Number(e.credit_total)||0), 0);
                const fNet = fCr - fExp;
                return (
                  <>
                    <span className="text-red-600 font-bold">-₹{fExp.toFixed(0)}</span>
                    <span className="text-green-600 font-bold">+₹{fCr.toFixed(0)}</span>
                    <span className={`font-black ${fNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fNet >= 0 ? '+' : '-'}₹{Math.abs(fNet).toFixed(0)}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700 shadow-sm">
            {filteredField.length === 0
              ? <div className="py-12 text-center text-slate-400">No expenses found</div>
              : filteredField.map(exp => <FieldRow key={exp.id} exp={exp} />)
            }
          </div>
        </div>
      )}

      {/* ── OFFICE EXPENSES ── */}
      {!loading && tab === 'Office Expenses' && (
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">🏢 Office Expenses (Admin Added)</p>
              <Button size="sm" onClick={() => { setEditOfficeId(null); setOfficeForm(EMPTY_OFFICE_FORM); setIsOfficeOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" />Add Expense
              </Button>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700 shadow-sm">
              {officeExp.length === 0
                ? <div className="py-8 text-center text-slate-400 text-sm">No office expenses yet</div>
                : officeExp.map(exp => (
                  <div key={exp.id} className="p-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg shrink-0">
                      {CAT_ICONS[exp.category] || '📋'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{CAT_LABELS[exp.category] || exp.custom_category || exp.category}</span>
                        {/* Office expenses always shown as negative */}
                        <span className="text-red-600 font-bold text-sm">{fmtExpense(Number(exp.amount))}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{exp.description} · {exp.expense_date} · {empMap[exp.added_by] || '—'}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        setEditOfficeId(exp.id);
                        setOfficeForm({
                          category: exp.category,
                          custom_category: exp.custom_category || '',
                          amount: String(exp.amount),
                          description: exp.description,
                          expense_date: exp.expense_date,
                        });
                        setIsOfficeOpen(true);
                      }}>
                        <Edit className="h-3.5 w-3.5 text-slate-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400"
                        onClick={() => setDeleteTarget({ id: exp.id, table: 'office_expenses', name: 'office expense' })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Office + Employee totals summary */}
          {(officeExp.length > 0 || empExp.length > 0) && (() => {
            const officeTotal = officeExp.reduce((s,e) => s + (Number(e.amount)||0), 0);
            const empApproved = empExp.filter(e => e.status === 'approved').reduce((s,e) => s + (Number(e.amount)||0), 0);
            const empPending  = empExp.filter(e => e.status === 'pending').reduce((s,e) => s + (Number(e.amount)||0), 0);
            return (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Office Total</p>
                  <p className="text-lg font-black text-red-600">-₹{officeTotal.toFixed(0)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Emp Approved</p>
                  <p className="text-lg font-black text-red-600">-₹{empApproved.toFixed(0)}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Emp Pending</p>
                  <p className="text-lg font-black text-amber-600">₹{empPending.toFixed(0)}</p>
                </div>
              </div>
            );
          })()}

          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">👔 Employee Submitted Expenses</p>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700 shadow-sm">
              {empExp.length === 0
                ? <div className="py-8 text-center text-slate-400 text-sm">No employee expenses yet</div>
                : empExp.map(exp => (
                  <div key={exp.id} className="p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-lg shrink-0">
                      {CAT_ICONS[exp.category] || '📋'}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{empMap[exp.user_id] || '—'}</span>
                        <span className="text-xs text-slate-500">{CAT_LABELS[exp.category] || exp.custom_category || exp.category}</span>
                        <StatusBadge s={exp.status} />
                      </div>
                      <p className="text-xs text-slate-500">{exp.description}</p>
                      <div className="flex gap-3 text-xs">
                        <span className="text-slate-400">{exp.expense_date}</span>
                        {/* Always negative */}
                        <span className="text-red-600 font-bold">{fmtExpense(Number(exp.amount))}</span>
                      </div>
                      {exp.admin_comment && (
                        <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 rounded p-1.5 mt-1">
                          💬 {exp.admin_comment}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {exp.status === 'pending' && (
                        <>
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                            onClick={() => handleApprove(exp.id, 'employee_expenses')}>✅</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-200"
                            onClick={() => { setRejectTarget({ ...exp, sourceTable: 'employee_expenses' }); setRejectComment(''); }}>❌</Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400"
                        onClick={() => setDeleteTarget({ id: exp.id, table: 'employee_expenses', name: `${empMap[exp.user_id] || 'Employee'} expense` })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ── ADMIN CREDITS ── */}
      {!loading && tab === 'Credits' && (
        <div className="space-y-4">
          {/* Info box */}
          <div className="rounded-xl bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800 p-4">
            <div className="flex items-start gap-3">
              <BadgeIndianRupee className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">Admin Credits — Incoming Money</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  Record all money received by the company — charges collected, incentives, security deposits, payouts, etc.
                  These are always shown as <strong>positive (+)</strong> and contribute to profit.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                💰 Credits Added ({adminCredits.length})
              </p>
              {adminCredits.length > 0 && (() => {
                const monthTotal = adminCredits.filter(c => c.credit_date?.startsWith(thisMonth)).reduce((s,c) => s + (Number(c.amount)||0), 0);
                const allTotal   = adminCredits.reduce((s,c) => s + (Number(c.amount)||0), 0);
                return (
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-xs text-green-600 font-bold">This month: +₹{monthTotal.toFixed(0)}</span>
                    <span className="text-xs text-slate-400">All time: +₹{allTotal.toFixed(0)}</span>
                  </div>
                );
              })()}
            </div>
            <Button size="sm" onClick={() => { setEditCreditId(null); setCreditForm(EMPTY_CREDIT_FORM); setIsCreditOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />Add Credit
            </Button>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700 shadow-sm">
            {adminCredits.length === 0
              ? <div className="py-12 text-center text-slate-400 text-sm">No credits added yet. Click "Add Credit" to record incoming money.</div>
              : adminCredits.map(cr => (
                <div key={cr.id} className="p-4 flex items-start gap-4">
                  <div className="w-9 h-9 rounded-xl bg-green-50 dark:bg-green-950/30 flex items-center justify-center text-lg shrink-0">
                    {CREDIT_CAT_ICONS[cr.category] || '💰'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{CREDIT_CAT_LABELS[cr.category] || cr.category}</span>
                      {/* Credit always green positive */}
                      <span className="text-green-600 font-bold text-sm">{fmtCredit(Number(cr.amount))}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{cr.description}</p>
                    <div className="flex gap-3 text-[10px] text-slate-400 mt-1 flex-wrap">
                      <span>📅 {cr.credit_date}</span>
                      {cr.reference && <span>🔖 {cr.reference}</span>}
                      <span>👤 {empMap[cr.added_by] || '—'}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                      setEditCreditId(cr.id);
                      setCreditForm({
                        category: cr.category,
                        custom_category: cr.custom_category || '',
                        amount: String(cr.amount),
                        description: cr.description || '',
                        credit_date: cr.credit_date,
                        reference: cr.reference || '',
                      });
                      setIsCreditOpen(true);
                    }}>
                      <Edit className="h-3.5 w-3.5 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400"
                      onClick={() => setDeleteTarget({ id: cr.id, table: 'admin_credits', name: 'credit entry' })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── LEDGER ── */}
      {!loading && tab === 'Ledger' && (() => {
        const filteredLedger = ledger; // All entries — month filtering via allMonths select
        return (
        <div className="space-y-3">
          {/* Filter + Legend */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-3 text-xs flex-1 flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>Expense</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>Credit</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>Balance</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {['Date','Source','Person / Category','Description','KM','Expense ₹','Credit ₹','Line P&L','Balance ₹'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredLedger.length === 0
                  ? <tr><td colSpan={9} className="py-12 text-center text-slate-400">No approved entries</td></tr>
                  : filteredLedger.map((r, i) => (
                    <tr key={i} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${r.source === 'Credit' ? 'bg-green-50/30 dark:bg-green-950/10' : ''}`}>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{r.date}</td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-bold',
                          r.source === 'Field'    ? 'bg-blue-100 text-blue-700' :
                          r.source === 'Employee' ? 'bg-violet-100 text-violet-700' :
                          r.source === 'Credit'   ? 'bg-green-100 text-green-700' :
                                                    'bg-slate-100 text-slate-600'
                        )}>
                          {r.source}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium">{r.person}</td>
                      <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate">{r.desc}</td>
                      <td className="px-3 py-2 text-blue-600">{r.km > 0 ? r.km : '—'}</td>
                      {/* Expense: always red, always with minus */}
                      <td className="px-3 py-2 text-red-600 font-semibold">
                        {r.expense > 0 ? fmtExpense(r.expense) : '—'}
                      </td>
                      {/* Credit: always green, always with plus */}
                      <td className="px-3 py-2 text-green-600 font-semibold">
                        {r.credit > 0 ? fmtCredit(r.credit) : '—'}
                      </td>
                      {/* Net: per-line profit/loss */}
                      <td className="px-3 py-2 font-bold">
                        {r.net === 0
                          ? <span className="text-slate-400">—</span>
                          : r.net > 0
                            ? <span className="text-green-600">{fmtCredit(r.net)}</span>
                            : <span className="text-red-500">{fmtExpense(Math.abs(r.net))}</span>
                        }
                      </td>
                      {/* Running balance: positive=profit so far, negative=loss so far */}
                      <td className={`px-3 py-2 font-black ${r.running >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {r.running >= 0 ? fmtCredit(r.running) : fmtExpense(Math.abs(r.running))}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
              {filteredLedger.length > 0 && (() => {
                const last = filteredLedger[filteredLedger.length - 1];
                const totExp = filteredLedger.reduce((s,r) => s + r.expense, 0);
                const totCr  = filteredLedger.reduce((s,r) => s + r.credit, 0);
                return (
                  <tfoot className="border-t-2 border-slate-300 bg-slate-100 dark:bg-slate-900">
                    <tr>
                      <td colSpan={5} className="px-3 py-2 font-bold text-xs">TOTALS</td>
                      <td className="px-3 py-2 font-black text-red-600 text-xs">
                        {fmtExpense(totExp)}
                      </td>
                      <td className="px-3 py-2 font-black text-green-600 text-xs">
                        {fmtCredit(totCr)}
                      </td>
                      <td className="px-3 py-2 text-xs"></td>
                      <td className={`px-3 py-2 font-black text-xs ${last.running >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {last.running >= 0 ? fmtCredit(last.running) : fmtExpense(Math.abs(last.running))}
                        <span className="ml-1 text-[9px]">{last.running >= 0 ? '▲ Profit' : '▼ Loss'}</span>
                      </td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </div>
        );
      })()}

      {/* ── BUDGET MANAGEMENT ── */}
      {!loading && tab === 'Budget' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5 text-blue-500" />
                Employee Monthly Expense Budgets
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Set per-employee monthly limits. Budget usage includes both field conveyance and employee submitted expenses.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {employees.length === 0 ? (
                <p className="text-slate-400 text-sm py-4 text-center">No employees found</p>
              ) : (
                employees.map(emp => {
                  const budget     = budgets[emp.id];
                  const used       = empBudgetUsage[emp.id] || 0;
                  const limit      = budget?.monthly_limit || 0;
                  const pct        = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                  const overBudget = limit > 0 && used > limit;
                  const hasLimit   = limit > 0;

                  return (
                    <div key={emp.id} className={cn(
                      "p-4 rounded-xl border space-y-3",
                      overBudget
                        ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    )}>
                      {/* Employee header */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold">
                            {emp.name.split(' ').map((n:string) => n[0]).join('').toUpperCase().slice(0,2)}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{emp.name}</p>
                            <p className="text-[10px] text-slate-400 capitalize">{emp.role?.replace('_',' ')}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {/* Used always shown as negative (expense) */}
                          <p className={cn("text-sm font-bold", overBudget ? "text-red-600" : "text-slate-700 dark:text-slate-300")}>
                            {fmtExpense(used)} used
                          </p>
                          {hasLimit && (
                            <p className="text-[10px] text-slate-400">of ₹{limit.toFixed(0)} limit</p>
                          )}
                          {!hasLimit && (
                            <p className="text-[10px] text-amber-500 font-medium">No limit set</p>
                          )}
                        </div>
                      </div>

                      {/* Progress bar — only show when limit is set */}
                      {hasLimit && (
                        <div className="space-y-1">
                          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", overBudget ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className={cn("text-[10px] font-medium", overBudget ? "text-red-600" : "text-slate-400")}>
                            {overBudget
                              ? `⚠️ Over budget by ₹${(used - limit).toFixed(0)}`
                              : `${pct.toFixed(0)}% of ₹${limit.toFixed(0)} limit used`}
                          </p>
                        </div>
                      )}

                      {/* Budget form */}
                      <div className="flex gap-2 flex-wrap items-end">
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Monthly Limit ₹</label>
                          <Input
                            type="number" min="0" step="100"
                            placeholder="e.g. 5000"
                            className="h-9 text-sm"
                            value={budgetForm[emp.id] || ''}
                            onChange={e => setBudgetForm(prev => ({ ...prev, [emp.id]: e.target.value }))}
                          />
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Note</label>
                          <Input
                            placeholder="Optional note"
                            className="h-9 text-sm"
                            value={budgetNotes[emp.id] || ''}
                            onChange={e => setBudgetNotes(prev => ({ ...prev, [emp.id]: e.target.value }))}
                          />
                        </div>
                        <Button
                          size="sm"
                          className="h-9 shrink-0"
                          onClick={() => saveBudget(emp.id)}
                          disabled={savingBudget === emp.id}
                        >
                          {savingBudget === emp.id ? 'Saving...' : budget ? 'Update Limit' : 'Set Budget'}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Reject */}
      <Dialog open={!!rejectTarget} onOpenChange={v => { if (!v) { setRejectTarget(null); setRejectComment(''); }}}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle className="text-red-600">Reject Expense</DialogTitle></DialogHeader>
          <div className="py-3 space-y-2">
            <p className="text-sm text-slate-600">Rejection reason (shown to employee/field boy):</p>
            <textarea
              className="w-full min-h-[80px] rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              value={rejectComment}
              onChange={e => setRejectComment(e.target.value)}
              autoFocus
              placeholder="e.g. KM amount seems incorrect, please resubmit"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Confirm Delete
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">Delete this {deleteTarget?.name}? This cannot be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Office Expense */}
      <Dialog open={isOfficeOpen} onOpenChange={v => { if (!v) { setIsOfficeOpen(false); setEditOfficeId(null); setOfficeForm(EMPTY_OFFICE_FORM); }}}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editOfficeId ? 'Edit' : 'Add'} Office Expense</DialogTitle>
            <DialogDescription>This will be counted as a <strong className="text-red-600">negative expense</strong>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Category *</label>
              <Select value={officeForm.category} onValueChange={v => setOfficeForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OFFICE_CATS.map(c => <SelectItem key={c} value={c}>{CAT_LABELS[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {officeForm.category === 'other' && (
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Custom Category *</label>
                <Input
                  value={officeForm.custom_category}
                  onChange={e => setOfficeForm(p => ({ ...p, custom_category: e.target.value }))}
                  placeholder="e.g. Vehicle Maintenance"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Amount ₹ *</label>
                <Input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={officeForm.amount}
                  onChange={e => setOfficeForm(p => ({ ...p, amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Date *</label>
                <Input
                  type="date"
                  value={officeForm.expense_date}
                  onChange={e => setOfficeForm(p => ({ ...p, expense_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Description *</label>
              <Input
                placeholder="e.g. Monthly office rent"
                value={officeForm.description}
                onChange={e => setOfficeForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsOfficeOpen(false); setEditOfficeId(null); setOfficeForm(EMPTY_OFFICE_FORM); }}>
              Cancel
            </Button>
            <Button onClick={saveOffice} disabled={saving}>
              {saving ? 'Saving...' : editOfficeId ? 'Update' : 'Add Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Admin Credit */}
      <Dialog open={isCreditOpen} onOpenChange={v => { if (!v) { setIsCreditOpen(false); setEditCreditId(null); setCreditForm(EMPTY_CREDIT_FORM); }}}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-green-700">{editCreditId ? 'Edit' : 'Add'} Credit Entry</DialogTitle>
            <DialogDescription>This will be counted as <strong className="text-green-600">positive credit (+)</strong> and improve profit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Credit Type *</label>
              <Select value={creditForm.category} onValueChange={v => setCreditForm(p => ({ ...p, category: v as CreditCat }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CREDIT_CATS.map(c => (
                    <SelectItem key={c} value={c}>
                      {CREDIT_CAT_ICONS[c]} {CREDIT_CAT_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {creditForm.category === 'other' && (
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Custom Label *</label>
                <Input
                  value={creditForm.custom_category}
                  onChange={e => setCreditForm(p => ({ ...p, custom_category: e.target.value }))}
                  placeholder="e.g. Partnership Commission"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Amount ₹ *</label>
                <Input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={creditForm.amount}
                  onChange={e => setCreditForm(p => ({ ...p, amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Date *</label>
                <Input
                  type="date"
                  value={creditForm.credit_date}
                  onChange={e => setCreditForm(p => ({ ...p, credit_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Description *</label>
              <Input
                placeholder="e.g. Charges collected from ABC Apartments"
                value={creditForm.description}
                onChange={e => setCreditForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Reference / Invoice No. (optional)</label>
              <Input
                placeholder="e.g. INV-2025-001 or Customer Name"
                value={creditForm.reference}
                onChange={e => setCreditForm(p => ({ ...p, reference: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsCreditOpen(false); setEditCreditId(null); setCreditForm(EMPTY_CREDIT_FORM); }}>
              Cancel
            </Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={saveCredit} disabled={saving}>
              {saving ? 'Saving...' : editCreditId ? 'Update Credit' : 'Add Credit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Field Expense */}
      <Dialog open={!!editFieldItem} onOpenChange={v => { if (!v) setEditFieldItem(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit Field Expense</DialogTitle>
            <DialogDescription>
              {editFieldItem ? `${empMap[editFieldItem.field_boy_id] || '—'} · ${leadMap[editFieldItem.lead_id] || editFieldItem.description || 'Ad-hoc'}` : ''}
            </DialogDescription>
          </DialogHeader>
          {editFieldItem && (
            <div className="grid grid-cols-2 gap-3 py-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Date</label>
                <Input type="date" value={editFieldItem.expense_date || ''}
                  onChange={e => setEditFieldItem((p: any) => ({ ...p, expense_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">KM</label>
                <Input type="number" min="0" step="0.1" value={editFieldItem.kilometres || ''}
                  onChange={e => setEditFieldItem((p: any) => ({ ...p, kilometres: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Conveyance ₹ (Expense)</label>
                <Input type="number" min="0" value={editFieldItem.conveyance_amount || ''}
                  onChange={e => setEditFieldItem((p: any) => ({ ...p, conveyance_amount: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Credit ₹</label>
                <Input type="number" min="0" value={editFieldItem.credit_total || ''}
                  onChange={e => setEditFieldItem((p: any) => ({ ...p, credit_total: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Status</label>
                <Select value={editFieldItem.status}
                  onValueChange={v => setEditFieldItem((p: any) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">🟡 Pending</SelectItem>
                    <SelectItem value="approved">✅ Approved</SelectItem>
                    <SelectItem value="rejected">❌ Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Admin Comment</label>
                <Input value={editFieldItem.admin_comment || ''}
                  onChange={e => setEditFieldItem((p: any) => ({ ...p, admin_comment: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Notes</label>
                <Input value={editFieldItem.notes || ''}
                  onChange={e => setEditFieldItem((p: any) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditFieldItem(null)}>Cancel</Button>
            <Button onClick={saveFieldEdit} disabled={saving}>{saving ? 'Saving...' : 'Update'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExpensesPage;
