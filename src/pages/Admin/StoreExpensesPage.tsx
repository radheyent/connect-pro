import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Plus, TrendingDown, TrendingUp, Wallet, Pencil, Trash2, AlertTriangle,
  ChevronLeft, ChevronRight, Store
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface OfficeExpense {
  id: string;
  category: string;
  spent_by_name: string | null;
  amount: number;
  description: string;
  remarks: string | null;
  expense_date: string;
}
interface AdminCredit {
  id: string;
  category: string;
  custom_category: string | null;
  amount: number;
  description: string;
  credit_date: string;
  reference: string | null;
}

const OFFICE_CATEGORIES = ['Rent', 'Electricity', 'Internet', 'Stationery', 'Salary', 'Maintenance', 'Other'];
const CREDIT_CATEGORIES = [
  { value: 'sale_revenue', label: 'Sale Revenue' },
  { value: 'investment', label: 'Investment' },
  { value: 'refund', label: 'Refund' },
  { value: 'other', label: 'Other' },
];

const EMPTY_EXPENSE = { category: 'Rent', spent_by_name: '', amount: '', description: '', remarks: '', expense_date: format(new Date(), 'yyyy-MM-dd') };
const EMPTY_CREDIT = { category: 'sale_revenue', custom_category: '', amount: '', description: '', credit_date: format(new Date(), 'yyyy-MM-dd'), reference: '' };

type Row = ({ kind: 'expense' } & OfficeExpense) | ({ kind: 'credit' } & AdminCredit);

const StoreExpensesPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<OfficeExpense[]>([]);
  const [credits, setCredits] = useState<AdminCredit[]>([]);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);

  const [creditOpen, setCreditOpen] = useState(false);
  const [creditForm, setCreditForm] = useState(EMPTY_CREDIT);
  const [editCreditId, setEditCreditId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'expense' | 'credit'; id: string; label: string } | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [expRes, credRes] = await Promise.all([
        supabase.from('office_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('admin_credits').select('*').order('credit_date', { ascending: false }),
      ]);
      setExpenses(expRes.data || []);
      setCredits(credRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load store expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const monthExpenses = useMemo(() => expenses.filter(e => e.expense_date?.startsWith(month)), [expenses, month]);
  const monthCredits = useMemo(() => credits.filter(c => c.credit_date?.startsWith(month)), [credits, month]);

  const totalSpent = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalCredit = monthCredits.reduce((s, c) => s + Number(c.amount), 0);
  const net = totalCredit - totalSpent;

  const combinedRows: Row[] = useMemo(() => {
    const a: Row[] = monthExpenses.map(e => ({ kind: 'expense', ...e }));
    const b: Row[] = monthCredits.map(c => ({ kind: 'credit', ...c }));
    return [...a, ...b].sort((x, y) => {
      const dx = x.kind === 'expense' ? x.expense_date : x.credit_date;
      const dy = y.kind === 'expense' ? y.expense_date : y.credit_date;
      return dy.localeCompare(dx);
    });
  }, [monthExpenses, monthCredits]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(format(d, 'yyyy-MM'));
  };

  const openAddExpense = () => { setEditExpenseId(null); setExpenseForm(EMPTY_EXPENSE); setExpenseOpen(true); };
  const openEditExpense = (e: OfficeExpense) => {
    setEditExpenseId(e.id);
    setExpenseForm({
      category: e.category, spent_by_name: e.spent_by_name || '', amount: String(e.amount),
      description: e.description, remarks: e.remarks || '', expense_date: e.expense_date,
    });
    setExpenseOpen(true);
  };
  const saveExpense = async () => {
    if (!expenseForm.amount || parseFloat(expenseForm.amount) <= 0) { toast.error('Amount daalo'); return; }
    if (!expenseForm.description.trim()) { toast.error('Description daalo'); return; }
    setSaving(true);
    try {
      const payload = {
        category: expenseForm.category,
        spent_by_name: expenseForm.spent_by_name.trim() || null,
        amount: parseFloat(expenseForm.amount),
        description: expenseForm.description.trim(),
        remarks: expenseForm.remarks.trim() || null,
        expense_date: expenseForm.expense_date,
        added_by: user!.id,
        updated_at: new Date().toISOString(),
      };
      const { error } = editExpenseId
        ? await supabase.from('office_expenses').update(payload).eq('id', editExpenseId)
        : await supabase.from('office_expenses').insert(payload);
      if (error) throw error;
      toast.success(editExpenseId ? 'Expense updated' : 'Expense added');
      setExpenseOpen(false);
      fetchAll();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const openAddCredit = () => { setEditCreditId(null); setCreditForm(EMPTY_CREDIT); setCreditOpen(true); };
  const openEditCredit = (c: AdminCredit) => {
    setEditCreditId(c.id);
    setCreditForm({
      category: c.category, custom_category: c.custom_category || '', amount: String(c.amount),
      description: c.description, credit_date: c.credit_date, reference: c.reference || '',
    });
    setCreditOpen(true);
  };
  const saveCredit = async () => {
    if (!creditForm.amount || parseFloat(creditForm.amount) <= 0) { toast.error('Amount daalo'); return; }
    if (!creditForm.description.trim()) { toast.error('Description daalo'); return; }
    setSaving(true);
    try {
      const payload = {
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
      if (error) throw error;
      toast.success(editCreditId ? 'Credit updated' : 'Credit added');
      setCreditOpen(false);
      fetchAll();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const table = deleteTarget.kind === 'expense' ? 'office_expenses' : 'admin_credits';
      const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Deleted');
      setDeleteTarget(null);
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Store className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Store Expenses</h2>
            <p className="text-sm text-slate-500">Office costs & money coming in — by month</p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={openAddCredit} className="flex-1 sm:flex-none border-green-200 text-green-700 hover:bg-green-50">
            <Plus className="h-4 w-4 mr-1" /> Credit
          </Button>
          <Button onClick={openAddExpense} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-1" /> Expense
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="font-semibold text-slate-800 w-36 text-center">
          {format(parseISO(month + '-01'), 'MMMM yyyy')}
        </span>
        <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-red-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-red-500 text-xs font-semibold uppercase mb-1">
            <TrendingDown className="h-4 w-4" /> Total Spent
          </div>
          <p className="text-2xl font-bold text-slate-800">₹{totalSpent.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-slate-400 mt-1">{monthExpenses.length} entries this month</p>
        </div>
        <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-green-600 text-xs font-semibold uppercase mb-1">
            <TrendingUp className="h-4 w-4" /> Total Credited
          </div>
          <p className="text-2xl font-bold text-slate-800">₹{totalCredit.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-slate-400 mt-1">{monthCredits.length} entries this month</p>
        </div>
        <div className={cn("rounded-xl border p-4 shadow-sm", net >= 0 ? "bg-blue-50 border-blue-100" : "bg-orange-50 border-orange-100")}>
          <div className={cn("flex items-center gap-2 text-xs font-semibold uppercase mb-1", net >= 0 ? "text-blue-600" : "text-orange-600")}>
            <Wallet className="h-4 w-4" /> Net This Month
          </div>
          <p className="text-2xl font-bold text-slate-800">{net >= 0 ? '+' : ''}₹{net.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-slate-400 mt-1">{net >= 0 ? 'Profit' : 'Loss'} for {format(parseISO(month + '-01'), 'MMM yyyy')}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">Transactions — {format(parseISO(month + '-01'), 'MMMM yyyy')}</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-10 text-center text-slate-400 text-sm">Loading...</div>
          ) : combinedRows.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">Is mahine me koi entry nahi hai</div>
          ) : combinedRows.map((row) => {
            const isExpense = row.kind === 'expense';
            const date = isExpense ? row.expense_date : row.credit_date;
            const amount = row.amount;
            const label = isExpense ? row.category : (row.category === 'other' ? (row.custom_category || 'Other') : CREDIT_CATEGORIES.find(c => c.value === row.category)?.label || row.category);
            return (
              <div key={`${row.kind}-${row.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("h-9 w-9 rounded-full flex items-center justify-center shrink-0", isExpense ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600")}>
                    {isExpense ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{label}</p>
                    <p className="text-xs text-slate-500 truncate">{row.description}</p>
                    <p className="text-[11px] text-slate-400">{format(parseISO(date), 'dd MMM yyyy')} {isExpense && row.spent_by_name ? `• by ${row.spent_by_name}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("font-bold text-sm", isExpense ? "text-red-500" : "text-green-600")}>
                    {isExpense ? '-' : '+'}₹{Number(amount).toLocaleString('en-IN')}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => isExpense ? openEditExpense(row) : openEditCredit(row)}>
                    <Pencil className="h-3.5 w-3.5 text-slate-400" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTarget({ kind: row.kind, id: row.id, label })}>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editExpenseId ? 'Edit' : 'Add'} Office Expense</DialogTitle>
            <DialogDescription>Rent, bills, salary — anything the office spent money on.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Category</label>
                <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm({ ...expenseForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OFFICE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Date</label>
                <Input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Amount (₹)</label>
              <Input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Description</label>
              <Input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="e.g. September rent" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Spent By (optional)</label>
              <Input value={expenseForm.spent_by_name} onChange={(e) => setExpenseForm({ ...expenseForm, spent_by_name: e.target.value })} placeholder="Name" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Remarks (optional)</label>
              <textarea
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={expenseForm.remarks}
                onChange={(e) => setExpenseForm({ ...expenseForm, remarks: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)}>Cancel</Button>
            <Button onClick={saveExpense} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCreditId ? 'Edit' : 'Add'} Credit</DialogTitle>
            <DialogDescription>Money coming into the business.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Category</label>
                <Select value={creditForm.category} onValueChange={(v) => setCreditForm({ ...creditForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CREDIT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Date</label>
                <Input type="date" value={creditForm.credit_date} onChange={(e) => setCreditForm({ ...creditForm, credit_date: e.target.value })} />
              </div>
            </div>
            {creditForm.category === 'other' && (
              <div>
                <label className="text-xs font-medium text-slate-600">Custom category name</label>
                <Input value={creditForm.custom_category} onChange={(e) => setCreditForm({ ...creditForm, custom_category: e.target.value })} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-600">Amount (₹)</label>
              <Input type="number" value={creditForm.amount} onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Description</label>
              <Input value={creditForm.description} onChange={(e) => setCreditForm({ ...creditForm, description: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Reference (optional)</label>
              <Input value={creditForm.reference} onChange={(e) => setCreditForm({ ...creditForm, reference: e.target.value })} placeholder="Invoice #, txn id, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditOpen(false)}>Cancel</Button>
            <Button onClick={saveCredit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-5 w-5" /> Delete Entry</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{deleteTarget?.label}"? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreExpensesPage;
