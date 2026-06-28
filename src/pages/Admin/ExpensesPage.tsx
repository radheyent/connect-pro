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
import { CheckCircle, XCircle, Trash2, Edit, Download, Plus, Settings, TrendingUp, TrendingDown, IndianRupee, Users, ShieldAlert, Upload, FileUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';

const TABS = ['Overview', 'Pending', 'Field Expenses', 'Office Expenses', 'Bulk Upload', 'Ledger', 'Budget'] as const;
type TabType = typeof TABS[number];

const OFFICE_CATS = [
  'tea_refreshments','stationary','rent',
  'electricity','internet','salary','miscellaneous','other',
];
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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [feRes, oeRes, upRes, setRes, budgetRes, eeRes] = await Promise.all([
        supabase.from('field_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('office_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('user_profiles').select('id,name').eq('is_active', true),
        supabase.from('app_settings').select('value').eq('key','km_rate_per_km').single(),
        // Try to fetch budgets — table may not exist yet, silently handle
        supabase.from('expense_budgets').select('*'),
        supabase.from('employee_expenses').select('*').order('expense_date', { ascending: false }),
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
    const fieldConv = af.reduce((s,e) => s + (Number(e.conveyance_amount)||0), 0);
    const credit    = af.reduce((s,e) => s + (Number(e.credit_total)||0), 0);
    const km        = af.reduce((s,e) => s + (Number(e.kilometres)||0), 0);
    const office    = oe.reduce((s,e) => s + (Number(e.amount)||0), 0);
    const empTotal  = ae.reduce((s,e) => s + (Number(e.amount)||0), 0);
    const totalExpense = fieldConv + office + empTotal;
    const profit = credit - totalExpense;
    return { fieldConv, credit, km, office: office + empTotal, net: totalExpense - credit, totalExpense, profit };
  }, [fieldExp, officeExp, empExp]);

  const summary      = useMemo(() => computeSummary(thisMonth), [computeSummary, thisMonth]);
  const monthSummary = useMemo(() => computeSummary(monthView), [computeSummary, monthView]);

  const allMonths = useMemo(() => {
    const months = new Set([
      ...fieldExp.map(e => e.expense_date?.slice(0,7)).filter(Boolean),
      ...officeExp.map(e => e.expense_date?.slice(0,7)).filter(Boolean),
      ...empExp.map(e => e.expense_date?.slice(0,7)).filter(Boolean),
    ]);
    return [...months].sort().reverse();
  }, [fieldExp, officeExp, empExp]);

  const filteredField = useMemo(() => fieldExp.filter(e => {
    if (empFilter !== 'all' && e.field_boy_id !== empFilter) return false;
    if (dateFrom && e.expense_date < dateFrom) return false;
    if (dateTo   && e.expense_date > dateTo)   return false;
    return true;
  }), [fieldExp, empFilter, dateFrom, dateTo]);

  const ledger = useMemo(() => {
    const rows = [
      ...fieldExp
        .filter(e => e.status === 'approved')
        .map(e => ({
          date:    e.expense_date,
          source:  'Field',
          person:  empMap[e.field_boy_id] || '—',
          desc:    leadMap[e.lead_id] || e.description || 'Ad-hoc',
          km:      Number(e.kilometres) || 0,
          expense: -(Number(e.conveyance_amount) || 0),   // always negative
          credit:  +(Number(e.credit_total) || 0),         // always positive
        })),
      ...officeExp.map(e => ({
        date:    e.expense_date,
        source:  'Office',
        person:  CAT_LABELS[e.category] || e.custom_category || e.category,
        desc:    e.description,
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
          desc:    `${CAT_LABELS[e.category] || e.custom_category || e.category} — ${e.description}`,
          km:      0,
          expense: -(Number(e.amount) || 0),               // always negative
          credit:  0,
        })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));

    // running = cumulative (credit + expense) — positive = profit, negative = loss
    let running = 0;
    return rows.map(r => {
      const net = r.credit + r.expense; // credit(+) + expense(-)
      running += net;
      return { ...r, net, running };
    });
  }, [fieldExp, officeExp, empExp, empMap, leadMap]);

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

  const BULK_COLUMNS = ['Date (YYYY-MM-DD)', 'Category', 'Amount', 'Description'] as const;
  const VALID_CATS = ['tea_refreshments','stationary','rent','electricity','internet','salary','miscellaneous','other'];

  const handleSampleDownload = () => {
    const sampleRows = [
      { 'Date (YYYY-MM-DD)': '2026-06-01', Category: 'tea_refreshments', Amount: 150,  Description: 'Morning tea for team' },
      { 'Date (YYYY-MM-DD)': '2026-06-02', Category: 'stationary',       Amount: 340,  Description: 'Pens and registers' },
      { 'Date (YYYY-MM-DD)': '2026-06-03', Category: 'rent',             Amount: 15000, Description: 'Monthly office rent' },
      { 'Date (YYYY-MM-DD)': '2026-06-04', Category: 'electricity',      Amount: 2200, Description: 'June electricity bill' },
      { 'Date (YYYY-MM-DD)': '2026-06-05', Category: 'internet',         Amount: 999,  Description: 'Broadband monthly' },
      { 'Date (YYYY-MM-DD)': '2026-06-06', Category: 'salary',           Amount: 12000, Description: 'Staff salary - Rahul' },
      { 'Date (YYYY-MM-DD)': '2026-06-07', Category: 'miscellaneous',    Amount: 500,  Description: 'Miscellaneous costs' },
      { 'Date (YYYY-MM-DD)': '2026-06-08', Category: 'other',            Amount: 750,  Description: 'Other expense' },
    ];
    const infoRows = [
      { '': '--- VALID CATEGORIES ---' },
      ...VALID_CATS.map(c => ({ '': c })),
      { '': '' },
      { '': 'NOTE: Date must be YYYY-MM-DD format (e.g. 2026-06-15)' },
      { '': 'NOTE: Amount must be a number (no ₹ symbol)' },
      { '': 'NOTE: Delete sample rows and add your real data' },
    ];
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sampleRows);
    ws1['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 40 }];
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
          const rowNum = i + 2; // Excel row number (1=header)
          const date     = String(row['Date (YYYY-MM-DD)'] || '').trim();
          const category = String(row['Category'] || '').trim().toLowerCase().replace(/\s+/g, '_');
          const amount   = parseFloat(String(row['Amount'] || '').replace(/[₹,\s]/g, ''));
          const desc     = String(row['Description'] || '').trim();

          const rowErrors: string[] = [];
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date))   rowErrors.push(`invalid date "${date}"`);
          if (!VALID_CATS.includes(category))          rowErrors.push(`unknown category "${category}"`);
          if (isNaN(amount) || amount <= 0)            rowErrors.push(`invalid amount "${row['Amount']}"`);
          if (!desc)                                   rowErrors.push('description is empty');

          if (rowErrors.length) {
            errors.push(`Row ${rowNum}: ${rowErrors.join(', ')}`);
          } else {
            parsed.push({ expense_date: date, category, amount, description: desc, _ok: true });
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
        expense_date:    r.expense_date,
        category:        r.category,
        custom_category: null,
        amount:          r.amount,
        description:     r.description,
        added_by:        user!.id,
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

  // ── FieldExpRow ────────────────────────────────────────────────────────────
  const FieldRow = ({ exp, showActions = true }: { exp: any; showActions?: boolean; key?: any }) => {
    const budget = budgets[exp.field_boy_id];
    const used   = empBudgetUsage[exp.field_boy_id] || 0;
    const overBudget = budget && used > budget.monthly_limit;

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
          <div className="flex gap-3 flex-wrap text-xs">
            <span className="text-slate-500">{exp.expense_date}</span>
            <span className="text-blue-600 font-medium">{exp.kilometres} km</span>
            <span className="text-orange-600 font-medium">₹{exp.conveyance_amount}</span>
            {Number(exp.credit_total) > 0 && <span className="text-green-600 font-medium">Credit ₹{exp.credit_total}</span>}
            {exp.notes && <span className="text-slate-400 italic">{exp.notes}</span>}
          </div>
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
        <h1 className="text-2xl font-bold dark:text-white">Expenses</h1>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Field Conveyance',  val: `−₹${summary.fieldConv.toFixed(0)}`, color: 'text-red-600' },
              { label: 'Office Expenses',   val: `−₹${summary.office.toFixed(0)}`,    color: 'text-red-600' },
              { label: 'Credit Collected',  val: `+₹${summary.credit.toFixed(0)}`,    color: 'text-green-600' },
              { label: 'Total KM (month)',  val: `${summary.km.toFixed(1)} km`,       color: 'text-blue-600' },
            ].map(({ label, val, color }) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <p className={`text-2xl font-black ${color}`}>{val}</p>
                  <p className="text-xs text-slate-500 mt-1">{label} — This Month</p>
                </CardContent>
              </Card>
            ))}
          </div>

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
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">This Month — Net Profit</p>
                <p className="text-xs text-slate-400 mt-0.5">Credit Collected − (Field + Office Expense)</p>
                <p className="text-xs text-slate-400">₹{summary.credit.toFixed(0)} − ₹{summary.totalExpense.toFixed(0)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-4xl font-black ${summary.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {summary.profit >= 0 ? '+' : ''}₹{Math.abs(summary.profit).toFixed(0)}
              </p>
              <p className={`text-xs font-semibold mt-0.5 ${summary.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {summary.profit >= 0 ? '▲ Profitable' : '▼ Loss'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <Card>
              <CardContent className="p-4">
                <p className="text-3xl font-black text-yellow-600">{pendingCount}</p>
                <p className="text-xs text-slate-500 mt-1">Pending approvals</p>
              </CardContent>
            </Card>
          </div>

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
                  { label: 'Field Conveyance', val: `−₹${monthSummary.fieldConv.toFixed(0)}`, color: 'text-red-600' },
                  { label: 'Office Expenses',  val: `−₹${monthSummary.office.toFixed(0)}`,    color: 'text-red-600' },
                  { label: 'Credit Collected', val: `+₹${monthSummary.credit.toFixed(0)}`,    color: 'text-green-600' },
                  { label: 'Net P&L',          val: `${monthSummary.profit >= 0 ? '+' : '−'}₹${Math.abs(monthSummary.profit).toFixed(0)}`,
                    color: monthSummary.profit >= 0 ? 'text-green-600' : 'text-red-600' },
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
                            <td className="px-2 py-2 text-red-600 font-medium">−₹{s.fieldConv.toFixed(0)}</td>
                            <td className="px-2 py-2 text-red-500 font-medium">−₹{s.office.toFixed(0)}</td>
                            <td className="px-2 py-2 text-green-600 font-medium">+₹{s.credit.toFixed(0)}</td>
                            <td className={`px-2 py-2 font-black ${s.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {s.profit >= 0 ? '+' : '−'}₹{Math.abs(s.profit).toFixed(0)}
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
                {/* Employee (office staff) pending */}
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
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs text-slate-600 dark:text-slate-300">
                                {CAT_LABELS[exp.category] || exp.custom_category || exp.category}
                              </span>
                              <StatusBadge s={exp.status} />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{exp.description}</p>
                            <div className="flex gap-3 text-xs">
                              <span className="text-slate-400">{exp.expense_date}</span>
                              <span className="text-orange-600 font-bold">₹{exp.amount}</span>
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

                {/* Field Boy pending */}
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
            <span className="text-xs text-slate-400 ml-auto">{filteredField.length} entries</span>
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

          {/* Admin-added Office Expenses */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">🏢 Office Expenses (Admin Added)</p>
              <Button size="sm" onClick={() => { setEditOfficeId(null); setOfficeForm(EMPTY_OFFICE_FORM); setIsOfficeOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" />Add
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
                        <span className="text-orange-600 font-bold text-sm">₹{exp.amount}</span>
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

          {/* Employee submitted expenses — all statuses */}
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
                        <span className="font-semibold text-sm text-slate-900 dark:text-white">{empMap[exp.user_id] || '—'}</span>
                        <span className="text-xs text-slate-500">{CAT_LABELS[exp.category] || exp.custom_category || exp.category}</span>
                        <StatusBadge s={exp.status} />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{exp.description}</p>
                      <div className="flex gap-3 text-xs">
                        <span className="text-slate-400">{exp.expense_date}</span>
                        <span className="text-orange-600 font-bold">₹{exp.amount}</span>
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

      {/* ── BULK UPLOAD ── */}
      {!loading && tab === 'Bulk Upload' && (
        <div className="space-y-5">

          {/* Header info */}
          <div className="flex gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300">
            <FileUp className="h-5 w-5 shrink-0 mt-0.5 text-blue-500" />
            <div>
              <p className="font-bold text-sm mb-1">Bulk Upload Office Expenses</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Download the sample Excel template below</li>
                <li>Fill your expense rows (keep column names exactly as-is)</li>
                <li>Upload the filled file — rows will be validated before saving</li>
                <li>Review the preview, then click <strong>Upload to Supabase</strong></li>
              </ol>
            </div>
          </div>

          {/* Step 1 — Download sample */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
              <p className="font-semibold text-slate-800 dark:text-white text-sm">Download Sample Template</p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 ml-8">
              Template has 4 required columns: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">Date (YYYY-MM-DD)</code>, <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">Category</code>, <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">Amount</code>, <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">Description</code>
            </p>
            <div className="ml-8">
              <div className="flex flex-wrap gap-1 mb-3">
                {['tea_refreshments','stationary','rent','electricity','internet','salary','miscellaneous','other'].map(c => (
                  <span key={c} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px] font-mono">{c}</span>
                ))}
              </div>
              <Button size="sm" onClick={handleSampleDownload} className="bg-blue-600 hover:bg-blue-700">
                <Download className="h-4 w-4 mr-1.5" />Download Sample Excel
              </Button>
            </div>
          </div>

          {/* Step 2 — Upload file */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
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
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">Preview — {bulkRows.length} rows ready to upload</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Total: −₹{bulkRows.reduce((s, r) => s + r.amount, 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
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
                      {['#', 'Date', 'Category', 'Amount', 'Description'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {bulkRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-medium">{r.expense_date}</td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px] font-mono">
                            {CAT_ICONS[r.category] || '📋'} {CAT_LABELS[r.category] || r.category}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-bold text-red-600">−₹{Number(r.amount).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 max-w-[220px] truncate">{r.description}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">TOTAL ({bulkRows.length} rows)</td>
                      <td className="px-3 py-2 font-black text-red-600 text-sm">
                        −₹{bulkRows.reduce((s, r) => s + r.amount, 0).toLocaleString('en-IN')}
                      </td>
                      <td></td>
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
        </div>
      )}

      {/* ── LEDGER ── */}
      {!loading && tab === 'Ledger' && (
        <div className="space-y-3">
          {/* Summary bar */}
          {ledger.length > 0 && (() => {
            const totExp    = ledger.reduce((s,r) => s + r.expense, 0); // negative
            const totCredit = ledger.reduce((s,r) => s + r.credit, 0);  // positive
            const totNet    = totCredit + totExp;
            return (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Total Expense</p>
                  <p className="text-lg font-black text-red-600 mt-0.5">−₹{Math.abs(totExp).toFixed(0)}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Total Credit</p>
                  <p className="text-lg font-black text-green-600 mt-0.5">+₹{totCredit.toFixed(0)}</p>
                </div>
                <div className={`rounded-xl p-3 text-center border ${totNet >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${totNet >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>Net P&L</p>
                  <p className={`text-lg font-black mt-0.5 ${totNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {totNet >= 0 ? '+' : '−'}₹{Math.abs(totNet).toFixed(0)}
                  </p>
                </div>
              </div>
            );
          })()}

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {['Date','Source','Person','Description','KM','Expense','Credit','Net','Balance'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {ledger.length === 0
                  ? <tr><td colSpan={9} className="py-12 text-center text-slate-400">No approved entries</td></tr>
                  : ledger.map((r, i) => (
                    <tr key={i} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${r.net < 0 ? '' : 'bg-green-50/40 dark:bg-green-950/10'}`}>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 font-medium">{r.date}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          r.source==='Field'    ? 'bg-blue-100 text-blue-700' :
                          r.source==='Employee' ? 'bg-violet-100 text-violet-700' :
                                                  'bg-slate-100 text-slate-600'}`}>
                          {r.source}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-200">{r.person}</td>
                      <td className="px-3 py-2.5 text-slate-500 max-w-[150px] truncate">{r.desc}</td>
                      <td className="px-3 py-2.5 text-blue-600">{r.km > 0 ? r.km : '—'}</td>

                      {/* Expense — always shown red negative */}
                      <td className="px-3 py-2.5 font-semibold">
                        {r.expense < 0
                          ? <span className="text-red-600">−₹{Math.abs(r.expense).toFixed(0)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      {/* Credit — always shown green positive */}
                      <td className="px-3 py-2.5 font-semibold">
                        {r.credit > 0
                          ? <span className="text-green-600">+₹{r.credit.toFixed(0)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      {/* Net per row — green if profit, red if loss */}
                      <td className="px-3 py-2.5 font-bold">
                        {r.net > 0
                          ? <span className="text-green-600">+₹{r.net.toFixed(0)}</span>
                          : r.net < 0
                            ? <span className="text-red-600">−₹{Math.abs(r.net).toFixed(0)}</span>
                            : <span className="text-slate-400">₹0</span>}
                      </td>

                      {/* Running balance — green positive, red negative */}
                      <td className="px-3 py-2.5">
                        <span className={`font-black text-sm ${r.running >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {r.running >= 0 ? '+' : '−'}₹{Math.abs(r.running).toFixed(0)}
                        </span>
                      </td>
                    </tr>
                  ))
                }
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

      {/* Add/Edit Office Expense */}
      <Dialog open={isOfficeOpen} onOpenChange={v => { if (!v) { setIsOfficeOpen(false); setEditOfficeId(null); setOfficeForm(EMPTY_OFFICE_FORM); }}}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editOfficeId ? 'Edit' : 'Add'} Office Expense</DialogTitle>
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
              {saving ? 'Saving...' : editOfficeId ? 'Update' : 'Add'}
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
