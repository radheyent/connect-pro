import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MapPin, IndianRupee, Plus, ChevronDown, ChevronUp, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const MyConveyancePage: React.FC = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [kmRate, setKmRate] = useState(5);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Add form state
  const [saving, setSaving] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    description: '',
    kilometres: '',
    conveyance_amount: '',
    notes: '',
  });
  const [credit, setCredit] = useState({
    apartment_form: '', security_deposit: '',
    sim_charges: '', other_charges: '', other_description: '',
  });
  const creditTotal = ['apartment_form','security_deposit','sim_charges','other_charges']
    .reduce((s, k) => s + (parseFloat((credit as any)[k]) || 0), 0);

  useEffect(() => { fetchExpenses(); fetchSettings(); }, []);

  const fetchSettings = async () => {
    const { data } = await supabase.from('app_settings').select('value').eq('key','km_rate_per_km').single();
    if (data) setKmRate(parseFloat(data.value) || 5);
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('field_expenses')
        .select('*, leads(name, phone)')
        .eq('field_boy_id', user!.id)
        .order('expense_date', { ascending: false });
      if (error) throw error;
      setExpenses(data || []);
    } catch { toast.error('Failed to load expenses'); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() =>
    statusFilter === 'all' ? expenses : expenses.filter(e => e.status === statusFilter),
    [expenses, statusFilter]
  );

  const approved = useMemo(() => expenses.filter(e => e.status === 'approved'), [expenses]);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthApproved = approved.filter(e => e.expense_date?.startsWith(thisMonth));

  const totalKm   = monthApproved.reduce((s, e) => s + (e.kilometres || 0), 0);
  const totalConv = monthApproved.reduce((s, e) => s + (e.conveyance_amount || 0), 0);
  const totalCred = monthApproved.reduce((s, e) => s + (e.credit_total || 0), 0);

  const handleKmChange = (val: string) => {
    setForm(p => ({ ...p, kilometres: val, conveyance_amount: val ? String((parseFloat(val)||0)*kmRate) : '' }));
  };

  const resetForm = () => {
    setForm({ expense_date: new Date().toISOString().split('T')[0], description:'', kilometres:'', conveyance_amount:'', notes:'' });
    setCredit({ apartment_form:'', security_deposit:'', sim_charges:'', other_charges:'', other_description:'' });
    setShowCredit(false);
  };

  const handleAddExpense = async () => {
    if (!form.description.trim()) { toast.error('Description required'); return; }
    if (!form.kilometres || parseFloat(form.kilometres) <= 0) { toast.error('Kilometres must be > 0'); return; }
    if (!form.conveyance_amount || parseFloat(form.conveyance_amount) < 0) { toast.error('Conveyance amount required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('field_expenses').insert({
        field_boy_id: user!.id,
        closure_type: 'adhoc',
        expense_date: form.expense_date,
        kilometres: parseFloat(form.kilometres),
        conveyance_amount: parseFloat(form.conveyance_amount),
        description: form.description,
        credit_collected: showCredit,
        credit_total: showCredit ? creditTotal : 0,
        credit_breakdown: showCredit ? {
          apartment_form: parseFloat(credit.apartment_form)||0,
          security_deposit: parseFloat(credit.security_deposit)||0,
          sim_charges: parseFloat(credit.sim_charges)||0,
          other_charges: parseFloat(credit.other_charges)||0,
          other_description: credit.other_description,
        } : {},
        notes: form.notes || null,
        status: 'pending',
      });
      if (error) throw error;
      toast.success('Expense submitted — awaiting admin approval 🕐');
      setIsAddOpen(false);
      resetForm();
      fetchExpenses();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Conveyance</h1>
          <p className="text-sm text-slate-500">Track your field expenses — this month (approved only)</p>
        </div>
        <Button onClick={() => { resetForm(); setIsAddOpen(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-1" />Add Expense
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total KM (Month)', value: `${totalKm.toFixed(1)} km`, icon: MapPin, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Conveyance ₹', value: `₹${totalConv.toFixed(2)}`, icon: IndianRupee, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Credit Collected', value: `₹${totalCred.toFixed(2)}`, icon: Calculator, color: 'text-green-600', bg: 'bg-green-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className={`border-0 ${bg}`}>
            <CardContent className="p-4">
              <Icon className={`h-5 w-5 ${color} mb-2`} />
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">🟡 Pending</SelectItem>
            <SelectItem value="approved">✅ Approved</SelectItem>
            <SelectItem value="rejected">❌ Rejected</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-400">{filtered.length} entries</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400">No expenses found</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(exp => (
              <div key={exp.id} className={`p-4 ${exp.status === 'rejected' ? 'bg-red-50/50' : exp.status === 'pending' ? 'opacity-75' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-sm">
                        {exp.leads?.name || exp.description || 'Ad-hoc Expense'}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${STATUS_BADGE[exp.status]}`}>
                        {exp.status === 'pending' ? '🟡 Pending' : exp.status === 'approved' ? '✅ Approved' : '❌ Rejected'}
                      </span>
                      {exp.closure_type && exp.closure_type !== 'adhoc' && (
                        <span className="text-[10px] text-slate-400 capitalize">{exp.closure_type}</span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1 flex-wrap">
                      <span className="text-xs text-slate-500">{exp.expense_date ? format(new Date(exp.expense_date), 'dd MMM yyyy') : '—'}</span>
                      <span className="text-xs text-blue-600 font-medium">{exp.kilometres} km</span>
                      <span className="text-xs text-orange-600 font-medium">₹{exp.conveyance_amount}</span>
                      {exp.credit_total > 0 && <span className="text-xs text-green-600 font-medium">Credit: ₹{exp.credit_total}</span>}
                    </div>
                    {exp.status === 'rejected' && exp.admin_comment && (
                      <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                        <strong>Admin comment:</strong> {exp.admin_comment}
                      </div>
                    )}
                  </div>
                  {exp.credit_total > 0 && (
                    <button onClick={() => setExpandedRow(expandedRow === exp.id ? null : exp.id)}
                      className="text-slate-400 hover:text-slate-600 shrink-0">
                      {expandedRow === exp.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                {expandedRow === exp.id && exp.credit_breakdown && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-green-50 border border-green-100 rounded-lg p-3">
                    {Object.entries(exp.credit_breakdown).filter(([k]) => k !== 'other_description').map(([k, v]) => (
                      Number(v) > 0 && <div key={k}><span className="text-slate-500 capitalize">{k.replace(/_/g,' ')}:</span> <span className="font-bold text-green-700">₹{v as number}</span></div>
                    ))}
                    {exp.credit_breakdown.other_description && <div className="col-span-2 text-slate-500">{exp.credit_breakdown.other_description}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      <Dialog open={isAddOpen} onOpenChange={v => { if (!v && !saving) { setIsAddOpen(false); resetForm(); }}}>
        <DialogContent className="sm:max-w-[460px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-blue-500" />Add Conveyance Expense</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Date</label>
              <Input type="date" value={form.expense_date} onChange={e => setForm(p => ({...p, expense_date: e.target.value}))} /></div>
            <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Description / Purpose *</label>
              <Input placeholder="e.g. Customer visit - Sector 15" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Kilometres *</label>
                <Input type="number" min="0" step="0.1" placeholder="0.0" value={form.kilometres} onChange={e => handleKmChange(e.target.value)} /></div>
              <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Conveyance ₹ *</label>
                <div className="relative"><IndianRupee className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input type="number" min="0" className="pl-7" value={form.conveyance_amount} onChange={e => setForm(p => ({...p, conveyance_amount: e.target.value}))} /></div>
                {form.kilometres && <p className="text-[10px] text-blue-500 mt-0.5">Auto at ₹{kmRate}/km</p>}</div>
            </div>
            <button type="button" onClick={() => setShowCredit(v => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-600">
              <Calculator className="h-4 w-4" />Customer Credit Collected?
              {showCredit ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showCredit && (
              <div className="p-3 bg-green-50 border border-green-100 rounded-xl space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {[['Apartment Form','apartment_form'],['Security Deposit','security_deposit'],['SIM Charges','sim_charges'],['Other Charges','other_charges']].map(([l,k]) => (
                    <div key={k}><label className="text-xs text-slate-600 mb-1 block">{l} ₹</label>
                      <Input type="number" min="0" placeholder="0" value={(credit as any)[k]} onChange={e => setCredit(p => ({...p, [k]: e.target.value}))} /></div>
                  ))}
                </div>
                <Input placeholder="Other description" value={credit.other_description} onChange={e => setCredit(p => ({...p, other_description: e.target.value}))} />
                <div className="flex justify-between pt-1 border-t border-green-200">
                  <span className="text-xs font-bold text-green-700">Total Credit</span>
                  <span className="font-black text-green-700">₹{creditTotal.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Notes (optional)</label>
              <textarea className="w-full min-h-[60px] rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsAddOpen(false); resetForm(); }} disabled={saving}>Cancel</Button>
            <Button onClick={handleAddExpense} disabled={saving}>{saving ? 'Submitting...' : 'Submit Expense'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyConveyancePage;
