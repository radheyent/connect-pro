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
import { CheckCircle, XCircle, Trash2, Edit, Download, Plus, Settings, TrendingUp, TrendingDown, IndianRupee } from 'lucide-react';
import * as XLSX from 'xlsx';

const TABS = ['Overview', 'Pending', 'Field Expenses', 'Office Expenses', 'Ledger'] as const;
type TabType = typeof TABS[number];

const OFFICE_CATS = [
  'tea_refreshments','stationary','rent',
  'electricity','internet','salary','miscellaneous','other',
];
const CAT_LABELS: Record<string,string> = {
  tea_refreshments:'Tea & Refreshments', stationary:'Stationary', rent:'Rent',
  electricity:'Electricity', internet:'Internet', salary:'Salary',
  miscellaneous:'Miscellaneous', other:'Other',
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

// ── Main ─────────────────────────────────────────────────────────────────────
const ExpensesPage: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab]         = useState<TabType>('Overview');
  const [loading, setLoading] = useState(true);

  // Data
  const [fieldExp,  setFieldExp]  = useState<any[]>([]);
  const [officeExp, setOfficeExp] = useState<any[]>([]);
  const [empMap,    setEmpMap]    = useState<Record<string,string>>({});
  const [leadMap,   setLeadMap]   = useState<Record<string,string>>({});
  const [kmRate,    setKmRate]    = useState(5);
  const [kmRateInput, setKmRateInput] = useState('5');

  // Filters
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [empFilter,   setEmpFilter]   = useState('all');
  const [monthView,   setMonthView]   = useState(() => new Date().toISOString().slice(0,7)); // YYYY-MM

  // Modal states
  const [rejectTarget,   setRejectTarget]   = useState<any>(null);
  const [rejectComment,  setRejectComment]  = useState('');
  const [deleteTarget,   setDeleteTarget]   = useState<any>(null);
  const [editFieldItem,  setEditFieldItem]  = useState<any>(null);
  const [isOfficeOpen,   setIsOfficeOpen]   = useState(false);
  const [officeForm,     setOfficeForm]     = useState(EMPTY_OFFICE_FORM);
  const [editOfficeId,   setEditOfficeId]   = useState<string|null>(null);
  const [saving,         setSaving]         = useState(false);

  // Employees list for dropdown
  const employees = useMemo(() =>
    Object.entries(empMap).map(([id, name]) => ({ id, name }))
      .sort((a,b) => a.name.localeCompare(b.name)),
    [empMap]
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Parallel fetch — no joins on auth.users
      const [feRes, oeRes, upRes, setRes] = await Promise.all([
        supabase.from('field_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('office_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('user_profiles').select('id,name'),
        supabase.from('app_settings').select('value').eq('key','km_rate_per_km').single(),
      ]);

      // Build employee map
      const em: Record<string,string> = {};
      (upRes.data||[]).forEach((u:any) => { em[u.id] = u.name; });
      setEmpMap(em);

      // Build lead map for field expenses that have lead_id
      const leadIds = [...new Set((feRes.data||[]).map((e:any) => e.lead_id).filter(Boolean))];
      let lm: Record<string,string> = {};
      if (leadIds.length > 0) {
        const { data: leadsData } = await supabase.from('leads').select('id,name').in('id', leadIds);
        (leadsData||[]).forEach((l:any) => { lm[l.id] = l.name; });
      }
      setLeadMap(lm);

      setFieldExp(feRes.data || []);
      setOfficeExp(oeRes.data || []);

      const rate = parseFloat(setRes.data?.value || '5') || 5;
      setKmRate(rate);
      setKmRateInput(String(rate));
    } catch (e: any) {
      toast.error('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Pending count ──────────────────────────────────────────────────────────
  const pendingCount = useMemo(() => fieldExp.filter(e => e.status === 'pending').length, [fieldExp]);

  // ── Month summaries ────────────────────────────────────────────────────────
  const thisMonth = new Date().toISOString().slice(0, 7);

  // Generic function to compute summary for any month
  const computeSummary = useCallback((month: string) => {
    const af = fieldExp.filter(e => e.status === 'approved' && e.expense_date?.startsWith(month));
    const oe = officeExp.filter(e => e.expense_date?.startsWith(month));
    const fieldConv = af.reduce((s,e) => s + (Number(e.conveyance_amount)||0), 0);
    const credit    = af.reduce((s,e) => s + (Number(e.credit_total)||0), 0);
    const km        = af.reduce((s,e) => s + (Number(e.kilometres)||0), 0);
    const office    = oe.reduce((s,e) => s + (Number(e.amount)||0), 0);
    const totalExpense = fieldConv + office;
    const profit = credit - totalExpense;
    return { fieldConv, credit, km, office, net: totalExpense - credit, totalExpense, profit };
  }, [fieldExp, officeExp]);

  const summary      = useMemo(() => computeSummary(thisMonth), [computeSummary, thisMonth]);
  const monthSummary = useMemo(() => computeSummary(monthView), [computeSummary, monthView]);

  // All unique months from data
  const allMonths = useMemo(() => {
    const months = new Set([
      ...fieldExp.map(e => e.expense_date?.slice(0,7)).filter(Boolean),
      ...officeExp.map(e => e.expense_date?.slice(0,7)).filter(Boolean),
    ]);
    return [...months].sort().reverse();
  }, [fieldExp, officeExp]);

  // ── Filtered field expenses ────────────────────────────────────────────────
  const filteredField = useMemo(() => fieldExp.filter(e => {
    if (empFilter !== 'all' && e.field_boy_id !== empFilter) return false;
    if (dateFrom && e.expense_date < dateFrom) return false;
    if (dateTo   && e.expense_date > dateTo)   return false;
    return true;
  }), [fieldExp, empFilter, dateFrom, dateTo]);

  // ── Ledger ─────────────────────────────────────────────────────────────────
  const ledger = useMemo(() => {
    const rows = [
      ...fieldExp
        .filter(e => e.status === 'approved')
        .map(e => ({
          date: e.expense_date,
          source: 'Field',
          person: empMap[e.field_boy_id] || '—',
          desc: leadMap[e.lead_id] || e.description || 'Ad-hoc',
          km: Number(e.kilometres)||0,
          expense: Number(e.conveyance_amount)||0,
          credit: Number(e.credit_total)||0,
        })),
      ...officeExp.map(e => ({
        date: e.expense_date,
        source: 'Office',
        person: CAT_LABELS[e.category] || e.custom_category || e.category,
        desc: e.description,
        km: 0,
        expense: Number(e.amount)||0,
        credit: 0,
      })),
    ].sort((a,b) => (a.date < b.date ? 1 : -1));

    let running = 0;
    return rows.map(r => {
      const net = r.expense - r.credit;
      running += net;
      return { ...r, net, running };
    });
  }, [fieldExp, officeExp, empMap, leadMap]);

  // ── Approve ────────────────────────────────────────────────────────────────
  const handleApprove = async (id: string) => {
    try {
      const { error } = await supabase.from('field_expenses').update({
        status: 'approved',
        approved_by: user!.id,
        approved_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      toast.success('Approved ✅');
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Reject ─────────────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!rejectTarget || !rejectComment.trim()) { toast.error('Enter a reason'); return; }
    try {
      const { error } = await supabase.from('field_expenses').update({
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

  // ── Delete ─────────────────────────────────────────────────────────────────
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

  // ── Save Office Expense ────────────────────────────────────────────────────
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

  // ── Save Field Edit ────────────────────────────────────────────────────────
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

  // ── KM Rate ────────────────────────────────────────────────────────────────
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

  // ── Excel Export ───────────────────────────────────────────────────────────
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

  // ── FieldExpRow (reusable) ─────────────────────────────────────────────────
  const FieldRow = ({ exp, showActions = true }: { exp: any; showActions?: boolean }) => (
    <div className="p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{empMap[exp.field_boy_id] || '—'}</span>
          <StatusBadge s={exp.status} />
          {exp.closure_type && (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded capitalize">{exp.closure_type}</span>
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
          {/* This Month Summary + Profit */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Field Conveyance',  val: `₹${summary.fieldConv.toFixed(0)}`, color: 'text-orange-600' },
              { label: 'Office Expenses',   val: `₹${summary.office.toFixed(0)}`,    color: 'text-red-600' },
              { label: 'Credit Collected',  val: `₹${summary.credit.toFixed(0)}`,    color: 'text-green-600' },
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

          {/* PROFIT CHIP */}
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

          {/* KM Rate + Pending */}
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

          {/* ── MONTHLY HISTORY ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base">Monthly Breakdown</CardTitle>
                <div className="flex items-center gap-2">
                  <input type="month" value={monthView}
                    onChange={e => setMonthView(e.target.value)}
                    className="h-8 px-2 text-xs border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Selected month summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Field Conveyance', val: `₹${monthSummary.fieldConv.toFixed(0)}`, color: 'text-orange-600' },
                  { label: 'Office Expenses',  val: `₹${monthSummary.office.toFixed(0)}`,    color: 'text-red-600' },
                  { label: 'Credit Collected', val: `₹${monthSummary.credit.toFixed(0)}`,    color: 'text-green-600' },
                  { label: 'Net Profit',        val: `${monthSummary.profit >= 0 ? '+' : ''}₹${monthSummary.profit.toFixed(0)}`,
                    color: monthSummary.profit >= 0 ? 'text-green-600' : 'text-red-500' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
                    <p className={`text-xl font-black ${color}`}>{val}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* All months quick table */}
              {allMonths.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs mt-2">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700">
                        {['Month','Field ₹','Office ₹','Credit ₹','Profit ₹'].map(h => (
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
                            <td className="px-2 py-2 text-orange-600">₹{s.fieldConv.toFixed(0)}</td>
                            <td className="px-2 py-2 text-red-500">₹{s.office.toFixed(0)}</td>
                            <td className="px-2 py-2 text-green-600">₹{s.credit.toFixed(0)}</td>
                            <td className={`px-2 py-2 font-black ${s.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {s.profit >= 0 ? '+' : ''}₹{s.profit.toFixed(0)}
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
      {!loading && tab === 'Pending' && (
        <div className="space-y-2">
          {fieldExp.filter(e => e.status === 'pending').length === 0 ? (
            <div className="py-16 text-center text-slate-400">No pending approvals 🎉</div>
          ) : (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700 shadow-sm">
              {fieldExp.filter(e => e.status === 'pending').map(exp => (
                <FieldRow key={exp.id} exp={exp} />
              ))}
            </div>
          )}
        </div>
      )}

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
        <div className="space-y-3">
          <Button size="sm" onClick={() => { setEditOfficeId(null); setOfficeForm(EMPTY_OFFICE_FORM); setIsOfficeOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Add Office Expense
          </Button>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700 shadow-sm">
            {officeExp.length === 0
              ? <div className="py-12 text-center text-slate-400">No office expenses yet</div>
              : officeExp.map(exp => (
                <div key={exp.id} className="p-4 flex items-center gap-4">
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
      )}

      {/* ── LEDGER ── */}
      {!loading && tab === 'Ledger' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {['Date','Source','Person','Description','KM','Expense ₹','Credit ₹','Net ₹','Balance ₹'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {ledger.length === 0
                ? <tr><td colSpan={9} className="py-12 text-center text-slate-400">No approved entries</td></tr>
                : ledger.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{r.date}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.source==='Field'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-600'}`}>
                        {r.source}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{r.person}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate">{r.desc}</td>
                    <td className="px-3 py-2 text-blue-600">{r.km > 0 ? r.km : '—'}</td>
                    <td className="px-3 py-2 text-red-600 font-semibold">₹{r.expense.toFixed(0)}</td>
                    <td className="px-3 py-2 text-green-600 font-semibold">{r.credit > 0 ? `₹${r.credit.toFixed(0)}` : '—'}</td>
                    <td className="px-3 py-2 font-bold">
                      {r.net >= 0
                        ? <span className="text-red-500">+₹{r.net.toFixed(0)}</span>
                        : <span className="text-green-600">-₹{Math.abs(r.net).toFixed(0)}</span>}
                    </td>
                    <td className="px-3 py-2 font-black">₹{r.running.toFixed(0)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
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
