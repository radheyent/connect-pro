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
  Plus, Check, X, Clock, MapPin, User, ChevronLeft, ChevronRight,
  Truck, AlertTriangle, Trash2, Pencil, Upload, Download, FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

interface FieldExpense {
  id: string;
  field_boy_id: string;
  expense_date: string;
  kilometres: number;
  conveyance_amount: number;
  credit_total: number;
  description: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_comment: string | null;
  source: 'field';
}
interface EmployeeExpense {
  id: string;
  user_id: string;
  category: string;
  custom_category: string | null;
  amount: number;
  description: string;
  expense_date: string;
  status: 'pending' | 'approved' | 'rejected';
  source: 'employee';
}
type CombinedRow = (FieldExpense | EmployeeExpense) & { userName: string };

const EMPTY_FIELD_FORM = { field_boy_id: '', expense_date: format(new Date(), 'yyyy-MM-dd'), kilometres: '', conveyance_amount: '', credit_total: '', description: '' };

const FieldExpensesPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fieldExpenses, setFieldExpenses] = useState<FieldExpense[]>([]);
  const [employeeExpenses, setEmployeeExpenses] = useState<EmployeeExpense[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [userFilter, setUserFilter] = useState<string>('all');

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FIELD_FORM);
  const [saving, setSaving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<CombinedRow | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CombinedRow | null>(null);

  // Bulk upload (field expenses)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<any[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);

  const userMap = useMemo(() => Object.fromEntries(users.map(u => [u.id, u.name])), [users]);
  const nameToIdMap = useMemo(() => Object.fromEntries(users.map(u => [u.name.trim().toLowerCase(), u.id])), [users]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [fieldRes, empRes, userRes] = await Promise.all([
        supabase.from('field_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('employee_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('user_profiles').select('id,name').eq('is_active', true),
      ]);
      setFieldExpenses((fieldRes.data || []).map((f: any) => ({ ...f, source: 'field' })));
      setEmployeeExpenses((empRes.data || []).map((e: any) => ({ ...e, source: 'employee' })));
      setUsers(userRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load field expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(format(d, 'yyyy-MM'));
  };

  const combined: CombinedRow[] = useMemo(() => {
    const a: CombinedRow[] = fieldExpenses.map(f => ({ ...f, userName: userMap[f.field_boy_id] || 'Unknown' }));
    const b: CombinedRow[] = employeeExpenses.map(e => ({ ...e, userName: userMap[e.user_id] || 'Unknown' }));
    return [...a, ...b]
      .filter(r => r.expense_date?.startsWith(month))
      .filter(r => statusFilter === 'all' || r.status === statusFilter)
      .filter(r => userFilter === 'all' || (r.source === 'field' ? r.field_boy_id : r.user_id) === userFilter)
      .sort((x, y) => y.expense_date.localeCompare(x.expense_date));
  }, [fieldExpenses, employeeExpenses, userMap, month, statusFilter, userFilter]);

  const monthAll = useMemo(() => [
    ...fieldExpenses.map(f => ({ ...f, userName: userMap[f.field_boy_id] || 'Unknown' })),
    ...employeeExpenses.map(e => ({ ...e, userName: userMap[e.user_id] || 'Unknown' })),
  ].filter(r => r.expense_date?.startsWith(month)), [fieldExpenses, employeeExpenses, userMap, month]);

  const totalAmount = (r: CombinedRow) => r.source === 'field' ? Number(r.conveyance_amount) + Number(r.credit_total || 0) : Number(r.amount);

  const pendingCount = monthAll.filter(r => r.status === 'pending').length;
  const approvedTotal = monthAll.filter(r => r.status === 'approved').reduce((s, r) => s + totalAmount(r), 0);
  const pendingTotal = monthAll.filter(r => r.status === 'pending').reduce((s, r) => s + totalAmount(r), 0);

  // Per-employee breakdown for the selected month — split by Field vs Employee expense,
  // approved entries only (so numbers reflect actual payable amounts).
  const userBreakdown = useMemo(() => {
    const map: Record<string, { name: string; fieldTotal: number; employeeTotal: number; fieldCount: number; employeeCount: number }> = {};
    monthAll.forEach(r => {
      if (r.status !== 'approved') return;
      const uid = r.source === 'field' ? (r as FieldExpense).field_boy_id : (r as EmployeeExpense).user_id;
      if (!map[uid]) map[uid] = { name: r.userName, fieldTotal: 0, employeeTotal: 0, fieldCount: 0, employeeCount: 0 };
      if (r.source === 'field') { map[uid].fieldTotal += totalAmount(r); map[uid].fieldCount += 1; }
      else { map[uid].employeeTotal += totalAmount(r); map[uid].employeeCount += 1; }
    });
    return Object.values(map).sort((a, b) => (b.fieldTotal + b.employeeTotal) - (a.fieldTotal + a.employeeTotal));
  }, [monthAll]);

  const approve = async (row: CombinedRow) => {
    try {
      const table = row.source === 'field' ? 'field_expenses' : 'employee_expenses';
      const payload: any = { status: 'approved', updated_at: new Date().toISOString() };
      if (row.source === 'field') { payload.approved_by = user!.id; payload.approved_at = new Date().toISOString(); }
      const { error } = await supabase.from(table).update(payload).eq('id', row.id);
      if (error) throw error;
      toast.success('Approved');
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    try {
      const table = rejectTarget.source === 'field' ? 'field_expenses' : 'employee_expenses';
      const payload: any = { status: 'rejected', updated_at: new Date().toISOString() };
      if (rejectTarget.source === 'field') payload.admin_comment = rejectComment || null;
      const { error } = await supabase.from(table).update(payload).eq('id', rejectTarget.id);
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
      const table = deleteTarget.source === 'field' ? 'field_expenses' : 'employee_expenses';
      const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Deleted');
      setDeleteTarget(null);
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const saveFieldAdd = async () => {
    if (!addForm.field_boy_id) { toast.error('Employee chuno'); return; }
    if (!addForm.conveyance_amount || parseFloat(addForm.conveyance_amount) <= 0) { toast.error('Amount daalo'); return; }
    setSaving(true);
    try {
      const payload = {
        field_boy_id: addForm.field_boy_id,
        expense_date: addForm.expense_date,
        kilometres: parseFloat(addForm.kilometres) || 0,
        conveyance_amount: parseFloat(addForm.conveyance_amount),
        credit_total: parseFloat(addForm.credit_total) || 0,
        description: addForm.description.trim() || null,
        status: 'approved',
        approved_by: user!.id,
        approved_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('field_expenses').insert(payload);
      if (error) throw error;
      toast.success('Field expense added & approved');
      setAddOpen(false);
      setAddForm(EMPTY_FIELD_FORM);
      fetchAll();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  // ── Bulk Upload (Field Expenses) ────────────────────────────────────
  const downloadSample = () => {
    const empNames = users.map(u => u.name);
    const sampleRows = [
      { 'Date (YYYY-MM-DD)': format(new Date(), 'yyyy-MM-dd'), 'Employee Name': empNames[0] || 'Ram', Kilometres: 12, 'Conveyance Amount': 60, 'Credit/Extra': 0, Description: 'Field visit' },
    ];
    const infoRows = [
      { '': 'EMPLOYEE NAME — must match exactly (case-insensitive):' },
      ...empNames.map(n => ({ '': n })),
    ];
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sampleRows);
    ws1['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Field Expenses');
    const ws2 = XLSX.utils.json_to_sheet(infoRows);
    ws2['!cols'] = [{ wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Employee Names');
    XLSX.writeFile(wb, 'FieldExpense_Sample.xlsx');
  };

  const handleBulkFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkRows([]);
    setBulkErrors([]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const errors: string[] = [];
        const parsed: any[] = [];
        raw.forEach((row, i) => {
          const rowNum = i + 2;
          const date = String(row['Date (YYYY-MM-DD)'] || '').trim();
          const empName = String(row['Employee Name'] || '').trim();
          const km = parseFloat(String(row['Kilometres'] || '0').replace(/[^0-9.]/g, '')) || 0;
          const conveyance = parseFloat(String(row['Conveyance Amount'] || '').replace(/[^0-9.]/g, ''));
          const credit = parseFloat(String(row['Credit/Extra'] || '0').replace(/[^0-9.]/g, '')) || 0;
          const desc = String(row['Description'] || '').trim();
          const empId = nameToIdMap[empName.toLowerCase()];

          const rowErrors: string[] = [];
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) rowErrors.push('invalid date');
          if (!empId) rowErrors.push(`employee "${empName}" not found`);
          if (isNaN(conveyance) || conveyance <= 0) rowErrors.push('invalid conveyance amount');
          if (rowErrors.length) errors.push(`Row ${rowNum}: ${rowErrors.join(', ')}`);
          else parsed.push({ expense_date: date, field_boy_id: empId, kilometres: km, conveyance_amount: conveyance, credit_total: credit, description: desc || null });
        });
        setBulkErrors(errors);
        setBulkRows(parsed);
      } catch (err: any) {
        setBulkErrors([`File read error: ${err.message}`]);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleBulkUpload = async () => {
    if (!bulkRows.length) return;
    setBulkUploading(true);
    try {
      const payload = bulkRows.map(r => ({ ...r, status: 'approved', approved_by: user!.id, approved_at: new Date().toISOString() }));
      const { error } = await supabase.from('field_expenses').insert(payload);
      if (error) throw error;
      toast.success(`${payload.length} field expenses uploaded`);
      setBulkOpen(false);
      setBulkRows([]);
      setBulkErrors([]);
      fetchAll();
    } catch (e: any) {
      toast.error('Upload failed: ' + e.message);
    } finally {
      setBulkUploading(false);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
      status === 'approved' ? "bg-green-100 text-green-700" :
      status === 'rejected' ? "bg-red-100 text-red-700" :
      "bg-amber-100 text-amber-700"
    )}>
      {status}
    </span>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-orange-500 flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Field Expenses</h2>
            <p className="text-sm text-slate-500">Conveyance & field team spends — by month</p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <Button variant="outline" onClick={() => setBulkOpen(true)} className="flex-1 sm:flex-none">
            <Upload className="h-4 w-4 mr-1" /> Bulk Upload
          </Button>
          <Button onClick={() => setAddOpen(true)} className="flex-1 sm:flex-none bg-orange-500 hover:bg-orange-600">
            <Plus className="h-4 w-4 mr-1" /> Add Field Expense
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
        <div className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-amber-600 text-xs font-semibold uppercase mb-1">
            <Clock className="h-4 w-4" /> Pending
          </div>
          <p className="text-2xl font-bold text-slate-800">{pendingCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">₹{pendingTotal.toLocaleString('en-IN')} awaiting approval</p>
        </div>
        <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-green-600 text-xs font-semibold uppercase mb-1">
            <Check className="h-4 w-4" /> Approved This Month
          </div>
          <p className="text-2xl font-bold text-slate-800">₹{approvedTotal.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-600 text-xs font-semibold uppercase mb-1">
            <MapPin className="h-4 w-4" /> Total Entries
          </div>
          <p className="text-2xl font-bold text-slate-800">{monthAll.length}</p>
        </div>
      </div>

      {/* Per-employee monthly breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">Employee-wise Total — {format(parseISO(month + '-01'), 'MMMM yyyy')}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Approved amounts only</p>
        </div>
        <div className="divide-y divide-slate-100 md:divide-y-0 md:grid md:grid-cols-2 md:gap-px md:bg-slate-100">
          {userBreakdown.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm md:col-span-2">Is mahine ka koi approved data nahi hai</div>
          ) : userBreakdown.map((u) => (
            <div key={u.name} className="flex items-center justify-between gap-2 p-2.5 bg-white">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                  {u.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-xs truncate">{u.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {u.fieldCount > 0 && `${u.fieldCount} field`}
                    {u.fieldCount > 0 && u.employeeCount > 0 && ' • '}
                    {u.employeeCount > 0 && `${u.employeeCount} exp`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-right">
                {u.fieldCount > 0 && (
                  <div>
                    <p className="text-[9px] text-orange-500 font-semibold uppercase leading-tight">Field</p>
                    <p className="text-xs font-bold text-slate-700 leading-tight">₹{u.fieldTotal.toLocaleString('en-IN')}</p>
                  </div>
                )}
                {u.employeeCount > 0 && (
                  <div>
                    <p className="text-[9px] text-blue-500 font-semibold uppercase leading-tight">Exp</p>
                    <p className="text-xs font-bold text-slate-700 leading-tight">₹{u.employeeTotal.toLocaleString('en-IN')}</p>
                  </div>
                )}
                <div className="pl-2 border-l border-slate-200">
                  <p className="text-[9px] text-slate-400 font-semibold uppercase leading-tight">Total</p>
                  <p className="text-sm font-bold text-slate-900 leading-tight">₹{(u.fieldTotal + u.employeeTotal).toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-10 text-center text-slate-400 text-sm">Loading...</div>
          ) : combined.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">Is filter me koi entry nahi hai</div>
          ) : combined.map((row) => (
            <div key={`${row.source}-${row.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-slate-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800 text-sm">{row.userName}</p>
                    <StatusBadge status={row.status} />
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {row.source === 'field'
                      ? `${(row as FieldExpense).kilometres} km • ${(row as FieldExpense).description || 'Conveyance'}`
                      : `${(row as EmployeeExpense).category === 'other' ? (row as EmployeeExpense).custom_category : (row as EmployeeExpense).category} • ${(row as EmployeeExpense).description}`}
                  </p>
                  <p className="text-[11px] text-slate-400">{format(parseISO(row.expense_date), 'dd MMM yyyy')} • {row.source === 'field' ? 'Field/Conveyance' : 'Employee Expense'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <span className="font-bold text-sm text-slate-800">₹{totalAmount(row).toLocaleString('en-IN')}</span>
                {row.status === 'pending' && (
                  <>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-green-600 hover:bg-green-50" onClick={() => approve(row)} title="Approve">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-50" onClick={() => setRejectTarget(row)} title="Reject">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:bg-red-50" onClick={() => setDeleteTarget(row)} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Field Expense Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Field Expense</DialogTitle>
            <DialogDescription>Manually log a conveyance entry (auto-approved).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Employee</label>
              <Select value={addForm.field_boy_id} onValueChange={(v) => setAddForm({ ...addForm, field_boy_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Date</label>
                <Input type="date" value={addForm.expense_date} onChange={(e) => setAddForm({ ...addForm, expense_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Kilometres</label>
                <Input type="number" value={addForm.kilometres} onChange={(e) => setAddForm({ ...addForm, kilometres: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Conveyance Amount (₹)</label>
                <Input type="number" value={addForm.conveyance_amount} onChange={(e) => setAddForm({ ...addForm, conveyance_amount: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Credit / Extra (₹)</label>
                <Input type="number" value={addForm.credit_total} onChange={(e) => setAddForm({ ...addForm, credit_total: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Description (optional)</label>
              <Input value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={saveFieldAdd} disabled={saving} className="bg-orange-500 hover:bg-orange-600">{saving ? 'Saving...' : 'Add & Approve'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Modal */}
      <Dialog open={bulkOpen} onOpenChange={(open) => { setBulkOpen(open); if (!open) { setBulkRows([]); setBulkErrors([]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Bulk Upload Field Expenses</DialogTitle>
            <DialogDescription>Excel file se ek saath kai field expenses upload karo (auto-approved).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Button variant="outline" size="sm" onClick={downloadSample} className="w-full">
              <Download className="h-4 w-4 mr-1" /> Download Sample Excel
            </Button>
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleBulkFilePick} className="text-sm" />
            </div>
            {bulkErrors.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 max-h-32 overflow-y-auto">
                <p className="text-xs font-semibold text-red-600 mb-1">{bulkErrors.length} row(s) me error:</p>
                {bulkErrors.map((err, i) => <p key={i} className="text-[11px] text-red-500">{err}</p>)}
              </div>
            )}
            {bulkRows.length > 0 && (
              <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                <p className="text-sm font-semibold text-green-700">{bulkRows.length} valid rows ready to upload</p>
                <p className="text-xs text-green-600">Total: ₹{bulkRows.reduce((s, r) => s + r.conveyance_amount + r.credit_total, 0).toLocaleString('en-IN')}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkUpload} disabled={!bulkRows.length || bulkUploading} className="bg-orange-500 hover:bg-orange-600">
              {bulkUploading ? 'Uploading...' : `Upload ${bulkRows.length || ''} Rows`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Expense</DialogTitle>
            <DialogDescription>Optionally tell {rejectTarget?.userName} why this was rejected.</DialogDescription>
          </DialogHeader>
          <Input
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            placeholder="Reason (optional)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={reject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-5 w-5" /> Delete Entry</DialogTitle>
            <DialogDescription>Delete this expense entry for {deleteTarget?.userName}? This cannot be undone.</DialogDescription>
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

export default FieldExpensesPage;
