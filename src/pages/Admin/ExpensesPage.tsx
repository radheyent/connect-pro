import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CheckCircle, XCircle, Trash2, Edit, Download, Plus, IndianRupee, MapPin, TrendingUp } from 'lucide-react';
import * as XLSX from 'xlsx';

const TABS = ['Overview','Pending','Field Expenses','Office Expenses','Ledger'] as const;
const OFFICE_CATS = ['tea_refreshments','stationary','rent','electricity','internet','salary','miscellaneous','other'];
const CAT_LABELS: Record<string,string> = {
  tea_refreshments:'Tea & Refreshments', stationary:'Stationary', rent:'Rent',
  electricity:'Electricity', internet:'Internet', salary:'Salary',
  miscellaneous:'Miscellaneous', other:'Other',
};

// ── Shared helpers ────────────────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string,string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved:'bg-green-100 text-green-700',
    rejected:'bg-red-100 text-red-700',
  };
  return <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${map[status]||''}`}>{status}</span>;
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const ExpensesPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Overview');
  const [fieldExpenses,  setFieldExpenses]  = useState<any[]>([]);
  const [officeExpenses, setOfficeExpenses] = useState<any[]>([]);
  const [employees,      setEmployees]      = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [kmRate,         setKmRate]         = useState(5);
  const [pendingCount,   setPendingCount]   = useState(0);

  // Office expense form
  const [isAddOfficeOpen, setIsAddOfficeOpen] = useState(false);
  const [editOffice,      setEditOffice]      = useState<any>(null);
  const [officeForm, setOfficeForm] = useState({ category:'tea_refreshments', custom_category:'', amount:'', description:'', expense_date: new Date().toISOString().split('T')[0] });

  // Approve / Reject
  const [rejectModal, setRejectModal]   = useState<any>(null);
  const [rejectComment, setRejectComment] = useState('');

  // Edit field expense
  const [editField, setEditField] = useState<any>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{id:string;table:string;name:string}|null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [empFilter, setEmpFilter] = useState('all');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [feRes, oeRes, empRes, settingRes] = await Promise.all([
        supabase.from('field_expenses').select('*, leads(name,phone), user_profiles!field_boy_id(name)').order('expense_date', { ascending: false }),
        supabase.from('office_expenses').select('*, user_profiles!added_by(name)').order('expense_date', { ascending: false }),
        supabase.from('user_profiles').select('id,name').eq('is_active', true),
        supabase.from('app_settings').select('value').eq('key','km_rate_per_km').single(),
      ]);
      setFieldExpenses(feRes.data || []);
      setOfficeExpenses(oeRes.data || []);
      setEmployees(empRes.data || []);
      setPendingCount((feRes.data||[]).filter((e:any) => e.status==='pending').length);
      if (settingRes.data) setKmRate(parseFloat(settingRes.data.value)||5);
    } catch { toast.error('Failed to load expenses'); }
    finally { setLoading(false); }
  };

  // ── Approve / Reject ────────────────────────────────────────────────────────
  const handleApprove = async (id: string) => {
    try {
      const { error } = await supabase.from('field_expenses').update({
        status: 'approved', approved_by: user!.id, approved_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      toast.success('Approved ✅');
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    if (!rejectComment.trim()) { toast.error('Please enter a reason'); return; }
    try {
      const { error } = await supabase.from('field_expenses').update({
        status: 'rejected', admin_comment: rejectComment,
      }).eq('id', rejectModal.id);
      if (error) throw error;
      toast.success('Rejected');
      setRejectModal(null); setRejectComment('');
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
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

  // ── Office Expense CRUD ─────────────────────────────────────────────────────
  const saveOfficeExpense = async () => {
    if (!officeForm.amount || !officeForm.description) { toast.error('Amount and description required'); return; }
    try {
      const payload = {
        category: officeForm.category,
        custom_category: officeForm.category === 'other' ? officeForm.custom_category : null,
        amount: parseFloat(officeForm.amount),
        description: officeForm.description,
        expense_date: officeForm.expense_date,
        added_by: user!.id,
      };
      const { error } = editOffice
        ? await supabase.from('office_expenses').update(payload).eq('id', editOffice.id)
        : await supabase.from('office_expenses').insert(payload);
      if (error) throw error;
      toast.success(editOffice ? 'Updated' : 'Office expense added');
      setIsAddOfficeOpen(false); setEditOffice(null);
      setOfficeForm({ category:'tea_refreshments', custom_category:'', amount:'', description:'', expense_date: new Date().toISOString().split('T')[0] });
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Excel Export ────────────────────────────────────────────────────────────
  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const feData = fieldExpenses.map(e => ({
      Date: e.expense_date, 'Field Boy': e.user_profiles?.name,
      Customer: e.leads?.name || 'Ad-hoc', 'Closure Type': e.closure_type,
      KM: e.kilometres, 'Conveyance ₹': e.conveyance_amount,
      'Credit ₹': e.credit_total, Status: e.status, Notes: e.notes,
    }));
    const oeData = officeExpenses.map(e => ({
      Date: e.expense_date, Category: CAT_LABELS[e.category] || e.custom_category,
      'Amount ₹': e.amount, Description: e.description, 'Added By': e.user_profiles?.name,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(feData), 'Field Expenses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(oeData), 'Office Expenses');
    XLSX.writeFile(wb, `Expenses_${format(new Date(),'yyyy-MM-dd')}.xlsx`);
    toast.success('Excel downloaded');
  };

  // ── Computed summaries ──────────────────────────────────────────────────────
  const thisMonth = new Date().toISOString().slice(0,7);
  const approvedField  = fieldExpenses.filter(e => e.status==='approved' && e.expense_date?.startsWith(thisMonth));
  const totalFieldConv = approvedField.reduce((s,e) => s+(e.conveyance_amount||0), 0);
  const totalCredit    = approvedField.reduce((s,e) => s+(e.credit_total||0), 0);
  const totalKm        = approvedField.reduce((s,e) => s+(e.kilometres||0), 0);
  const totalOfficeMth = officeExpenses.filter(e=>e.expense_date?.startsWith(thisMonth)).reduce((s,e)=>s+(e.amount||0),0);
  const netCompany     = totalFieldConv + totalOfficeMth - totalCredit;

  const pendingList = fieldExpenses.filter(e => e.status === 'pending');
  const filteredField = useMemo(() => fieldExpenses.filter(e => {
    if (empFilter !== 'all' && e.field_boy_id !== empFilter) return false;
    if (dateFrom && e.expense_date < dateFrom) return false;
    if (dateTo   && e.expense_date > dateTo)   return false;
    return true;
  }), [fieldExpenses, empFilter, dateFrom, dateTo]);

  // ── Ledger ──────────────────────────────────────────────────────────────────
  const ledger = useMemo(() => {
    const rows: any[] = [
      ...fieldExpenses.filter(e=>e.status==='approved').map(e=>({
        date: e.expense_date, source:'Field', person: e.user_profiles?.name,
        description: e.leads?.name || e.description || 'Ad-hoc',
        km: e.kilometres, expense: e.conveyance_amount, credit: e.credit_total||0,
      })),
      ...officeExpenses.map(e=>({
        date: e.expense_date, source:'Office', person: CAT_LABELS[e.category]||e.custom_category,
        description: e.description, km: 0, expense: e.amount, credit: 0,
      })),
    ].sort((a,b) => a.date > b.date ? -1 : 1);
    let running = 0;
    return rows.map(r => {
      running += r.expense - r.credit;
      return { ...r, net: r.expense - r.credit, running };
    });
  }, [fieldExpenses, officeExpenses]);

  // ── KM Rate setting ─────────────────────────────────────────────────────────
  const saveKmRate = async (val: string) => {
    const r = parseFloat(val);
    if (isNaN(r) || r <= 0) return;
    await supabase.from('app_settings').upsert({ key:'km_rate_per_km', value: String(r), updated_by: user!.id });
    setKmRate(r);
    toast.success(`KM rate updated to ₹${r}/km`);
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Expenses</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Export Excel</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto pb-0">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors relative",
              activeTab===tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            )}>
            {tab}
            {tab==='Pending' && pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab==='Overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label:'Field Conveyance (Month)', value:`₹${totalFieldConv.toFixed(0)}`, color:'text-orange-600', bg:'bg-orange-50' },
              { label:'Office Expenses (Month)',  value:`₹${totalOfficeMth.toFixed(0)}`, color:'text-red-600',    bg:'bg-red-50' },
              { label:'Customer Credit (Month)',  value:`₹${totalCredit.toFixed(0)}`,    color:'text-green-600',  bg:'bg-green-50' },
              { label:'Net Company Expense',      value:`₹${netCompany.toFixed(0)}`,     color:'text-blue-600',   bg:'bg-blue-50' },
            ].map(({ label, value, color, bg }) => (
              <Card key={label} className={`border-0 ${bg}`}>
                <CardContent className="p-4">
                  <p className={`text-2xl font-black ${color}`}>{value}</p>
                  <p className="text-xs text-slate-500 mt-1">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">KM Rate Setting</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-3">
              <Input type="number" defaultValue={kmRate} className="w-28 h-8 text-sm" id="km-rate-input" />
              <Button size="sm" variant="outline" onClick={() => {
                const el = document.getElementById('km-rate-input') as HTMLInputElement;
                saveKmRate(el.value);
              }}>Save ₹/km</Button>
              <span className="text-xs text-slate-400">Currently ₹{kmRate}/km — used to auto-fill conveyance</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Total KM this month</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-black text-blue-600">{totalKm.toFixed(1)} km</p></CardContent>
          </Card>
        </div>
      )}

      {/* ── PENDING APPROVALS ── */}
      {activeTab==='Pending' && (
        <div className="space-y-2">
          {pendingList.length === 0 ? (
            <div className="py-16 text-center text-slate-400">No pending approvals 🎉</div>
          ) : pendingList.map(exp => (
            <div key={exp.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-4 shadow-sm">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">{exp.user_profiles?.name}</p>
                <p className="text-sm text-slate-600">{exp.leads?.name || exp.description || 'Ad-hoc'}</p>
                <div className="flex gap-3 mt-1 flex-wrap text-xs text-slate-500">
                  <span>{exp.expense_date}</span>
                  <span className="text-blue-600">{exp.kilometres} km</span>
                  <span className="text-orange-600">₹{exp.conveyance_amount}</span>
                  {exp.credit_total > 0 && <span className="text-green-600">Credit: ₹{exp.credit_total}</span>}
                  <span className="capitalize">{exp.closure_type}</span>
                </div>
                {exp.notes && <p className="text-xs text-slate-400 mt-1">{exp.notes}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" onClick={() => handleApprove(exp.id)}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />Approve
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setRejectModal(exp); setRejectComment(''); }}>
                  <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── FIELD EXPENSES ── */}
      {activeTab==='Field Expenses' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="h-8 w-36 text-xs" placeholder="From" />
            <Input type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   className="h-8 w-36 text-xs" placeholder="To" />
            <Select value={empFilter} onValueChange={setEmpFilter}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Employees" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-slate-400">{filteredField.length} entries</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100">
              {filteredField.length === 0 ? (
                <div className="py-12 text-center text-slate-400">No expenses found</div>
              ) : filteredField.map(exp => (
                <div key={exp.id} className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-sm">{exp.user_profiles?.name}</span>
                      <StatusBadge status={exp.status} />
                      <span className="text-[10px] text-slate-400 capitalize">{exp.closure_type}</span>
                    </div>
                    <p className="text-sm text-slate-600">{exp.leads?.name || exp.description || '—'}</p>
                    <div className="flex gap-3 flex-wrap text-xs mt-1">
                      <span className="text-slate-500">{exp.expense_date}</span>
                      <span className="text-blue-600">{exp.kilometres} km</span>
                      <span className="text-orange-600">₹{exp.conveyance_amount}</span>
                      {exp.credit_total > 0 && <span className="text-green-600">Credit ₹{exp.credit_total}</span>}
                    </div>
                    {exp.admin_comment && <p className="text-xs text-red-600 mt-1">{exp.admin_comment}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {exp.status === 'pending' && <>
                      <Button size="sm" className="h-7 bg-green-600 hover:bg-green-700 text-xs" onClick={() => handleApprove(exp.id)}>✅</Button>
                      <Button size="sm" variant="outline" className="h-7 text-red-600 text-xs" onClick={() => { setRejectModal(exp); setRejectComment(''); }}>❌</Button>
                    </>}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditField(exp)}>
                      <Edit className="h-3.5 w-3.5 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => setDeleteTarget({ id: exp.id, table:'field_expenses', name: exp.user_profiles?.name || 'expense' })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── OFFICE EXPENSES ── */}
      {activeTab==='Office Expenses' && (
        <div className="space-y-3">
          <Button onClick={() => { setEditOffice(null); setOfficeForm({ category:'tea_refreshments', custom_category:'', amount:'', description:'', expense_date: new Date().toISOString().split('T')[0] }); setIsAddOfficeOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Add Office Expense
          </Button>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100">
              {officeExpenses.length === 0 ? (
                <div className="py-12 text-center text-slate-400">No office expenses yet</div>
              ) : officeExpenses.map(exp => (
                <div key={exp.id} className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm">{CAT_LABELS[exp.category] || exp.custom_category}</span>
                      <span className="text-orange-600 font-bold text-sm">₹{exp.amount}</span>
                    </div>
                    <p className="text-xs text-slate-500">{exp.description} · {exp.expense_date} · {exp.user_profiles?.name}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                      setEditOffice(exp);
                      setOfficeForm({ category:exp.category, custom_category:exp.custom_category||'', amount:String(exp.amount), description:exp.description, expense_date:exp.expense_date });
                      setIsAddOfficeOpen(true);
                    }}><Edit className="h-3.5 w-3.5 text-slate-500" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => setDeleteTarget({ id:exp.id, table:'office_expenses', name:'office expense' })}>
                      <Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LEDGER ── */}
      {activeTab==='Ledger' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Date','Source','Person','Description','KM','Expense ₹','Credit ₹','Net ₹','Balance'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-slate-400">No approved entries yet</td></tr>
                ) : ledger.map((row, i) => (
                  <tr key={i} className={cn("hover:bg-slate-50", row.source==='Office' ? '' : row.credit > 0 ? 'bg-green-50/40' : '')}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.date}</td>
                    <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${row.source==='Field'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-600'}`}>{row.source}</span></td>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.person}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate">{row.description}</td>
                    <td className="px-3 py-2 text-blue-600">{row.km > 0 ? `${row.km}` : '—'}</td>
                    <td className="px-3 py-2 text-red-600 font-semibold">₹{row.expense.toFixed(0)}</td>
                    <td className="px-3 py-2 text-green-600 font-semibold">{row.credit > 0 ? `₹${row.credit.toFixed(0)}` : '—'}</td>
                    <td className="px-3 py-2 font-bold">{row.net >= 0 ? <span className="text-red-600">₹{row.net.toFixed(0)}</span> : <span className="text-green-600">-₹{Math.abs(row.net).toFixed(0)}</span>}</td>
                    <td className="px-3 py-2 font-black text-slate-800">₹{row.running.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Reject */}
      <Dialog open={!!rejectModal} onOpenChange={v => { if (!v) setRejectModal(null); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle className="text-red-600">Reject Expense</DialogTitle></DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-slate-600">Reason for rejection (shown to field boy):</p>
            <textarea className="w-full min-h-[80px] rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
              value={rejectComment} onChange={e => setRejectComment(e.target.value)} placeholder="Enter reason..." />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader><DialogTitle className="text-red-600">Delete {deleteTarget?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600 py-2">This cannot be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Office Expense */}
      <Dialog open={isAddOfficeOpen} onOpenChange={v => { if (!v) setIsAddOfficeOpen(false); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>{editOffice ? 'Edit' : 'Add'} Office Expense</DialogTitle></DialogHeader>
          <div className="space-y-3 py-3">
            <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Category</label>
              <Select value={officeForm.category} onValueChange={v => setOfficeForm(p => ({...p, category:v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OFFICE_CATS.map(c => <SelectItem key={c} value={c}>{CAT_LABELS[c]}</SelectItem>)}</SelectContent>
              </Select></div>
            {officeForm.category === 'other' && (
              <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Custom Category</label>
                <Input value={officeForm.custom_category} onChange={e => setOfficeForm(p => ({...p, custom_category:e.target.value}))} /></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Amount ₹ *</label>
                <Input type="number" min="0" value={officeForm.amount} onChange={e => setOfficeForm(p => ({...p, amount:e.target.value}))} /></div>
              <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Date *</label>
                <Input type="date" value={officeForm.expense_date} onChange={e => setOfficeForm(p => ({...p, expense_date:e.target.value}))} /></div>
            </div>
            <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Description *</label>
              <Input value={officeForm.description} onChange={e => setOfficeForm(p => ({...p, description:e.target.value}))} /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAddOfficeOpen(false)}>Cancel</Button>
            <Button onClick={saveOfficeExpense}>{editOffice ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Field Expense */}
      {editField && (
        <Dialog open={!!editField} onOpenChange={v => { if (!v) setEditField(null); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader><DialogTitle>Edit Field Expense</DialogTitle>
              <DialogDescription>{editField.user_profiles?.name} · {editField.leads?.name || 'Ad-hoc'}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-3">
              {[['Date','expense_date','date'],['KM','kilometres','number'],['Conveyance ₹','conveyance_amount','number'],['Credit Total ₹','credit_total','number']].map(([l,k,t]) => (
                <div key={k}><label className="text-xs font-semibold text-slate-600 mb-1 block">{l}</label>
                  <Input type={t} value={editField[k]||''} onChange={e => setEditField((p: any) => ({...p, [k]: e.target.value}))} /></div>
              ))}
              <div className="col-span-2"><label className="text-xs font-semibold text-slate-600 mb-1 block">Status</label>
                <Select value={editField.status} onValueChange={v => setEditField((p: any) => ({...p, status:v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select></div>
              <div className="col-span-2"><label className="text-xs font-semibold text-slate-600 mb-1 block">Admin Comment</label>
                <Input value={editField.admin_comment||''} onChange={e => setEditField((p: any) => ({...p, admin_comment:e.target.value}))} /></div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditField(null)}>Cancel</Button>
              <Button onClick={async () => {
                const { error } = await supabase.from('field_expenses').update({
                  expense_date: editField.expense_date,
                  kilometres: parseFloat(editField.kilometres)||0,
                  conveyance_amount: parseFloat(editField.conveyance_amount)||0,
                  credit_total: parseFloat(editField.credit_total)||0,
                  status: editField.status,
                  admin_comment: editField.admin_comment || null,
                  updated_at: new Date().toISOString(),
                }).eq('id', editField.id);
                if (error) { toast.error(error.message); return; }
                toast.success('Updated');
                setEditField(null);
                fetchAll();
              }}>Update</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ExpensesPage;
