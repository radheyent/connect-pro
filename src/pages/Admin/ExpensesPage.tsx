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
import { CheckCircle, XCircle, Trash2, Edit, Download, Plus, Settings, TrendingUp, TrendingDown, IndianRupee, Users, ShieldAlert, Upload, FileUp, AlertCircle, CheckCircle2, Search, LayoutDashboard, Clock3, Car, Building2, Wallet, FileSpreadsheet, BookOpenText, Sparkles } from 'lucide-react';
import * as XLSX from 'xlsx';

const TABS = ['Overview', 'Pending', 'Field Expenses', 'Office Expenses', 'Credits', 'Bulk Upload', 'Ledger', 'Budget'] as const;
type TabType = typeof TABS[number];

const TAB_ICONS: Record<TabType, React.ElementType> = {
  'Overview':        LayoutDashboard,
  'Pending':         Clock3,
  'Field Expenses':  Car,
  'Office Expenses': Building2,
  'Credits':         Wallet,
  'Bulk Upload':     FileSpreadsheet,
  'Ledger':          BookOpenText,
  'Budget':          IndianRupee,
};

const OFFICE_CATS = [
  'tea_refreshments','stationary','rent',
  'electricity','internet','salary','miscellaneous','other',
];
const CAT_LABELS: Record<string,string> = {
  tea_refreshments: 'Tea & Refreshments',
  stationary:       'Stationary',
  travel:           'Customer Bill Payment',
  food:             'Amt Transfer Customer',
  internet:         'Self Recharge',
  other:            'Other',
  // legacy / office-only
  rent:             'Rent',
  electricity:      'Electricity',
  salary:           'Salary',
  miscellaneous:    'Miscellaneous',
  printing:         'Printing',
};

const CAT_ICONS: Record<string,string> = {
  tea_refreshments:'☕', stationary:'📝', travel:'🚗', food:'🍱',
  internet:'📶', printing:'🖨️', miscellaneous:'📦', other:'➕',
  rent:'🏠', electricity:'⚡', salary:'💰',
};

const EMPTY_OFFICE_FORM = {
  category: '',
  custom_category: '',
  spent_by_name: '',
  amount: '',
  description: '',
  remarks: '',
  expense_date: new Date().toISOString().split('T')[0],
};

// ── Admin Credits — incoming money ──────────────────────────────────────────
const CREDIT_CAT_LABELS: Record<string,string> = {
  charges_collected: '💳 Charges Collected',
  incentive:         '🎁 Incentive',
  security_deposit:  '🔒 Security Deposit',
  payout:            '💵 Payout',
  refund:            '↩️ Refund',
  other:             '➕ Other',
};

const EMPTY_CREDIT_FORM = {
  category: 'charges_collected',
  custom_category: '',
  amount: '',
  description: '',
  credit_date: new Date().toISOString().split('T')[0],
  reference: '',
};

const EMPTY_FIELD_FORM = {
  field_boy_id: '',
  expense_date: new Date().toISOString().split('T')[0],
  kilometres: '',
  conveyance_amount: '',
  credit_total: '',
  description: '',
};

const StatusBadge = ({ s }: { s: string }) => {
  const c: Record<string,string> = {
    pending:  'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    approved: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    rejected: 'bg-rose-50 text-rose-500 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  };
  const ic: Record<string,string> = { pending:'🟡', approved:'✅', rejected:'❌' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border shadow-sm ${c[s] || ''}`}>
      {ic[s]} {s}
    </span>
  );
};

// ── Budget types ──────────────────────────────────────────────────────────────
interface BudgetEntry {
  id?: string;
  user_id: string;
  monthly_limit: number;
  note: string;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const ExpensesPage: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab]         = useState<TabType>('Overview');
  const [loading, setLoading] = useState(true);

  // Data
  const [fieldExp,  setFieldExp]  = useState<any[]>([]);
  const [empExp,    setEmpExp]    = useState<any[]>([]); // employee_expenses
  const [officeExp, setOfficeExp] = useState<any[]>([]);
  const [empMap,    setEmpMap]    = useState<Record<string,string>>({});
  const [leadMap,   setLeadMap]   = useState<Record<string,string>>({});
  const [kmRate,    setKmRate]    = useState(5);
  const [kmRateInput, setKmRateInput] = useState('5');

  // Budget
  const [budgets,    setBudgets]    = useState<Record<string, BudgetEntry>>({});
  const [budgetForm, setBudgetForm] = useState<Record<string, string>>({});
  const [budgetNotes, setBudgetNotes] = useState<Record<string, string>>({});
  const [savingBudget, setSavingBudget] = useState<string | null>(null);
  const [employees, setEmployees]   = useState<any[]>([]);

  // Filters
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [empFilter,   setEmpFilter]   = useState('all');
  const [officeSearch,   setOfficeSearch]   = useState('');
  const [officeDateFrom, setOfficeDateFrom] = useState('');
  const [officeDateTo,   setOfficeDateTo]   = useState('');
  const [showBulkHelp,   setShowBulkHelp]   = useState(false);
  const [showSpendByPerson, setShowSpendByPerson] = useState(false);
  const [monthView,   setMonthView]   = useState(() => new Date().toISOString().slice(0,7));

  // Modal states
  const [rejectTarget,   setRejectTarget]   = useState<any>(null);
  const [rejectComment,  setRejectComment]  = useState('');
  const [deleteTarget,   setDeleteTarget]   = useState<any>(null);
  const [editFieldItem,  setEditFieldItem]  = useState<any>(null);
  const [isOfficeOpen,   setIsOfficeOpen]   = useState(false);

  // ── Bulk Upload state ─────────────────────────────────────────────────────
  const [bulkFile,       setBulkFile]       = useState<File | null>(null);
  const [bulkRows,       setBulkRows]       = useState<any[]>([]);
  const [bulkErrors,     setBulkErrors]     = useState<string[]>([]);
  const [bulkUploading,  setBulkUploading]  = useState(false);
  const [bulkDone,       setBulkDone]       = useState(false);
  const [officeForm,     setOfficeForm]     = useState(EMPTY_OFFICE_FORM);
  const [editOfficeId,   setEditOfficeId]   = useState<string|null>(null);
  const [saving,         setSaving]         = useState(false);

  // ── Admin Credits state ───────────────────────────────────────────────────
  const [adminCredits,   setAdminCredits]   = useState<any[]>([]);
  const [isCreditOpen,   setIsCreditOpen]   = useState(false);
  const [editCreditId,   setEditCreditId]   = useState<string|null>(null);
  const [creditForm,     setCreditForm]     = useState(EMPTY_CREDIT_FORM);
  const [savingCredit,   setSavingCredit]   = useState(false);

  // ── Manual Field Expense entry (admin) ────────────────────────────────────
  const [isFieldAddOpen, setIsFieldAddOpen] = useState(false);
  const [fieldAddForm,   setFieldAddForm]   = useState(EMPTY_FIELD_FORM);
  const [savingFieldAdd, setSavingFieldAdd] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [feRes, oeRes, upRes, setRes, budgetRes, eeRes, acRes] = await Promise.all([
        supabase.from('field_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('office_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('user_profiles').select('id,name').eq('is_active', true),
        supabase.from('app_settings').select('value').eq('key','km_rate_per_km').single(),
        // Try to fetch budgets — table may not exist yet, silently handle
        supabase.from('expense_budgets').select('*'),
        supabase.from('employee_expenses').select('*').order('expense_date', { ascending: false }),
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
      if (acRes.error && (acRes.error as any).code === '42P01') {
        // admin_credits table doesn't exist yet — safe to ignore
        setAdminCredits([]);
      } else {
        setAdminCredits(acRes.data || []);
      }

      const rate = parseFloat(setRes.data?.value || '5') || 5;
      setKmRate(rate);
      setKmRateInput(String(rate));

      // Load budgets
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

  // ── Month summaries ────────────────────────────────────────────────────────
  const thisMonth = new Date().toISOString().slice(0, 7);

  const computeSummary = useCallback((month: string) => {
    const af = fieldExp.filter(e => e.status === 'approved' && e.expense_date?.startsWith(month));
    const oe = officeExp.filter(e => e.expense_date?.startsWith(month));
    const ae = empExp.filter(e => e.status === 'approved' && e.expense_date?.startsWith(month));
    const ac = adminCredits.filter(e => e.credit_date?.startsWith(month));
    const fieldConv = af.reduce((s,e) => s + (Number(e.conveyance_amount)||0), 0);
    const fieldCredit = af.reduce((s,e) => s + (Number(e.credit_total)||0), 0);
    const adminCreditTotal = ac.reduce((s,e) => s + (Number(e.amount)||0), 0);
    const credit    = fieldCredit + adminCreditTotal;
    const km        = af.reduce((s,e) => s + (Number(e.kilometres)||0), 0);
    const office    = oe.reduce((s,e) => s + (Number(e.amount)||0), 0);
    const empTotal  = ae.reduce((s,e) => s + (Number(e.amount)||0), 0);
    const totalExpense = fieldConv + office + empTotal;
    const profit = credit - totalExpense;
    return { fieldConv, credit, km, office: office + empTotal, net: totalExpense - credit, totalExpense, profit };
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

  const filteredOffice = useMemo(() => officeExp.filter(e => {
    if (officeDateFrom && e.expense_date < officeDateFrom) return false;
    if (officeDateTo   && e.expense_date > officeDateTo)   return false;
    if (officeSearch) {
      const q = officeSearch.toLowerCase();
      const hay = `${e.category||''} ${e.custom_category||''} ${e.spent_by_name||''} ${e.description||''} ${e.remarks||''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [officeExp, officeDateFrom, officeDateTo, officeSearch]);

  const ledger = useMemo(() => {
    const rows = [
      ...fieldExp
        .filter(e => e.status === 'approved')
        .map(e => ({
          date:    e.expense_date,
          source:  'Field',
          person:  empMap[e.field_boy_id] || '—',
          category: 'Conveyance',
          desc:    leadMap[e.lead_id] || e.description || 'Ad-hoc',
          km:      Number(e.kilometres) || 0,
          expense: -(Number(e.conveyance_amount) || 0),   // always negative
          credit:  +(Number(e.credit_total) || 0),         // always positive
        })),
      ...officeExp.map(e => ({
        date:    e.expense_date,
        source:  'Office',
        person:  e.spent_by_name || empMap[e.added_by] || '—',
        category: e.category || e.custom_category || 'Other',
        desc:    e.description + (e.remarks ? ` (${e.remarks})` : ''),
        km:      0,
        expense: -(Number(e.amount) || 0),                 // always negative
        credit:  0,
      })),
      ...empExp
        .filter(e => e.status === 'approved')
        .map(e => ({
          date:    e.expense_date,
          source:  'Employee',
          person:  empMap[e.user_id] || '—',
          category: CAT_LABELS[e.category] || e.custom_category || e.category,
          desc:    e.description,
          km:      0,
          expense: -(Number(e.amount) || 0),               // always negative
          credit:  0,
        })),
      ...adminCredits.map(e => ({
        date:    e.credit_date,
        source:  'Credit',
        person:  e.description || CREDIT_CAT_LABELS[e.category] || e.category,
        category: CREDIT_CAT_LABELS[e.category] || e.custom_category || e.category,
        desc:    e.description + (e.reference ? ` (Ref: ${e.reference})` : ''),
        km:      0,
        expense: 0,
        credit:  +(Number(e.amount) || 0),
      })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // ascending: oldest first

    // running = cumulative (credit + expense), calculated oldest→newest
    let running = 0;
    const withBalance = rows.map(r => {
      const net = r.credit + r.expense; // credit(+) + expense(-)
      running += net;
      return { ...r, net, running };
    });

    // Reverse for display: newest first (standard ledger view)
    return withBalance.reverse();
  }, [fieldExp, officeExp, empExp, adminCredits, empMap, leadMap]);

  // ── Spend totals per person, split by source (avoids merging same name across Field/Office) ──
  const spendByPerson = useMemo(() => {
    const totals: Record<string, { name: string; source: string; amount: number }> = {};
    ledger.forEach(r => {
      if (r.expense < 0 && r.person && r.person !== '—') {
        const key = `${r.person}__${r.source}`;
        if (!totals[key]) totals[key] = { name: r.person, source: r.source, amount: 0 };
        totals[key].amount += Math.abs(r.expense);
      }
    });
    return Object.values(totals).sort((a, b) => b.amount - a.amount); // highest spender first
  }, [ledger]);

  // ── Per-employee budget usage this month ───────────────────────────────────
  const empBudgetUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    fieldExp
      .filter(e => e.status !== 'rejected' && e.expense_date?.startsWith(thisMonth))
      .forEach(e => {
        const id = e.field_boy_id;
        usage[id] = (usage[id] || 0) + (Number(e.conveyance_amount) || 0);
      });
    return usage;
  }, [fieldExp, thisMonth]);

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
        // Table might not exist — create it via a stored proc or show SQL hint
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
    if (!officeForm.category.trim()) { toast.error('Category required'); return; }
    if (!officeForm.amount || parseFloat(officeForm.amount) <= 0) { toast.error('Amount required'); return; }
    if (!officeForm.description.trim()) { toast.error('Description required'); return; }
    if (!officeForm.expense_date) { toast.error('Date required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        category: officeForm.category.trim(),
        spent_by_name: officeForm.spent_by_name?.trim() || null,
        amount: parseFloat(officeForm.amount),
        description: officeForm.description.trim(),
        remarks: officeForm.remarks?.trim() || null,
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

  // ── Admin Credits — save (add/edit) ───────────────────────────────────────
  const saveCredit = async () => {
    if (!creditForm.amount || parseFloat(creditForm.amount) <= 0) { toast.error('Amount required'); return; }
    if (!creditForm.description.trim()) { toast.error('Description required'); return; }
    if (!creditForm.credit_date) { toast.error('Date required'); return; }
    setSavingCredit(true);
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
        if ((error as any).code === '42P01') {
          toast.error('admin_credits table not found. Run the SQL migration first.', { duration: 8000 });
        } else {
          throw error;
        }
        return;
      }
      toast.success(editCreditId ? 'Credit updated' : 'Credit added');
      setIsCreditOpen(false);
      setEditCreditId(null);
      setCreditForm(EMPTY_CREDIT_FORM);
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingCredit(false); }
  };

  // ── Manual Field Expense entry (admin) — save ─────────────────────────────
  const saveFieldAdd = async () => {
    if (!fieldAddForm.field_boy_id) { toast.error('Select an employee'); return; }
    if (!fieldAddForm.conveyance_amount || parseFloat(fieldAddForm.conveyance_amount) <= 0) { toast.error('Conveyance amount required'); return; }
    if (!fieldAddForm.expense_date) { toast.error('Date required'); return; }
    setSavingFieldAdd(true);
    try {
      const payload: any = {
        field_boy_id:      fieldAddForm.field_boy_id,
        expense_date:      fieldAddForm.expense_date,
        kilometres:        parseFloat(fieldAddForm.kilometres) || 0,
        conveyance_amount: parseFloat(fieldAddForm.conveyance_amount),
        credit_total:      parseFloat(fieldAddForm.credit_total) || 0,
        description:       fieldAddForm.description.trim() || null,
        status:             'approved',
        approved_by:        user!.id,
        approved_at:        new Date().toISOString(),
      };
      const { error } = await supabase.from('field_expenses').insert(payload);
      if (error) throw error;
      toast.success('Field expense added & approved');
      setIsFieldAddOpen(false);
      setFieldAddForm(EMPTY_FIELD_FORM);
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingFieldAdd(false); }
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
      'Conveyance ₹': e.conveyance_amount,
      'Credit ₹': e.credit_total || 0,
      Status: e.status,
      'Admin Comment': e.admin_comment || '',
      Notes: e.notes || '',
    }));
    const oe = officeExp.map(e => ({
      Date: e.expense_date,
      Category: CAT_LABELS[e.category] || e.custom_category,
      'Amount ₹': e.amount,
      Description: e.description,
      'Added By': empMap[e.added_by] || e.added_by,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fe.length ? fe : [{ info: 'No data' }]), 'Field Expenses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(oe.length ? oe : [{ info: 'No data' }]), 'Office Expenses');
    XLSX.writeFile(wb, `Expenses_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Excel downloaded');
  };

  // ── Bulk Upload Handlers ──────────────────────────────────────────────────

  // Office bulk upload — free-text category + plain text spent-by name
  // (matches real-world usage: Ice, Recharge, Refreshment, 3rd Party Sale, etc.
  //  and spenders that aren't always registered employees e.g. "Store")
  const COMMON_OFFICE_CATS = [
    'Refreshment', 'Ice', 'Recharge', 'Bill Payment Cust', 'Stationary',
    '3rd Party Sale', 'Clean', 'Water Bill', 'Courier', 'Printer', 'SKYC', 'Other',
  ];

  const handleSampleDownload = () => {
    const empNames = employees.map((e: any) => e.name);
    const sampleRows = [
      { 'Date (YYYY-MM-DD)': '2026-06-01', Category: 'Ice',               'Spent By Name': 'Ram',    Description: 'Ice',                         Remarks: '',                       Amount: 20 },
      { 'Date (YYYY-MM-DD)': '2026-06-01', Category: 'Bill Payment Cust', 'Spent By Name': 'Vishnu', Description: 'Bill Payment Customer 9306181900', Remarks: 'Manisha Sale',        Amount: 70 },
      { 'Date (YYYY-MM-DD)': '2026-06-01', Category: 'Recharge',          'Spent By Name': 'Vishnu', Description: 'Recharge Neha',                Remarks: '',                       Amount: 199 },
      { 'Date (YYYY-MM-DD)': '2026-06-02', Category: 'Refreshment',       'Spent By Name': 'Vishnu', Description: 'Tea',                          Remarks: '',                       Amount: 45 },
      { 'Date (YYYY-MM-DD)': '2026-06-06', Category: '3rd Party Sale',    'Spent By Name': 'Ram',    Description: 'Visit Charges 3rd Party Close', Remarks: 'Transfer Sumt ptm',      Amount: 150 },
      { 'Date (YYYY-MM-DD)': '2026-06-18', Category: 'Water Bill',        'Spent By Name': 'Vishnu', Description: 'Rent',                         Remarks: '',                       Amount: 350 },
      { 'Date (YYYY-MM-DD)': '2026-06-24', Category: 'Other',             'Spent By Name': 'Ram',    Description: 'Security Deposit',             Remarks: 'SD Shivani Relative Manesar', Amount: 250 },
    ];
    const infoRows = [
      { '': 'CATEGORY — type any text you like (free text, not restricted):' },
      ...COMMON_OFFICE_CATS.map(c => ({ '': c })),
      { '': '(you can also type a brand-new category not in this list)' },
      { '': '' },
      { '': 'SPENT BY NAME — type any name (employee or otherwise, e.g. "Store"):' },
      ...empNames.map((n: string) => ({ '': n })),
      { '': '' },
      { '': 'NOTE: Date = YYYY-MM-DD (e.g. 2026-06-15)' },
      { '': 'NOTE: Amount = number only, no Rs symbol' },
      { '': 'NOTE: Remarks = optional extra note' },
      { '': 'NOTE: Delete these sample rows before uploading' },
    ];
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sampleRows);
    ws1['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 35 }, { wch: 22 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Expenses Upload');
    const ws2 = XLSX.utils.json_to_sheet(infoRows);
    ws2['!cols'] = [{ wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');
    XLSX.writeFile(wb, 'BulkExpense_Sample.xlsx');
    toast.success('Sample Excel downloaded');
  };

  const handleBulkFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    setBulkRows([]);
    setBulkErrors([]);
    setBulkDone(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary', cellDates: true });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const errors: string[] = [];
        const parsed: any[] = [];

        raw.forEach((row, i) => {
          const rowNum   = i + 2;
          const date     = String(row['Date (YYYY-MM-DD)'] || '').trim();
          const category = String(row['Category'] || '').trim();
          const spentBy  = String(row['Spent By Name'] || '').trim();
          const desc     = String(row['Description'] || '').trim();
          const remarks  = String(row['Remarks'] || '').trim();
          const amount   = parseFloat(String(row['Amount'] || '').replace(/[^0-9.]/g, ''));

          const rowErrors: string[] = [];
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date))   rowErrors.push('invalid date (use YYYY-MM-DD)');
          if (!category)                               rowErrors.push('category is empty');
          if (isNaN(amount) || amount <= 0)            rowErrors.push('invalid amount');
          if (!desc)                                   rowErrors.push('description is empty');

          if (rowErrors.length) {
            errors.push('Row ' + rowNum + ': ' + rowErrors.join(', '));
          } else {
            parsed.push({
              expense_date:  date,
              category,
              spent_by_name: spentBy || null,
              description:   desc,
              remarks:       remarks || null,
              amount,
            });
          }
        });

        setBulkErrors(errors);
        setBulkRows(parsed);
      } catch (err: any) {
        setBulkErrors([`Could not read file: ${err.message}`]);
        setBulkRows([]);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // allow re-pick same file
  };

  const handleBulkUpload = async () => {
    if (!bulkRows.length) return;
    setBulkUploading(true);
    try {
      const payload = bulkRows.map(r => ({
        expense_date:  r.expense_date,
        category:      r.category,
        spent_by_name: r.spent_by_name,
        description:   r.description,
        remarks:       r.remarks,
        amount:        r.amount,
        added_by:      user!.id,
      }));
      const { error } = await supabase.from('office_expenses').insert(payload);
      if (error) throw error;
      toast.success(`${payload.length} expenses uploaded successfully!`);
      setBulkDone(true);
      setBulkFile(null);
      setBulkRows([]);
      setBulkErrors([]);
      fetchAll();
    } catch (e: any) {
      toast.error('Upload failed: ' + e.message);
    } finally {
      setBulkUploading(false);
    }
  };

  const handleBulkReset = () => {
    setBulkFile(null);
    setBulkRows([]);
    setBulkErrors([]);
    setBulkDone(false);
  };

  // ── Field Bulk Upload ─────────────────────────────────────────────────────
  const [fieldBulkFile,      setFieldBulkFile]      = useState<File | null>(null);
  const [fieldBulkRows,      setFieldBulkRows]      = useState<any[]>([]);
  const [fieldBulkErrors,    setFieldBulkErrors]    = useState<string[]>([]);
  const [fieldBulkUploading, setFieldBulkUploading] = useState(false);
  const [fieldBulkDone,      setFieldBulkDone]      = useState(false);
  const [bulkSubTab,         setBulkSubTab]          = useState<'office'|'field'>('office');
  const [ledgerSearch,       setLedgerSearch]        = useState('');
  const [ledgerSourceFilter, setLedgerSourceFilter]  = useState<'all'|'Field'|'Office'|'Employee'|'Credit'>('all');
  const [selectedFieldIds,   setSelectedFieldIds]    = useState<Set<string>>(new Set());
  const [selectedOfficeIds,  setSelectedOfficeIds]   = useState<Set<string>>(new Set());
  const [bulkDeleting,       setBulkDeleting]        = useState(false);
  const [bulkDeleteConfirm,  setBulkDeleteConfirm]   = useState<{ table: string; ids: string[] } | null>(null);

  const handleFieldSampleDownload = () => {
    const empNames = employees.map((e: any) => e.name);
    const sample = [
      { 'Date (YYYY-MM-DD)': '2026-06-01', 'Employee Name': empNames[0] || 'Rahul Kumar', KM: 12, 'Conveyance Rs': 60,  'Credit Rs': 500,  Description: 'Sale closed at Sector 12' },
      { 'Date (YYYY-MM-DD)': '2026-06-02', 'Employee Name': empNames[1] || 'Priya Singh',  KM: 8,  'Conveyance Rs': 40,  'Credit Rs': 0,    Description: 'Local travel' },
      { 'Date (YYYY-MM-DD)': '2026-06-03', 'Employee Name': empNames[0] || 'Rahul Kumar', KM: 5,  'Conveyance Rs': 25,  'Credit Rs': 0,    Description: 'Bill payment visit' },
      { 'Date (YYYY-MM-DD)': '2026-06-04', 'Employee Name': empNames[2] || 'Amit Sharma', KM: 20, 'Conveyance Rs': 100, 'Credit Rs': 1200, Description: 'Two SIMs sold' },
      { 'Date (YYYY-MM-DD)': '2026-06-05', 'Employee Name': empNames[0] || 'Rahul Kumar', KM: 0,  'Conveyance Rs': 50,  'Credit Rs': 0,    Description: 'Travel expense' },
    ];
    const info = [
      { Info: 'INSTRUCTIONS' },
      { Info: 'Employee Name must match exactly as in system.' },
      { Info: '' },
      { Info: 'YOUR REGISTERED EMPLOYEES:' },
      ...empNames.map((n: string) => ({ Info: n })),
      { Info: '' },
      { Info: 'KM = kilometres (0 if none)' },
      { Info: 'Conveyance Rs = travel amount (required)' },
      { Info: 'Credit Rs = money collected from customer (0 if none)' },
      { Info: 'Admin bulk entries are saved as APPROVED directly.' },
    ];
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sample);
    ws1['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Field Expenses Upload');
    const ws2 = XLSX.utils.json_to_sheet(info);
    ws2['!cols'] = [{ wch: 55 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');
    XLSX.writeFile(wb, 'BulkFieldExpense_Sample.xlsx');
    toast.success('Field expense template downloaded');
  };

  const handleFieldBulkFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFieldBulkFile(file);
    setFieldBulkRows([]);
    setFieldBulkErrors([]);
    setFieldBulkDone(false);

    const nameToId: Record<string, string> = {};
    employees.forEach((emp: any) => { nameToId[emp.name.trim().toLowerCase()] = emp.id; });

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target?.result, { type: 'binary', cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const errors: string[] = [];
        const parsed: any[] = [];

        raw.forEach((row, i) => {
          const rowNum  = i + 2;
          const date    = String(row['Date (YYYY-MM-DD)'] || '').trim();
          const empName = String(row['Employee Name']     || '').trim();
          const km      = parseFloat(String(row['KM'] || '0').replace(/[,\s]/g, '')) || 0;
          const conv    = parseFloat(String(row['Conveyance Rs'] || '').replace(/[^0-9.]/g, ''));
          const credit  = parseFloat(String(row['Credit Rs']    || '0').replace(/[^0-9.]/g, '')) || 0;
          const desc    = String(row['Description']  || '').trim();

          const rowErrors: string[] = [];
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date))   rowErrors.push('invalid date (use YYYY-MM-DD)');
          const empId = nameToId[empName.toLowerCase()];
          if (!empId)                                  rowErrors.push('employee not found: "' + empName + '"');
          if (isNaN(conv) || conv <= 0)                rowErrors.push('invalid conveyance amount');

          if (rowErrors.length) {
            errors.push('Row ' + rowNum + ': ' + rowErrors.join(', '));
          } else {
            parsed.push({ expense_date: date, field_boy_id: empId, employee_name: empName, kilometres: km, conveyance_amount: conv, credit_total: isNaN(credit) ? 0 : credit, description: desc || null });
          }
        });

        setFieldBulkErrors(errors);
        setFieldBulkRows(parsed);
      } catch (err: any) {
        setFieldBulkErrors(['Could not read file: ' + err.message]);
        setFieldBulkRows([]);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleFieldBulkUpload = async () => {
    if (!fieldBulkRows.length) return;
    setFieldBulkUploading(true);
    try {
      const payload = fieldBulkRows.map(r => ({
        expense_date: r.expense_date, field_boy_id: r.field_boy_id,
        kilometres: r.kilometres, conveyance_amount: r.conveyance_amount,
        credit_total: r.credit_total,
        description: r.description, status: 'approved',
        approved_by: user!.id, approved_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('field_expenses').insert(payload);
      if (error) throw error;
      toast.success(payload.length + ' field expenses uploaded & auto-approved!');
      setFieldBulkDone(true);
      setFieldBulkFile(null);
      setFieldBulkRows([]);
      setFieldBulkErrors([]);
      fetchAll();
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setFieldBulkUploading(false);
    }
  };

  const handleFieldBulkReset = () => {
    setFieldBulkFile(null);
    setFieldBulkRows([]);
    setFieldBulkErrors([]);
    setFieldBulkDone(false);
  };

  // ── Bulk Select & Delete ───────────────────────────────────────────────────
  const toggleFieldSelect = (id: string) => {
    setSelectedFieldIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleOfficeSelect = (id: string) => {
    setSelectedOfficeIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAllField = (ids: string[]) => setSelectedFieldIds(new Set(ids));
  const selectAllOffice = (ids: string[]) => setSelectedOfficeIds(new Set(ids));
  const clearFieldSelection = () => setSelectedFieldIds(new Set());
  const clearOfficeSelection = () => setSelectedOfficeIds(new Set());

  const handleBulkDelete = async () => {
    if (!bulkDeleteConfirm) return;
    const { table, ids } = bulkDeleteConfirm;
    setBulkDeleting(true);
    try {
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} entries deleted`);
      if (table === 'field_expenses') clearFieldSelection();
      if (table === 'office_expenses') clearOfficeSelection();
      setBulkDeleteConfirm(null);
      fetchAll();
    } catch (e: any) {
      toast.error('Bulk delete failed: ' + e.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  // ── FieldExpRow ────────────────────────────────────────────────────────────
  const FieldRow = ({ exp, showActions = true }: { exp: any; showActions?: boolean; key?: any }) => {
    const budget = budgets[exp.field_boy_id];
    const used   = empBudgetUsage[exp.field_boy_id] || 0;
    const overBudget = budget && used > budget.monthly_limit;
    const name = empMap[exp.field_boy_id] || '—';
    const accent = exp.status === 'approved' ? 'bg-emerald-500' : exp.status === 'rejected' ? 'bg-rose-500' : 'bg-amber-400';

    return (
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/85 dark:bg-slate-900/60 backdrop-blur-xl p-3 pl-4 flex items-start gap-2.5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
        <input
          type="checkbox"
          checked={selectedFieldIds.has(exp.id)}
          onChange={() => toggleFieldSelect(exp.id)}
          className="mt-1 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
        />
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-sm">
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-xs text-slate-800 dark:text-slate-100">{name}</span>
            <StatusBadge s={exp.status} />
            {overBudget && (
              <span className="text-[10px] bg-rose-50 text-rose-500 border border-rose-200 px-1.5 py-0.5 rounded font-bold">
                ⚠️ Over Budget
              </span>
            )}
            <span className="text-[11px] text-slate-400 ml-auto whitespace-nowrap">{exp.expense_date}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <span className="text-slate-500 dark:text-slate-400 truncate">{leadMap[exp.lead_id] || exp.description || 'Ad-hoc expense'}</span>
            <span className="text-slate-300">·</span>
            <span className="text-indigo-500 font-medium whitespace-nowrap">{exp.kilometres} km</span>
            <span className="text-rose-500 font-bold whitespace-nowrap">-₹{exp.conveyance_amount}</span>
            {Number(exp.credit_total) > 0 && <span className="text-emerald-500 font-bold whitespace-nowrap">+₹{exp.credit_total}</span>}
          </div>
          {exp.admin_comment && (
            <p className="text-[11px] text-rose-500 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-lg px-1.5 py-1 mt-1">
              💬 {exp.admin_comment}
            </p>
          )}
        </div>
        {showActions && (
          <div className="flex gap-0.5 shrink-0">
            {exp.status === 'pending' && (
              <>
                <Button size="sm" className="h-6 text-[11px] px-1.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-md shadow-emerald-500/25 border-0" onClick={() => handleApprove(exp.id)}>✅</Button>
                <Button size="sm" variant="outline" className="h-6 text-[11px] px-1.5 text-rose-500 border-rose-200" onClick={() => { setRejectTarget(exp); setRejectComment(''); }}>❌</Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => setEditFieldItem({ ...exp })}>
              <Edit className="h-3 w-3 text-slate-500" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-400"
              onClick={() => setDeleteTarget({ id: exp.id, table: 'field_expenses', name: empMap[exp.field_boy_id] || 'expense' })}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative space-y-5">
      {/* Ambient background glow */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full bg-indigo-500/20 blur-[100px] -z-10" />
      <div aria-hidden className="pointer-events-none absolute -top-10 right-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-[100px] -z-10" />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl px-4 py-3.5 shadow-lg shadow-slate-200/40 dark:shadow-black/30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-400 flex items-center justify-center shadow-md shadow-indigo-500/30 shrink-0">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-700 to-slate-900 dark:from-white dark:via-indigo-300 dark:to-white bg-clip-text text-transparent">
              Expenses
            </h1>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium -mt-0.5">Field &amp; office expense management</p>
          </div>
        </div>
        <Button size="sm" onClick={handleExport}
          className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 shadow-md shadow-indigo-500/25 border-0 text-white">
          <Download className="h-4 w-4 mr-1.5" />Export Excel
        </Button>
      </div>

      {/* Tabs — command-tile navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {TABS.map(t => {
          const Icon = TAB_ICONS[t];
          const active = tab === t;
          const count: Record<TabType, number | null> = {
            'Overview': null,
            'Pending': pendingCount,
            'Field Expenses': fieldExp.length,
            'Office Expenses': officeExp.length,
            'Credits': adminCredits.length,
            'Bulk Upload': null,
            'Ledger': ledger.length,
            'Budget': employees.length,
          }[t] ?? null;
          return (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                "group relative shrink-0 snap-start flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 min-w-[128px] transition-all duration-200 border backdrop-blur-xl",
                active
                  ? "bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 border-transparent shadow-lg shadow-indigo-500/30 -translate-y-0.5"
                  : "bg-white/70 dark:bg-slate-900/50 border-slate-200/70 dark:border-white/10 hover:border-indigo-300/60 dark:hover:border-indigo-400/30 hover:-translate-y-0.5 shadow-sm"
              )}>
              <div className={cn(
                "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                active ? "bg-white/20" : "bg-slate-100 dark:bg-white/5 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10"
              )}>
                <Icon className={cn("h-4 w-4", active ? "text-white" : "text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400")} />
              </div>
              <div className="text-left min-w-0">
                <p className={cn("text-[12.5px] font-bold leading-tight whitespace-nowrap", active ? "text-white" : "text-slate-700 dark:text-slate-200")}>{t}</p>
                <p className={cn("text-[10px] font-medium leading-tight mt-0.5", active ? "text-white/70" : "text-slate-400")}>
                  {count === null ? '—' : t === 'Pending' && count > 0 ? `${count} pending` : `${count} entries`}
                </p>
              </div>
              {t === 'Pending' && pendingCount > 0 && (
                <span className={cn(
                  "absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 flex items-center justify-center text-[10px] font-bold rounded-full ring-2",
                  active ? "bg-white text-indigo-600 ring-indigo-600" : "bg-gradient-to-r from-rose-500 to-red-500 text-white ring-white dark:ring-slate-950 animate-pulse"
                )}>{pendingCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          <span className="text-xs font-medium">Loading...</span>
        </div>
      )}

      {/* ── OVERVIEW ── */}
      {!loading && tab === 'Overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[
              { label: 'Field Conveyance',  val: `-₹${summary.fieldConv.toFixed(0)}`, color: 'text-rose-500',   icon: Car,        glow: 'from-rose-500/10 to-transparent' },
              { label: 'Office Expenses',   val: `-₹${summary.office.toFixed(0)}`,    color: 'text-rose-500',   icon: Building2,  glow: 'from-rose-500/10 to-transparent' },
              { label: 'Credit Collected',  val: `+₹${summary.credit.toFixed(0)}`,    color: 'text-emerald-500',icon: Wallet,     glow: 'from-emerald-500/10 to-transparent' },
              { label: 'Total KM (month)',  val: `${summary.km.toFixed(1)} km`,       color: 'text-indigo-500', icon: TrendingUp, glow: 'from-indigo-500/10 to-transparent' },
            ].map(({ label, val, color, icon: Icon, glow }) => (
              <div key={label} className={`relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl shadow-lg shadow-slate-200/40 dark:shadow-black/40 p-3`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${glow} pointer-events-none`} />
                <div className="relative flex items-start justify-between gap-2">
                  <div>
                    <p className={`text-lg font-black ${color}`}>{val}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{label} — This Month</p>
                  </div>
                  <Icon className={`h-4 w-4 shrink-0 ${color} opacity-70`} />
                </div>
              </div>
            ))}
          </div>

          <div className={`relative overflow-hidden rounded-2xl p-5 border backdrop-blur-xl shadow-lg ${
            summary.profit >= 0
              ? 'bg-gradient-to-br from-emerald-50/90 to-white/60 dark:from-emerald-500/10 dark:to-slate-900/60 border-emerald-200/70 dark:border-emerald-500/20 shadow-emerald-200/30 dark:shadow-black/30'
              : 'bg-gradient-to-br from-rose-50/90 to-white/60 dark:from-rose-500/10 dark:to-slate-900/60 border-rose-200/70 dark:border-rose-500/20 shadow-rose-200/30 dark:shadow-black/30'
          }`}>
            <div className="flex items-center gap-5 flex-wrap">
              {/* Ratio ring */}
              <div className="relative h-20 w-20 shrink-0 rounded-full grid place-items-center"
                style={{
                  background: `conic-gradient(${summary.profit >= 0 ? '#10b981' : '#f43f5e'} ${Math.max(0, Math.min(100, Math.round((summary.credit / ((summary.credit + summary.totalExpense) || 1)) * 100)))}%, rgba(148,163,184,0.25) 0)`
                }}>
                <div className="h-14 w-14 rounded-full bg-white dark:bg-slate-950 grid place-items-center">
                  {summary.profit >= 0
                    ? <TrendingUp className="h-6 w-6 text-emerald-500" />
                    : <TrendingDown className="h-6 w-6 text-rose-500" />}
                </div>
              </div>

              <div className="flex-1 min-w-[180px]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">This Month · Net P&amp;L</p>
                <p className={`text-3xl font-black mt-0.5 ${summary.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {summary.profit >= 0 ? '+' : ''}₹{Math.abs(summary.profit).toFixed(0)}
                </p>
                <p className={`inline-flex items-center gap-1 text-[11px] font-bold mt-1 px-2 py-0.5 rounded-full ${summary.profit >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                  {summary.profit >= 0 ? '▲ Profitable' : '▼ Loss'}
                </p>
              </div>

              <div className="w-full sm:w-56 shrink-0 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Credit In</span>
                  <span className="font-bold text-emerald-500">₹{summary.credit.toFixed(0)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200/60 dark:bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                    style={{ width: `${Math.max(2, Math.min(100, Math.round((summary.credit / ((summary.credit + summary.totalExpense) || 1)) * 100)))}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Expense Out</span>
                  <span className="font-bold text-rose-500">₹{summary.totalExpense.toFixed(0)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200/60 dark:bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500"
                    style={{ width: `${Math.max(2, Math.min(100, Math.round((summary.totalExpense / ((summary.credit + summary.totalExpense) || 1)) * 100)))}%` }} />
                </div>
              </div>
            </div>
          </div>


          <div className="grid grid-cols-2 gap-2.5">
            <Card>
              <CardHeader className="pb-1.5 pt-3 px-3">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <Settings className="h-3.5 w-3.5" /> KM Rate
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 px-3 pb-3">
                <Input type="number" min="1" step="0.5" className="w-20 h-7 text-xs"
                  value={kmRateInput} onChange={e => setKmRateInput(e.target.value)} />
                <span className="text-xs text-slate-500">₹/km</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveKmRate}>Save</Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-lg font-black text-yellow-600">{pendingCount}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Pending approvals</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm">Monthly Breakdown</CardTitle>
                <input type="month" value={monthView}
                  onChange={e => setMonthView(e.target.value)}
                  className="h-7 px-2 text-xs border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 px-4 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Field Conveyance', val: `-₹${monthSummary.fieldConv.toFixed(0)}`, color: 'text-red-600' },
                  { label: 'Office Expenses',  val: `-₹${monthSummary.office.toFixed(0)}`,    color: 'text-red-600' },
                  { label: 'Credit Collected', val: `+₹${monthSummary.credit.toFixed(0)}`,    color: 'text-green-600' },
                  { label: 'Net P&L',          val: `${monthSummary.profit >= 0 ? '+' : '-'}₹${Math.abs(monthSummary.profit).toFixed(0)}`,
                    color: monthSummary.profit >= 0 ? 'text-green-600' : 'text-red-600' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 border border-slate-100 dark:border-slate-700">
                    <p className={`text-sm font-black ${color}`}>{val}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {allMonths.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs mt-2">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700">
                        {['Month','Field Exp','Office Exp','Credit','Net P&L'].map(h => (
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
                            <td className="px-2 py-2 text-red-600 font-medium">-₹{s.fieldConv.toFixed(0)}</td>
                            <td className="px-2 py-2 text-red-500 font-medium">-₹{s.office.toFixed(0)}</td>
                            <td className="px-2 py-2 text-green-600 font-medium">+₹{s.credit.toFixed(0)}</td>
                            <td className={`px-2 py-2 font-black ${s.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {s.profit >= 0 ? '+' : '-'}₹{Math.abs(s.profit).toFixed(0)}
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
          <div className="space-y-5">
            {total === 0 ? (
              <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl py-16 text-center shadow-lg">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <p className="text-slate-400 font-medium">All caught up — no pending approvals 🎉</p>
              </div>
            ) : (
              <>
                {/* Employee (office staff) pending */}
                {pendingEmp.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Employee Expenses ({pendingEmp.length})
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {pendingEmp.map(exp => (
                        <div key={exp.id} className="relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/85 dark:bg-slate-900/60 backdrop-blur-xl p-3 pl-4 flex items-start gap-2.5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400" />
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-sm">
                            {(empMap[exp.user_id] || '—').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-xs text-slate-900 dark:text-white">
                                {empMap[exp.user_id] || '—'}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-300">
                                {CAT_LABELS[exp.category] || exp.custom_category || exp.category}
                              </span>
                              <span className="text-[11px] text-slate-400 ml-auto whitespace-nowrap">{exp.expense_date}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="text-slate-500 dark:text-slate-400 truncate">{exp.description}</span>
                              <span className="text-rose-500 font-bold whitespace-nowrap ml-auto">-₹{exp.amount}</span>
                            </div>
                          </div>
                          <div className="flex gap-0.5 shrink-0">
                            <Button size="sm" className="h-6 text-[11px] px-1.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-md shadow-emerald-500/25 border-0"
                              onClick={() => handleApprove(exp.id, 'employee_expenses')}>✅</Button>
                            <Button size="sm" variant="outline" className="h-6 text-[11px] px-1.5 text-rose-500 border-rose-200"
                              onClick={() => { setRejectTarget({ ...exp, sourceTable: 'employee_expenses' }); setRejectComment(''); }}>❌</Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-400"
                              onClick={() => setDeleteTarget({ id: exp.id, table: 'employee_expenses', name: `${empMap[exp.user_id] || 'Employee'} expense` })}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Field Boy pending */}
                {pendingField.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Field Boy Expenses ({pendingField.length})
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
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
            <Button size="sm" onClick={() => { setFieldAddForm(EMPTY_FIELD_FORM); setIsFieldAddOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />Add Entry
            </Button>
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
            <span className="text-xs text-slate-400 ml-auto">{filteredField.length} entries</span>
          </div>

          {/* Bulk select bar */}
          {filteredField.length > 0 && (
            <div className="flex items-center gap-3 px-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedFieldIds.size > 0 && selectedFieldIds.size === filteredField.length}
                  onChange={() => selectedFieldIds.size === filteredField.length ? clearFieldSelection() : selectAllField(filteredField.map(e => e.id))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Select all
              </label>
              {selectedFieldIds.size > 0 && (
                <>
                  <span className="text-xs text-blue-600 font-bold">{selectedFieldIds.size} selected</span>
                  <Button size="sm" variant="destructive" className="h-7 text-xs ml-auto"
                    onClick={() => setBulkDeleteConfirm({ table: 'field_expenses', ids: [...selectedFieldIds] })}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Delete Selected
                  </Button>
                </>
              )}
            </div>
          )}

          {filteredField.length === 0
            ? <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl py-12 text-center text-slate-400 shadow-lg">No expenses found</div>
            : <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {filteredField.map(exp => <FieldRow key={exp.id} exp={exp} />)}
              </div>
          }
        </div>
      )}

      {/* ── OFFICE EXPENSES ── */}
      {!loading && tab === 'Office Expenses' && (
        <div className="space-y-5">

          {/* Admin-added Office Expenses */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Office Expenses ({filteredOffice.length}{filteredOffice.length !== officeExp.length ? ` / ${officeExp.length}` : ''})</p>
              <Button size="sm" onClick={() => { setEditOfficeId(null); setOfficeForm(EMPTY_OFFICE_FORM); setIsOfficeOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" />Add
              </Button>
            </div>

            {/* Filter bar — same pattern as Field Expenses */}
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={officeSearch}
                  onChange={e => setOfficeSearch(e.target.value)}
                  placeholder="Search category, name, description…"
                  className="w-full pl-8 pr-2 h-8 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <Input type="date" value={officeDateFrom} onChange={e => setOfficeDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
              <span className="text-xs text-slate-400">to</span>
              <Input type="date" value={officeDateTo} onChange={e => setOfficeDateTo(e.target.value)} className="h-8 w-36 text-xs" />
              {(officeSearch || officeDateFrom || officeDateTo) && (
                <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-400"
                  onClick={() => { setOfficeSearch(''); setOfficeDateFrom(''); setOfficeDateTo(''); }}>Clear</Button>
              )}
            </div>

            {/* Bulk select bar */}
            {filteredOffice.length > 0 && (
              <div className="flex items-center gap-3 px-1">
                <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedOfficeIds.size > 0 && selectedOfficeIds.size === filteredOffice.length}
                    onChange={() => selectedOfficeIds.size === filteredOffice.length ? clearOfficeSelection() : selectAllOffice(filteredOffice.map(e => e.id))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Select all
                </label>
                {selectedOfficeIds.size > 0 && (
                  <>
                    <span className="text-xs text-blue-600 font-bold">{selectedOfficeIds.size} selected</span>
                    <Button size="sm" variant="destructive" className="h-7 text-xs ml-auto"
                      onClick={() => setBulkDeleteConfirm({ table: 'office_expenses', ids: [...selectedOfficeIds] })}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />Delete Selected
                    </Button>
                  </>
                )}
              </div>
            )}

            {filteredOffice.length === 0
              ? <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl py-8 text-center text-slate-400 text-sm shadow-lg">{officeExp.length === 0 ? 'No office expenses yet' : 'No entries match your filter'}</div>
              : <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {filteredOffice.map(exp => (
                    <div key={exp.id} className="relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/85 dark:bg-slate-900/60 backdrop-blur-xl p-3 pl-4 flex items-center gap-2.5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-cyan-500" />
                      <input
                        type="checkbox"
                        checked={selectedOfficeIds.has(exp.id)}
                        onChange={() => toggleOfficeSelect(exp.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-slate-800 dark:text-slate-100">{exp.category || exp.custom_category}</span>
                          {exp.spent_by_name && (
                            <span className="text-[10px] bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full font-semibold">
                              {exp.spent_by_name}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 whitespace-nowrap">{exp.expense_date}</span>
                          <span className="text-rose-500 font-bold text-xs ml-auto whitespace-nowrap">-₹{exp.amount}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {exp.description}{exp.remarks ? ` · ${exp.remarks}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                          setEditOfficeId(exp.id);
                          setOfficeForm({
                            category: exp.category || '',
                            custom_category: exp.custom_category || '',
                            spent_by_name: exp.spent_by_name || '',
                            amount: String(exp.amount),
                            description: exp.description,
                            remarks: exp.remarks || '',
                            expense_date: exp.expense_date,
                          });
                          setIsOfficeOpen(true);
                        }}>
                          <Edit className="h-3 w-3 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-400"
                          onClick={() => setDeleteTarget({ id: exp.id, table: 'office_expenses', name: 'office expense' })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* Employee submitted expenses — all statuses */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Employee Submitted Expenses ({empExp.length})</p>
            {empExp.length === 0
              ? <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl py-8 text-center text-slate-400 text-sm shadow-lg">No employee expenses yet</div>
              : <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {empExp.map(exp => {
                    const accent = exp.status === 'approved' ? 'bg-emerald-500' : exp.status === 'rejected' ? 'bg-rose-500' : 'bg-amber-400';
                    return (
                    <div key={exp.id} className="relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/85 dark:bg-slate-900/60 backdrop-blur-xl p-3 pl-4 flex items-start gap-2.5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-slate-900 dark:text-white">{empMap[exp.user_id] || '—'}</span>
                          <span className="text-[11px] text-slate-500">{CAT_LABELS[exp.category] || exp.custom_category || exp.category}</span>
                          <StatusBadge s={exp.status} />
                          <span className="text-[11px] text-slate-400 ml-auto whitespace-nowrap">{exp.expense_date}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400 truncate">{exp.description}</span>
                          <span className="text-rose-500 font-bold whitespace-nowrap ml-auto">-₹{exp.amount}</span>
                        </div>
                        {exp.admin_comment && (
                          <p className="text-[11px] text-rose-500 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-lg px-1.5 py-1 mt-1">
                            💬 {exp.admin_comment}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        {exp.status === 'pending' && (
                          <>
                            <Button size="sm" className="h-6 text-[11px] px-1.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-md shadow-emerald-500/25 border-0"
                              onClick={() => handleApprove(exp.id, 'employee_expenses')}>✅</Button>
                            <Button size="sm" variant="outline" className="h-6 text-[11px] px-1.5 text-rose-500 border-rose-200"
                              onClick={() => { setRejectTarget({ ...exp, sourceTable: 'employee_expenses' }); setRejectComment(''); }}>❌</Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-400"
                          onClick={() => setDeleteTarget({ id: exp.id, table: 'employee_expenses', name: `${empMap[exp.user_id] || 'Employee'} expense` })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );})}
                </div>
            }
          </div>
        </div>
      )}

      {/* ── CREDITS ── */}
      {!loading && tab === 'Credits' && (
        <div className="space-y-4">
          <div className="relative overflow-hidden flex gap-3 p-3.5 rounded-2xl border border-emerald-200/70 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50/90 to-white/60 dark:from-emerald-500/10 dark:to-slate-900/60 backdrop-blur-xl text-xs text-emerald-800 dark:text-emerald-300 shadow-lg shadow-emerald-200/20 dark:shadow-black/30">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <IndianRupee className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="font-bold text-sm mb-0.5">Admin Credits — Incoming Money</p>
              <p>Record all money received by the company — charges collected, incentives, security deposits, payouts, etc. These are always shown as positive (+) and contribute to profit.</p>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">💰 Credits Added ({adminCredits.length})</p>
              {adminCredits.length > 0 && (() => {
                const monthTotal = adminCredits.filter(c => c.credit_date?.startsWith(thisMonth)).reduce((s,c) => s + (Number(c.amount)||0), 0);
                const allTotal   = adminCredits.reduce((s,c) => s + (Number(c.amount)||0), 0);
                return (
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-[11px] text-emerald-500 font-bold">This month: +₹{monthTotal.toFixed(0)}</span>
                    <span className="text-[11px] text-slate-400">All time: +₹{allTotal.toFixed(0)}</span>
                  </div>
                );
              })()}
            </div>
            <Button size="sm" onClick={() => { setEditCreditId(null); setCreditForm(EMPTY_CREDIT_FORM); setIsCreditOpen(true); }}
              className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-md shadow-emerald-500/25 border-0">
              <Plus className="h-4 w-4 mr-1" />Add Credit
            </Button>
          </div>

          {adminCredits.length === 0
            ? <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl py-10 text-center text-slate-400 text-sm shadow-lg">No credits added yet. Click "Add Credit" to record incoming money.</div>
            : <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {adminCredits.map(cr => (
                  <div key={cr.id} className="relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/85 dark:bg-slate-900/60 backdrop-blur-xl p-3 pl-4 flex items-center gap-2.5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-sm shrink-0">
                      {(CREDIT_CAT_LABELS[cr.category] || '➕').split(' ')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs text-slate-800 dark:text-slate-100">
                          {(CREDIT_CAT_LABELS[cr.category] || cr.custom_category || cr.category || '').replace(/^[^\s]+\s/, '')}
                        </span>
                        <span className="text-emerald-500 font-bold text-xs ml-auto">+₹{cr.amount}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {cr.description}{cr.reference ? ` · Ref: ${cr.reference}` : ''} · {cr.credit_date}
                      </p>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        setEditCreditId(cr.id);
                        setCreditForm({
                          category: cr.category,
                          custom_category: cr.custom_category || '',
                          amount: String(cr.amount),
                          description: cr.description,
                          credit_date: cr.credit_date,
                          reference: cr.reference || '',
                        });
                        setIsCreditOpen(true);
                      }}>
                        <Edit className="h-3 w-3 text-slate-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-400"
                        onClick={() => setDeleteTarget({ id: cr.id, table: 'admin_credits', name: 'credit entry' })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* ── BULK UPLOAD ── */}
      {!loading && tab === 'Bulk Upload' && (
        <div className="space-y-5">

          {/* Sub-tab switcher */}
          <div className="flex gap-1 p-1 bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl border border-slate-200/70 dark:border-white/10 rounded-xl w-fit shadow-md shadow-slate-200/30 dark:shadow-black/20">
            {(['office', 'field'] as const).map(key => (
              <button key={key} onClick={() => setBulkSubTab(key)}
                className={cn('px-4 py-2 rounded-lg text-sm font-semibold transition-all', bulkSubTab === key ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/30' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5')}>
                {key === 'office' ? '🏢 Office Expenses' : '🚗 Field Expenses'}
              </button>
            ))}
          </div>

          {/* ── OFFICE BULK ── */}
          {bulkSubTab === 'office' && <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Bulk Upload — Office Expenses</p>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600" onClick={() => setShowBulkHelp(v => !v)}>
              {showBulkHelp ? 'Hide instructions' : 'How does this work?'}
            </Button>
          </div>

          {showBulkHelp && (
            <div className="flex gap-3 p-3.5 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300">
              <FileUp className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Download the sample Excel template</li>
                <li>Fill your expense rows (keep column names exactly as-is)</li>
                <li>Upload — rows validated before saving</li>
                <li>Review preview, then click Upload to Supabase</li>
              </ol>
            </div>
          )}

          {/* Step 1 — Download sample */}
          <div className="bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/70 dark:border-white/10 rounded-2xl ring-1 ring-black/[0.03] dark:ring-white/5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
              <p className="font-semibold text-slate-800 dark:text-white text-sm">Download Sample Template</p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 ml-7">
              Columns: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">Date</code> <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">Category</code> <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">Spent By Name</code> <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">Description</code> <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">Remarks</code> <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">Amount</code>
              {' '}— Category &amp; Spent By are free text.
            </p>
            <div className="ml-7">
              <Button size="sm" onClick={handleSampleDownload} className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 shadow-md shadow-indigo-500/25 border-0">
                <Download className="h-4 w-4 mr-1.5" />Download Sample Excel
              </Button>
            </div>
          </div>

          {/* Step 2 — Upload file */}
          <div className="bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/70 dark:border-white/10 rounded-2xl ring-1 ring-black/[0.03] dark:ring-white/5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
              <p className="font-semibold text-slate-800 dark:text-white text-sm">Upload Filled Excel</p>
            </div>
            <div className="ml-8">
              <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${bulkFile ? 'border-green-400 bg-green-50 dark:bg-green-950/20' : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                <div className="flex flex-col items-center gap-1.5 text-center">
                  {bulkFile ? (
                    <>
                      <CheckCircle2 className="h-7 w-7 text-green-500" />
                      <p className="text-sm font-semibold text-green-700 dark:text-green-400">{bulkFile.name}</p>
                      <p className="text-xs text-slate-500">{bulkRows.length} valid rows · {bulkErrors.length} errors</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-7 w-7 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Click to select Excel file</p>
                      <p className="text-xs text-slate-400">.xlsx or .xls supported</p>
                    </>
                  )}
                </div>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkFilePick} />
              </label>
              {bulkFile && (
                <button onClick={handleBulkReset} className="mt-2 text-xs text-slate-400 hover:text-red-500 underline">
                  Clear and pick a different file
                </button>
              )}
            </div>
          </div>

          {/* Validation errors */}
          {bulkErrors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                {bulkErrors.length} row{bulkErrors.length > 1 ? 's' : ''} with errors (these will be skipped)
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {bulkErrors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400 font-mono">{e}</p>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          {bulkRows.length > 0 && (
            <div className="bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/70 dark:border-white/10 rounded-2xl ring-1 ring-black/[0.03] dark:ring-white/5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">Preview — {bulkRows.length} rows ready to upload</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Total: -₹{bulkRows.reduce((s, r) => s + r.amount, 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <Button
                  className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-md shadow-emerald-500/25 border-0 text-white"
                  onClick={handleBulkUpload}
                  disabled={bulkUploading || bulkDone}
                >
                  {bulkUploading
                    ? <><span className="animate-spin mr-1.5">⏳</span>Uploading…</>
                    : bulkDone
                      ? <><CheckCircle2 className="h-4 w-4 mr-1.5" />Uploaded!</>
                      : <><Upload className="h-4 w-4 mr-1.5" />Upload {bulkRows.length} rows to Supabase</>}
                </Button>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                    <tr>
                      {['#', 'Date', 'Category', 'Spent By', 'Description', 'Remarks', 'Amount'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {bulkRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">{r.expense_date}</td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px]">{r.category}</span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-800 dark:text-white whitespace-nowrap">
                          {r.spent_by_name || <span className="text-slate-400 font-normal italic text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 max-w-[180px] truncate">{r.description}</td>
                        <td className="px-3 py-2 text-slate-400 max-w-[140px] truncate">{r.remarks || '—'}</td>
                        <td className="px-3 py-2 font-bold text-red-600 whitespace-nowrap">-₹{Number(r.amount).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">TOTAL ({bulkRows.length} rows)</td>
                      <td className="px-3 py-2 font-black text-red-600 text-sm">
                        -₹{bulkRows.reduce((s, r) => s + r.amount, 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Success state */}
          {bulkDone && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <div>
                <p className="font-bold">Upload complete!</p>
                <p className="text-xs mt-0.5">All rows saved to Supabase. Go to <strong>Office Expenses</strong> tab to view them, or upload another file.</p>
              </div>
              <Button size="sm" variant="outline" className="ml-auto" onClick={handleBulkReset}>Upload More</Button>
            </div>
          )}
          </> }

          {/* ── FIELD BULK ── */}
          {bulkSubTab === 'field' && <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Bulk Upload — Field Expenses</p>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-violet-600" onClick={() => setShowBulkHelp(v => !v)}>
              {showBulkHelp ? 'Hide instructions' : 'How does this work?'}
            </Button>
          </div>

          {showBulkHelp && (
            <div className="flex gap-3 p-3.5 rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-900 text-xs text-violet-800 dark:text-violet-300">
              <FileUp className="h-4 w-4 shrink-0 mt-0.5 text-violet-500" />
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Download template — includes your registered employees list</li>
                <li>Fill Date, Employee Name, KM, Conveyance, Credit, Description</li>
                <li>Upload — employee name matched to ID automatically</li>
                <li>Entries saved as <strong>Approved</strong> directly (admin override)</li>
              </ol>
            </div>
          )}

          <div className="bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/70 dark:border-white/10 rounded-2xl ring-1 ring-black/[0.03] dark:ring-white/5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
              <p className="font-semibold text-slate-800 dark:text-white text-sm">Download Field Template</p>
            </div>
            <div className="ml-7 space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">Columns: Date, Employee Name, KM, Conveyance Rs, Credit Rs, Description</p>
              <Button size="sm" onClick={handleFieldSampleDownload} className="bg-violet-600 hover:bg-violet-700 text-white">
                <Download className="h-4 w-4 mr-1.5" />Download Field Template
              </Button>
            </div>
          </div>

          <div className="bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/70 dark:border-white/10 rounded-2xl ring-1 ring-black/[0.03] dark:ring-white/5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">2</span>
              <p className="font-semibold text-slate-800 dark:text-white text-sm">Upload Filled Excel</p>
            </div>
            <div className="ml-8">
              <label className={cn("flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors", fieldBulkFile ? "border-violet-400 bg-violet-50 dark:bg-violet-950/20" : "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800")}>
                <div className="flex flex-col items-center gap-1.5 text-center">
                  {fieldBulkFile ? (<>
                    <CheckCircle2 className="h-7 w-7 text-violet-500" />
                    <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">{fieldBulkFile.name}</p>
                    <p className="text-xs text-slate-500">{fieldBulkRows.length} valid rows · {fieldBulkErrors.length} errors</p>
                  </>) : (<>
                    <Upload className="h-7 w-7 text-slate-400" />
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Click to select Excel file</p>
                    <p className="text-xs text-slate-400">.xlsx or .xls supported</p>
                  </>)}
                </div>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFieldBulkFilePick} />
              </label>
              {fieldBulkFile && <button onClick={handleFieldBulkReset} className="mt-2 text-xs text-slate-400 hover:text-red-500 underline">Clear and pick different file</button>}
            </div>
          </div>

          {fieldBulkErrors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />{fieldBulkErrors.length} row{fieldBulkErrors.length > 1 ? "s" : ""} with errors (skipped)
              </div>
              <div className="space-y-0.5 max-h-36 overflow-y-auto">
                {fieldBulkErrors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400 font-mono">{e}</p>)}
              </div>
            </div>
          )}

          {fieldBulkRows.length > 0 && (
            <div className="bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/70 dark:border-white/10 rounded-2xl ring-1 ring-black/[0.03] dark:ring-white/5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex-wrap gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{fieldBulkRows.length} field entries ready</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Expense: -₹{fieldBulkRows.reduce((s,r) => s+r.conveyance_amount,0).toLocaleString("en-IN")} · Credit: +₹{fieldBulkRows.reduce((s,r) => s+r.credit_total,0).toLocaleString("en-IN")}
                  </p>
                </div>
                <Button className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-md shadow-emerald-500/25 border-0 text-white" onClick={handleFieldBulkUpload} disabled={fieldBulkUploading || fieldBulkDone}>
                  {fieldBulkUploading ? <><span className="animate-spin mr-1.5">⏳</span>Uploading…</> : fieldBulkDone ? <><CheckCircle2 className="h-4 w-4 mr-1.5" />Uploaded!</> : <><Upload className="h-4 w-4 mr-1.5" />Upload {fieldBulkRows.length} entries</>}
                </Button>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                    <tr>{["#","Date","Employee","KM","Conveyance","Credit","Description"].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {fieldBulkRows.map((r,i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="px-3 py-2 text-slate-400">{i+1}</td>
                        <td className="px-3 py-2 font-medium">{r.expense_date}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800 dark:text-white">{r.employee_name}</td>
                        <td className="px-3 py-2 text-blue-600">{r.kilometres > 0 ? r.kilometres : "—"}</td>
                        <td className="px-3 py-2 font-bold text-red-600">-₹{Number(r.conveyance_amount).toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2 font-bold text-green-600">{r.credit_total > 0 ? "+₹"+Number(r.credit_total).toLocaleString("en-IN") : "—"}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[220px] truncate">{r.description || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">TOTAL ({fieldBulkRows.length} rows)</td>
                      <td className="px-3 py-2 font-black text-red-600">-₹{fieldBulkRows.reduce((s,r) => s+r.conveyance_amount,0).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 font-black text-green-600">+₹{fieldBulkRows.reduce((s,r) => s+r.credit_total,0).toLocaleString("en-IN")}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {fieldBulkDone && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <div>
                <p className="font-bold">Field expenses uploaded & approved!</p>
                <p className="text-xs mt-0.5">All entries in Supabase as approved. View in <strong>Field Expenses</strong> tab.</p>
              </div>
              <Button size="sm" variant="outline" className="ml-auto" onClick={handleFieldBulkReset}>Upload More</Button>
            </div>
          )}
          </> }

        </div>
      )}

      {/* ── LEDGER ── */}
      {!loading && tab === 'Ledger' && (
        <div className="space-y-4">
          {/* Source Filter + Search bar */}
          {(() => {
            const bySource = ledgerSourceFilter === 'all'
              ? ledger
              : ledger.filter(r => r.source === ledgerSourceFilter);
            const fl = ledgerSearch
              ? bySource.filter(r => (r.person + r.desc + r.source + r.date + r.category).toLowerCase().includes(ledgerSearch.toLowerCase()))
              : bySource;
            const flExp    = fl.reduce((s,r) => s + r.expense, 0);
            const flCredit = fl.reduce((s,r) => s + r.credit, 0);
            const flNet    = flCredit + flExp;
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Source filter — choose first */}
                  <Select value={ledgerSourceFilter} onValueChange={(v: any) => setLedgerSourceFilter(v)}>
                    <SelectTrigger className="w-40 h-9 text-xs shrink-0">
                      <SelectValue placeholder="All Sources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">📋 All Sources</SelectItem>
                      <SelectItem value="Field">🚗 Field Expense</SelectItem>
                      <SelectItem value="Office">🏢 Office Expense</SelectItem>
                      <SelectItem value="Employee">👔 Employee Expense</SelectItem>
                      <SelectItem value="Credit">💰 Credit</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Search — filters within chosen source */}
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      value={ledgerSearch}
                      onChange={e => setLedgerSearch(e.target.value)}
                      placeholder={ledgerSourceFilter === 'all' ? 'Search name, category, description…' : `Search within ${ledgerSourceFilter}…`}
                      className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {ledgerSearch && (
                      <button onClick={() => setLedgerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 text-lg leading-none">&times;</button>
                    )}
                  </div>

                  {(ledgerSourceFilter !== 'all' || ledgerSearch) && (
                    <Button size="sm" variant="ghost" className="h-9 text-xs text-slate-400"
                      onClick={() => { setLedgerSourceFilter('all'); setLedgerSearch(''); }}>Clear</Button>
                  )}

                  <span className="text-xs text-slate-400 whitespace-nowrap ml-auto">
                    {fl.length} of {ledger.length} entries
                  </span>
                </div>
                {(ledgerSourceFilter !== 'all' || ledgerSearch) && (
                  <div className="flex gap-3 flex-wrap text-xs px-1 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <span className="text-red-600 font-bold">Expense: -₹{Math.abs(flExp).toFixed(0)}</span>
                    <span className="text-green-600 font-bold">Credit: +₹{flCredit.toFixed(0)}</span>
                    <span className={`font-black ${flNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Net: {flNet >= 0 ? '+' : '-'}₹{Math.abs(flNet).toFixed(0)}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Spend by Person — collapsible, 2-column (Field left, Office right) */}
          {spendByPerson.length > 0 && (
            <div className="bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/70 dark:border-white/10 rounded-2xl ring-1 ring-black/[0.03] dark:ring-white/5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 overflow-hidden">
              <button
                onClick={() => setShowSpendByPerson(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
              >
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Spent — By Person ({spendByPerson.length})</span>
                <span className="text-xs text-blue-600 font-semibold">{showSpendByPerson ? 'Hide' : 'Show'}</span>
              </button>
              {showSpendByPerson && (() => {
                const fieldPeople  = spendByPerson.filter(p => p.source === 'Field');
                const officePeople = spendByPerson.filter(p => p.source !== 'Field');
                const hasEmployee  = officePeople.some(p => p.source === 'Employee');
                const Row = ({ name, amount }: { name: string; amount: number; key?: any }) => (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex-1 truncate">{name}</span>
                    <span className="text-xs font-black text-red-500 whitespace-nowrap">-₹{amount.toFixed(0)}</span>
                  </div>
                );
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 pt-0 border-t border-slate-100 dark:border-slate-700">
                    <div className="space-y-1.5 pt-3">
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide px-1">🚗 Field</p>
                      {fieldPeople.length === 0
                        ? <p className="text-xs text-slate-400 px-1">No field spending</p>
                        : fieldPeople.map(p => <Row key={`f-${p.name}`} name={p.name} amount={p.amount} />)}
                    </div>
                    <div className="space-y-1.5 pt-3 sm:border-l sm:border-slate-100 dark:sm:border-slate-700 sm:pl-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide px-1">🏢 {hasEmployee ? 'Office / Employee' : 'Office'}</p>
                      {officePeople.length === 0
                        ? <p className="text-xs text-slate-400 px-1">No office spending</p>
                        : officePeople.map(p => <Row key={`o-${p.name}`} name={p.name} amount={p.amount} />)}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Overall totals */}
          {ledger.length > 0 && (() => {
            const totExp    = ledger.reduce((s,r) => s + r.expense, 0);
            const totCredit = ledger.reduce((s,r) => s + r.credit, 0);
            const totNet    = totCredit + totExp;
            const hasCredit = totCredit > 0;
            return hasCredit ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-rose-200/70 dark:border-rose-500/20 bg-rose-50/80 dark:bg-rose-500/10 backdrop-blur-xl p-3 text-center shadow-sm">
                  <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Total Expense</p>
                  <p className="text-lg font-black text-rose-500 mt-0.5">-₹{Math.abs(totExp).toFixed(0)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-500/20 bg-emerald-50/80 dark:bg-emerald-500/10 backdrop-blur-xl p-3 text-center shadow-sm">
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Total Credit</p>
                  <p className="text-lg font-black text-emerald-500 mt-0.5">+₹{totCredit.toFixed(0)}</p>
                </div>
                <div className={`rounded-2xl p-3 text-center border backdrop-blur-xl shadow-sm ${totNet >= 0 ? 'bg-emerald-50/80 dark:bg-emerald-500/10 border-emerald-200/70 dark:border-emerald-500/20' : 'bg-rose-50/80 dark:bg-rose-500/10 border-rose-200/70 dark:border-rose-500/20'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${totNet >= 0 ? 'text-emerald-500' : 'text-rose-400'}`}>Net P&L</p>
                  <p className={`text-lg font-black mt-0.5 ${totNet >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {totNet >= 0 ? '+' : '-'}₹{Math.abs(totNet).toFixed(0)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-rose-200/70 dark:border-rose-500/20 bg-rose-50/80 dark:bg-rose-500/10 backdrop-blur-xl p-3 flex items-center justify-between shadow-sm">
                <p className="text-xs font-bold text-rose-500 uppercase tracking-wider">Total Spent (all entries)</p>
                <p className="text-xl font-black text-rose-500">-₹{Math.abs(totExp).toFixed(0)}</p>
              </div>
            );
          })()}

          {/* Ledger table */}
          <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl ring-1 ring-black/[0.03] dark:ring-white/5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 overflow-hidden overflow-x-auto">
            <table className="w-full text-xs min-w-[760px] border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200/70 dark:border-white/10">
                <tr>
                  {['Date','Source','Spent By','Category','Description','Expense','Credit','Balance'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70 dark:divide-white/5">
                {(() => {
                    const bySource = ledgerSourceFilter === 'all'
                      ? ledger
                      : ledger.filter(r => r.source === ledgerSourceFilter);
                    const fl = ledgerSearch
                      ? bySource.filter(r => (r.person + r.desc + r.source + r.date + r.category).toLowerCase().includes(ledgerSearch.toLowerCase()))
                      : bySource;
                    if (fl.length === 0) return (<tr><td colSpan={8} className="py-10 text-center text-slate-400 text-sm">{ledgerSearch || ledgerSourceFilter !== 'all' ? 'No matching entries' : 'No approved entries'}</td></tr>);
                    return fl.map((r, i) => (
                    <tr key={i} className="hover:bg-indigo-50/40 dark:hover:bg-white/[0.03] align-top transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500 text-xs font-mono">{r.date}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                          r.source==='Field'    ? 'bg-indigo-500/10 text-indigo-500' :
                          r.source==='Employee' ? 'bg-violet-500/10 text-violet-500' :
                          r.source==='Credit'   ? 'bg-emerald-500/10 text-emerald-500' :
                                                  'bg-slate-500/10 text-slate-500'}`}>
                          {r.source}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100 text-xs whitespace-nowrap">{r.person}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{r.category}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs max-w-[180px] truncate">{r.desc}</td>
                      <td className="px-3 py-2 text-xs font-bold font-mono whitespace-nowrap">
                        {r.expense < 0
                          ? <span className="text-rose-500">-₹{Math.abs(r.expense).toFixed(0)}</span>
                          : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs font-bold font-mono whitespace-nowrap">
                        {r.credit > 0
                          ? <span className="text-emerald-500">+₹{r.credit.toFixed(0)}</span>
                          : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full font-black text-[11px] font-mono ${r.running >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                          {r.running >= 0 ? '+' : '-'}₹{Math.abs(r.running).toFixed(0)}
                        </span>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                Set per-employee monthly limits. Employees will be blocked from submitting expenses beyond their budget.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {employees.length === 0 ? (
                <p className="text-slate-400 text-sm py-4 text-center">No employees found</p>
              ) : (
                employees.map(emp => {
                  const budget = budgets[emp.id];
                  const used   = empBudgetUsage[emp.id] || 0;
                  const limit  = budget?.monthly_limit || 0;
                  const pct    = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                  const overBudget = limit > 0 && used > limit;

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
                          <p className={cn("text-sm font-bold", overBudget ? "text-red-600" : "text-slate-700 dark:text-slate-300")}>
                            ₹{used.toFixed(0)} used
                          </p>
                          {limit > 0 && (
                            <p className="text-[10px] text-slate-400">of ₹{limit.toFixed(0)} limit</p>
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      {limit > 0 && (
                        <div className="space-y-1">
                          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", overBudget ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className={cn("text-[10px] font-medium", overBudget ? "text-red-600" : "text-slate-400")}>
                            {overBudget ? `⚠️ Over budget by ₹${(used - limit).toFixed(0)}` : `${pct.toFixed(0)}% used`}
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
                          {savingBudget === emp.id ? 'Saving...' : budget ? 'Update' : 'Set Budget'}
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
            <p className="text-sm text-slate-600">Rejection reason (shown to field boy):</p>
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

      {/* Bulk Delete Confirmation */}
      <Dialog open={!!bulkDeleteConfirm} onOpenChange={v => { if (!v) setBulkDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Confirm Bulk Delete
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            Delete <strong>{bulkDeleteConfirm?.ids.length}</strong> selected {bulkDeleteConfirm?.table === 'field_expenses' ? 'field' : 'office'} expense entries? This cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkDeleteConfirm(null)} disabled={bulkDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? 'Deleting…' : `Delete ${bulkDeleteConfirm?.ids.length || ''} Entries`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Office Expense */}
      <Dialog open={isOfficeOpen} onOpenChange={v => { if (!v) { setIsOfficeOpen(false); setEditOfficeId(null); setOfficeForm(EMPTY_OFFICE_FORM); }}}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editOfficeId ? 'Edit' : 'Add'} Office Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Category *</label>
              <Input
                list="office-cat-suggestions"
                placeholder="e.g. Refreshment, Ice, Recharge…"
                value={officeForm.category}
                onChange={e => setOfficeForm(p => ({ ...p, category: e.target.value }))}
              />
              <datalist id="office-cat-suggestions">
                {COMMON_OFFICE_CATS.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Spent By Name</label>
              <Input
                list="office-emp-suggestions"
                placeholder="e.g. Ram, Vishnu, Store…"
                value={officeForm.spent_by_name || ''}
                onChange={e => setOfficeForm(p => ({ ...p, spent_by_name: e.target.value }))}
              />
              <datalist id="office-emp-suggestions">
                {employees.map(e => <option key={e.id} value={e.name} />)}
              </datalist>
            </div>
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
                placeholder="e.g. Tea, Recharge Neha, Bill Payment…"
                value={officeForm.description}
                onChange={e => setOfficeForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Remarks (optional)</label>
              <Input
                placeholder="Extra note, e.g. Transfer Sumt ptm"
                value={officeForm.remarks || ''}
                onChange={e => setOfficeForm(p => ({ ...p, remarks: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsOfficeOpen(false); setEditOfficeId(null); setOfficeForm(EMPTY_OFFICE_FORM); }}>
              Cancel
            </Button>
            <Button onClick={saveOffice} disabled={saving}>
              {saving ? 'Saving...' : editOfficeId ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Admin Credit */}
      <Dialog open={isCreditOpen} onOpenChange={v => { if (!v) { setIsCreditOpen(false); setEditCreditId(null); setCreditForm(EMPTY_CREDIT_FORM); }}}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editCreditId ? 'Edit' : 'Add'} Credit Entry</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 -mt-2">This will be counted as positive credit (+) and improve profit.</p>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Credit Type *</label>
              <Select value={creditForm.category} onValueChange={v => setCreditForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CREDIT_CAT_LABELS).map(([k,label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {creditForm.category === 'other' && (
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Custom Type *</label>
                <Input
                  value={creditForm.custom_category}
                  onChange={e => setCreditForm(p => ({ ...p, custom_category: e.target.value }))}
                  placeholder="e.g. Old Balance Recovery"
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
                placeholder="e.g. SIM activation charges from customer"
                value={creditForm.description}
                onChange={e => setCreditForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Reference / Invoice No. (optional)</label>
              <Input
                placeholder="e.g. INV-1024"
                value={creditForm.reference}
                onChange={e => setCreditForm(p => ({ ...p, reference: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsCreditOpen(false); setEditCreditId(null); setCreditForm(EMPTY_CREDIT_FORM); }}>
              Cancel
            </Button>
            <Button className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-md shadow-emerald-500/25 border-0" onClick={saveCredit} disabled={savingCredit}>
              {savingCredit ? 'Saving...' : editCreditId ? 'Update' : 'Add Credit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Field Expense (Admin manual entry) */}
      <Dialog open={isFieldAddOpen} onOpenChange={v => { if (!v) { setIsFieldAddOpen(false); setFieldAddForm(EMPTY_FIELD_FORM); }}}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Field Expense</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 -mt-2">Entry will be saved as Approved directly (admin entry).</p>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Employee *</label>
              <Select value={fieldAddForm.field_boy_id} onValueChange={v => setFieldAddForm(p => ({ ...p, field_boy_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Date *</label>
                <Input
                  type="date"
                  value={fieldAddForm.expense_date}
                  onChange={e => setFieldAddForm(p => ({ ...p, expense_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">KM</label>
                <Input
                  type="number" min="0" step="0.1" placeholder="0"
                  value={fieldAddForm.kilometres}
                  onChange={e => setFieldAddForm(p => ({ ...p, kilometres: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Conveyance ₹ *</label>
                <Input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={fieldAddForm.conveyance_amount}
                  onChange={e => setFieldAddForm(p => ({ ...p, conveyance_amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Credit ₹</label>
                <Input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={fieldAddForm.credit_total}
                  onChange={e => setFieldAddForm(p => ({ ...p, credit_total: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Description</label>
              <Input
                placeholder="e.g. Visit charges, SIM sale…"
                value={fieldAddForm.description}
                onChange={e => setFieldAddForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsFieldAddOpen(false); setFieldAddForm(EMPTY_FIELD_FORM); }}>
              Cancel
            </Button>
            <Button onClick={saveFieldAdd} disabled={savingFieldAdd}>
              {savingFieldAdd ? 'Saving...' : 'Add Entry'}
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
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Conveyance ₹</label>
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
