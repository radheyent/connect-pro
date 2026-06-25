import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Plus, Trash2, Edit, Download, IndianRupee, AlertTriangle, Receipt } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';

// ── Employee-specific categories ─────────────────────────────────────────────
const EXPENSE_CATS = [
  'tea_refreshments',
  'stationary',
  'travel',
  'food',
  'internet',
  'other',
] as const;

const CAT_LABELS: Record<string, string> = {
  tea_refreshments: '☕ Tea & Refreshments',
  stationary:       '📝 Stationary',
  travel:           '🚌 Customer Bill Payment',
  food:             '💸 Amt Transfer Customer',
  internet:         '📶 Self Recharge',
  other:            '➕ Other',
};

const CAT_ICONS: Record<string, string> = {
  tea_refreshments: '☕',
  stationary:       '📝',
  travel:           '🚌',
  food:             '💸',
  internet:         '📶',
  other:            '➕',
};

// Light pastel chip colors per category
const CAT_CHIP_COLORS: Record<string, string> = {
  tea_refreshments: 'border-amber-200   bg-amber-50   text-amber-700   data-[sel=true]:border-amber-400   data-[sel=true]:bg-amber-100   data-[sel=true]:text-amber-800',
  stationary:       'border-sky-200     bg-sky-50     text-sky-700     data-[sel=true]:border-sky-400     data-[sel=true]:bg-sky-100     data-[sel=true]:text-sky-800',
  travel:           'border-violet-200  bg-violet-50  text-violet-700  data-[sel=true]:border-violet-400  data-[sel=true]:bg-violet-100  data-[sel=true]:text-violet-800',
  food:             'border-green-200   bg-green-50   text-green-700   data-[sel=true]:border-green-400   data-[sel=true]:bg-green-100   data-[sel=true]:text-green-800',
  internet:         'border-blue-200    bg-blue-50    text-blue-700    data-[sel=true]:border-blue-400    data-[sel=true]:bg-blue-100    data-[sel=true]:text-blue-800',
  other:            'border-rose-200    bg-rose-50    text-rose-700    data-[sel=true]:border-rose-400    data-[sel=true]:bg-rose-100    data-[sel=true]:text-rose-800',
};

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved: 'bg-green-100  text-green-800  border-green-200',
  rejected: 'bg-red-100    text-red-800    border-red-200',
};
const STATUS_ICONS: Record<string, string> = {
  pending: '🟡', approved: '✅', rejected: '❌'
};

const EMPTY_FORM = {
  category:        'tea_refreshments',
  custom_category: '',
  amount:          '',
  description:     '',
  expense_date:    new Date().toISOString().split('T')[0],
};

// ── StatusBadge ───────────────────────────────────────────────────────────────
const StatusBadge = ({ s }: { s: string }) => (
  <span className={cn(
    'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border',
    STATUS_STYLES[s] || 'bg-slate-100 text-slate-600 border-slate-200'
  )}>
    {STATUS_ICONS[s] || '⚪'} {s.charAt(0).toUpperCase() + s.slice(1)}
  </span>
);

// ── Main Page ─────────────────────────────────────────────────────────────────
const EmployeeExpensesPage: React.FC = () => {
  const { user } = useAuth();

  const [expenses,    setExpenses]    = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [isAddOpen,   setIsAddOpen]   = useState(false);
  const [editId,      setEditId]      = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth,  setFilterMonth]  = useState(new Date().toISOString().slice(0, 7));

  // Budget state
  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(null);
  const [budgetNote,    setBudgetNote]    = useState('');

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [expRes, budgetRes] = await Promise.all([
        supabase
          .from('employee_expenses')
          .select('*')
          .eq('user_id', user.id)
          .order('expense_date', { ascending: false }),
        supabase
          .from('expense_budgets')
          .select('monthly_limit, note')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (expRes.error && expRes.error.code !== '42P01') throw expRes.error;
      setExpenses(expRes.data || []);

      if (budgetRes.data) {
        setMonthlyBudget(budgetRes.data.monthly_limit || null);
        setBudgetNote(budgetRes.data.note || '');
      }
    } catch (e: any) {
      // Table might not exist yet — show helpful message
      if (e?.code === '42P01') {
        toast.error('Expense table not found. Ask admin to run the SQL migration.', { duration: 6000 });
      } else {
        toast.error('Failed to load expenses: ' + e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Budget usage this month ───────────────────────────────────────────────
  const thisMonth = new Date().toISOString().slice(0, 7);

  const usedBudget = useMemo(() =>
    expenses
      .filter(e => e.status !== 'rejected' && e.expense_date?.startsWith(thisMonth))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses, thisMonth]
  );

  const remaining     = monthlyBudget !== null ? monthlyBudget - usedBudget : null;
  const budgetPct     = monthlyBudget ? Math.min(100, (usedBudget / monthlyBudget) * 100) : 0;
  const overBudget    = monthlyBudget !== null && usedBudget >= monthlyBudget;

  // ── Summary for selected month ────────────────────────────────────────────
  const monthSummary = useMemo(() => {
    const monthExp = expenses.filter(e => e.expense_date?.startsWith(filterMonth));
    return {
      total:    monthExp.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      pending:  monthExp.filter(e => e.status === 'pending').length,
      approved: monthExp.filter(e => e.status === 'approved').reduce((s, e) => s + (Number(e.amount) || 0), 0),
      rejected: monthExp.filter(e => e.status === 'rejected').length,
    };
  }, [expenses, filterMonth]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (filterStatus !== 'all' && e.status !== filterStatus) return false;
      if (filterMonth && !e.expense_date?.startsWith(filterMonth))  return false;
      return true;
    });
  }, [expenses, filterStatus, filterMonth]);

  // ── Open add modal ────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setIsAddOpen(true);
  };

  // ── Open edit modal ───────────────────────────────────────────────────────
  const openEdit = (exp: any) => {
    setEditId(exp.id);
    setForm({
      category:        exp.category,
      custom_category: exp.custom_category || '',
      amount:          String(exp.amount),
      description:     exp.description,
      expense_date:    exp.expense_date,
    });
    setIsAddOpen(true);
  };

  // ── Save (add or edit) ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Amount is required'); return; }
    if (!form.description.trim())                     { toast.error('Description is required'); return; }
    if (!form.expense_date)                           { toast.error('Date is required'); return; }
    if (form.category === 'other' && !form.custom_category.trim()) {
      toast.error('Please enter custom category name'); return;
    }

    // Budget check — only for new entries this month
    const newAmt = parseFloat(form.amount) || 0;
    const isThisMonth = form.expense_date.startsWith(thisMonth);
    if (!editId && isThisMonth && monthlyBudget !== null && (usedBudget + newAmt) > monthlyBudget) {
      toast.error(
        `Expense limit exceeded! Budget: ₹${monthlyBudget.toFixed(0)}, Used: ₹${usedBudget.toFixed(0)}, Remaining: ₹${Math.max(0, remaining!).toFixed(0)}. Please contact Admin.`,
        { duration: 7000 }
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id:         user!.id,
        category:        form.category,
        custom_category: form.category === 'other' ? form.custom_category.trim() : null,
        amount:          parseFloat(form.amount),
        description:     form.description.trim(),
        expense_date:    form.expense_date,
        status:          'pending',
        updated_at:      new Date().toISOString(),
      };

      const { error } = editId
        ? await supabase.from('employee_expenses').update(payload).eq('id', editId)
        : await supabase.from('employee_expenses').insert(payload);

      if (error) {
        if (error.code === '42P01') {
          toast.error('Table not found. Ask admin to run the SQL migration.', { duration: 6000 });
        } else {
          throw error;
        }
        return;
      }

      toast.success(editId ? 'Expense updated ✅' : 'Expense submitted — awaiting approval 🕐');
      setIsAddOpen(false);
      setEditId(null);
      setForm(EMPTY_FORM);
      fetchAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase
        .from('employee_expenses').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Expense deleted');
      setDeleteTarget(null);
      fetchAll();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── Excel Export ──────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = filtered.map(e => ({
      Date:        e.expense_date,
      Category:    CAT_LABELS[e.category] || e.custom_category || e.category,
      'Amount ₹':  e.amount,
      Description: e.description,
      Status:      e.status,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: 'No data' }]), 'My Expenses');
    XLSX.writeFile(wb, `My_Expenses_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Excel downloaded');
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">My Expenses</h1>
          <p className="text-xs text-slate-500 mt-0.5">Submit and track your expense claims</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />Export
          </Button>
          <Button
            onClick={openAdd}
            disabled={overBudget}
            title={overBudget ? 'Monthly budget limit reached. Contact Admin.' : 'Add new expense'}
          >
            <Plus className="h-4 w-4 mr-1.5" />Add Expense
          </Button>
        </div>
      </div>

      {/* Budget Banner */}
      {monthlyBudget !== null && (
        <div className={cn(
          'rounded-xl p-4 border flex items-start gap-3',
          overBudget
            ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
            : budgetPct > 80
              ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
              : 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
        )}>
          <IndianRupee className={cn('h-5 w-5 shrink-0 mt-0.5',
            overBudget ? 'text-red-600' : 'text-blue-600')} />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-sm font-bold dark:text-white">Monthly Budget</span>
                {budgetNote && <span className="text-xs text-slate-400 italic ml-2">— {budgetNote}</span>}
              </div>
              <span className={cn('text-sm font-black',
                overBudget ? 'text-red-600' : 'text-blue-700 dark:text-blue-300')}>
                ₹{usedBudget.toFixed(0)} / ₹{monthlyBudget.toFixed(0)}
              </span>
            </div>
            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all',
                  overBudget ? 'bg-red-500' : budgetPct > 80 ? 'bg-amber-500' : 'bg-blue-500')}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <p className={cn('text-xs font-medium',
              overBudget ? 'text-red-600' : 'text-slate-500')}>
              {overBudget
                ? '⚠️ Budget limit reached. Please contact Admin to submit more expenses.'
                : `₹${Math.max(0, remaining!).toFixed(0)} remaining this month`}
            </p>
          </div>
        </div>
      )}

      {/* Month Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Submitted', val: `₹${monthSummary.total.toFixed(0)}`,    color: 'text-slate-700 dark:text-slate-200' },
          { label: 'Approved ₹',      val: `₹${monthSummary.approved.toFixed(0)}`, color: 'text-green-600' },
          { label: 'Pending',         val: `${monthSummary.pending}`,              color: 'text-yellow-600' },
          { label: 'Rejected',        val: `${monthSummary.rejected}`,             color: 'text-red-500' },
        ].map(({ label, val, color }) => (
          <Card key={label} className="border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <p className={cn('text-2xl font-black', color)}>{val}</p>
              <p className="text-[11px] text-slate-500 mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">🟡 Pending</SelectItem>
            <SelectItem value="approved">✅ Approved</SelectItem>
            <SelectItem value="rejected">❌ Rejected</SelectItem>
          </SelectContent>
        </Select>
        <input
          type="month"
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="h-8 px-2 text-xs border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-600 dark:text-white"
        />
        {(filterStatus !== 'all' || filterMonth !== thisMonth) && (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-400"
            onClick={() => { setFilterStatus('all'); setFilterMonth(thisMonth); }}>
            Reset
          </Button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} entries</span>
      </div>

      {/* Expense List */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading expenses...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Receipt className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-slate-400 font-medium">No expenses found</p>
            <p className="text-slate-300 text-xs">Click "Add Expense" to submit your first claim</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map(exp => (
              <div key={exp.id} className="p-4 flex items-start gap-3">
                {/* Category Icon */}
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg shrink-0">
                  {CAT_ICONS[exp.category] || '📋'}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      {CAT_LABELS[exp.category] || exp.custom_category || exp.category}
                    </span>
                    <StatusBadge s={exp.status} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{exp.description}</p>
                  <div className="flex gap-3 flex-wrap text-xs">
                    <span className="text-slate-400">{exp.expense_date}</span>
                    <span className="text-orange-600 font-bold">₹{exp.amount}</span>
                  </div>
                  {/* Rejection reason */}
                  {exp.status === 'rejected' && exp.admin_comment && (
                    <div className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-1">
                      <strong>Reason:</strong> {exp.admin_comment}
                    </div>
                  )}
                </div>

                {/* Actions — only for pending */}
                {exp.status === 'pending' && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => openEdit(exp)}>
                      <Edit className="h-3.5 w-3.5 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400"
                      onClick={() => setDeleteTarget(exp)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      <Dialog open={isAddOpen} onOpenChange={v => { if (!v && !saving) { setIsAddOpen(false); setEditId(null); setForm(EMPTY_FORM); }}}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-500" />
              {editId ? 'Edit Expense' : 'Add New Expense'}
            </DialogTitle>
            <DialogDescription>
              {editId ? 'Update your expense details below.' : 'Fill in the details to submit your expense claim.'}
            </DialogDescription>
          </DialogHeader>

          {/* Budget warning inside modal */}
          {!editId && monthlyBudget !== null && (
            <div className={cn(
              'rounded-lg p-3 text-xs flex items-center gap-2',
              overBudget
                ? 'bg-red-50 border border-red-200 text-red-700'
                : remaining! < 500
                  ? 'bg-amber-50 border border-amber-200 text-amber-700'
                  : 'bg-blue-50 border border-blue-200 text-blue-700'
            )}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {overBudget
                ? 'Budget limit reached. Cannot submit new expenses.'
                : `Remaining budget: ₹${Math.max(0, remaining!).toFixed(0)} of ₹${monthlyBudget.toFixed(0)}`}
            </div>
          )}

          <div className="space-y-4 py-2">
            {/* Category */}
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">
                Category *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {EXPENSE_CATS.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, category: cat }))}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left text-xs font-semibold transition-all',
                      form.category === cat
                        ? [CAT_CHIP_COLORS[cat], 'ring-2 ring-offset-1 ring-current shadow-sm scale-[1.02]'].join(' ')
                        : [CAT_CHIP_COLORS[cat], 'opacity-70 hover:opacity-100 hover:scale-[1.01]'].join(' ')
                    )}
                  >
                    <span className="text-base shrink-0">{CAT_ICONS[cat]}</span>
                    <span className="leading-tight">{CAT_LABELS[cat].replace(/^[^ ]+ /, '')}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom category if "Other" selected */}
            {form.category === 'other' && (
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">
                  Custom Category Name *
                </label>
                <Input
                  placeholder="e.g. Office Supplies"
                  value={form.custom_category}
                  onChange={e => setForm(p => ({ ...p, custom_category: e.target.value }))}
                />
              </div>
            )}

            {/* Amount + Date side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">
                  Amount ₹ *
                </label>
                <div className="relative">
                  <IndianRupee className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    className="pl-7"
                    value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                  />
                </div>
                {/* Live budget preview */}
                {!editId && monthlyBudget !== null && parseFloat(form.amount) > 0 && (
                  <p className={cn('text-[10px] mt-0.5 font-medium',
                    (usedBudget + parseFloat(form.amount)) > monthlyBudget
                      ? 'text-red-500' : 'text-green-600')}>
                    {(usedBudget + parseFloat(form.amount)) > monthlyBudget
                      ? `⚠️ Exceeds by ₹${((usedBudget + parseFloat(form.amount)) - monthlyBudget).toFixed(0)}`
                      : `✅ After: ₹${(usedBudget + parseFloat(form.amount)).toFixed(0)} of ₹${monthlyBudget.toFixed(0)}`}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">
                  Date *
                </label>
                <Input
                  type="date"
                  value={form.expense_date}
                  onChange={e => setForm(p => ({ ...p, expense_date: e.target.value }))}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">
                Description *
              </label>
              <Input
                placeholder="e.g. Tea for client meeting"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsAddOpen(false); setEditId(null); setForm(EMPTY_FORM); }}
              disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || (!editId && overBudget && form.expense_date.startsWith(thisMonth))}
            >
              {saving ? 'Submitting...' : editId ? 'Update' : 'Submit Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Modal ── */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Delete Expense
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 mb-3">
              <p className="font-semibold text-sm">{deleteTarget?.description}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {CAT_LABELS[deleteTarget?.category] || deleteTarget?.category} · ₹{deleteTarget?.amount}
              </p>
            </div>
            <p className="text-xs text-slate-500">This action cannot be undone.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeExpensesPage;
