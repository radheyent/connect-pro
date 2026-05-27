import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { MapPin, IndianRupee, Plus, ChevronDown, ChevronUp, Calculator, Car } from 'lucide-react';

const EMPTY_FORM = {
  expense_date:      new Date().toISOString().split('T')[0],
  description:       '',
  kilometres:        '',
  conveyance_amount: '',
  notes:             '',
};
const EMPTY_CREDIT = {
  apartment_form:    '',
  security_deposit:  '',
  sim_charges:       '',
  other_charges:     '',
  other_description: '',
};

const StatusBadge = ({ s }: { s: string }) => {
  const map: Record<string, string> = {
    pending:  '🟡 Pending  — bg-yellow-100 text-yellow-800 border-yellow-200',
    approved: '✅ Approved — bg-green-100 text-green-800 border-green-200',
    rejected: '❌ Rejected — bg-red-100 text-red-800 border-red-200',
  };
  const [label, cls] = (map[s] || `${s} — bg-slate-100 text-slate-600 border-slate-200`).split(' — ');
  return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${cls}`}>{label}</span>;
};

const MyConveyancePage: React.FC = () => {
  const { user } = useAuth();
  const [expenses,  setExpenses]  = useState<any[]>([]);
  const [leadMap,   setLeadMap]   = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [kmRate,    setKmRate]    = useState(5);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  const [form,       setForm]       = useState(EMPTY_FORM);
  const [credit,     setCredit]     = useState(EMPTY_CREDIT);
  const [showCredit, setShowCredit] = useState(false);

  const creditTotal = useMemo(() =>
    ['apartment_form', 'security_deposit', 'sim_charges', 'other_charges']
      .reduce((s, k) => s + (parseFloat((credit as any)[k]) || 0), 0),
    [credit]
  );

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Parallel — no joins on auth.users
      const [expRes, setRes] = await Promise.all([
        supabase.from('field_expenses')
          .select('*')
          .eq('field_boy_id', user.id)
          .order('expense_date', { ascending: false }),
        supabase.from('app_settings').select('value').eq('key', 'km_rate_per_km').single(),
      ]);

      const data = expRes.data || [];
      setExpenses(data);

      // Fetch lead names for expenses that have lead_id
      const leadIds = [...new Set(data.map((e: any) => e.lead_id).filter(Boolean))];
      if (leadIds.length > 0) {
        const { data: leadsData } = await supabase.from('leads').select('id,name').in('id', leadIds);
        const lm: Record<string, string> = {};
        (leadsData || []).forEach((l: any) => { lm[l.id] = l.name; });
        setLeadMap(lm);
      }

      setKmRate(parseFloat(setRes.data?.value || '5') || 5);
    } catch (e: any) {
      toast.error('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Summaries (approved this month only) ────────────────────────────────
  const thisMonth = new Date().toISOString().slice(0, 7);
  const { totalKm, totalConv, totalCred } = useMemo(() => {
    const approved = expenses.filter(e => e.status === 'approved' && e.expense_date?.startsWith(thisMonth));
    return {
      totalKm:   approved.reduce((s, e) => s + (Number(e.kilometres) || 0), 0),
      totalConv: approved.reduce((s, e) => s + (Number(e.conveyance_amount) || 0), 0),
      totalCred: approved.reduce((s, e) => s + (Number(e.credit_total) || 0), 0),
    };
  }, [expenses, thisMonth]);

  const filtered = useMemo(() =>
    statusFilter === 'all' ? expenses : expenses.filter(e => e.status === statusFilter),
    [expenses, statusFilter]
  );

  // ── KM auto-fill ─────────────────────────────────────────────────────────
  const handleKmChange = (val: string) => {
    setForm(p => ({
      ...p,
      kilometres:        val,
      conveyance_amount: val ? String(Math.round((parseFloat(val) || 0) * kmRate * 100) / 100) : '',
    }));
  };

  // ── Reset & close ─────────────────────────────────────────────────────────
  const resetAndClose = () => {
    setForm(EMPTY_FORM);
    setCredit(EMPTY_CREDIT);
    setShowCredit(false);
    setIsAddOpen(false);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.description.trim())              { toast.error('Description is required'); return; }
    if (!form.kilometres || parseFloat(form.kilometres) <= 0) { toast.error('Kilometres must be greater than 0'); return; }
    if (!form.conveyance_amount || parseFloat(form.conveyance_amount) < 0) { toast.error('Conveyance amount required'); return; }
    if (showCredit && creditTotal === 0)        { toast.error('Enter at least one credit amount'); return; }

    setSaving(true);
    try {
      const { error } = await supabase.from('field_expenses').insert({
        field_boy_id:      user!.id,
        lead_id:           null,
        closure_type:      'adhoc',
        expense_date:      form.expense_date,
        kilometres:        parseFloat(form.kilometres),
        conveyance_amount: parseFloat(form.conveyance_amount),
        description:       form.description.trim(),
        credit_collected:  showCredit,
        credit_total:      showCredit ? creditTotal : 0,
        credit_breakdown:  showCredit ? {
          apartment_form:    parseFloat(credit.apartment_form) || 0,
          security_deposit:  parseFloat(credit.security_deposit) || 0,
          sim_charges:       parseFloat(credit.sim_charges) || 0,
          other_charges:     parseFloat(credit.other_charges) || 0,
          other_description: credit.other_description.trim(),
        } : {},
        notes:  form.notes.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      toast.success('Expense submitted — awaiting admin approval 🕐');
      resetAndClose();
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">My Conveyance</h1>
          <p className="text-xs text-slate-500 mt-0.5">This month — approved entries only in summary</p>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setCredit(EMPTY_CREDIT); setShowCredit(false); setIsAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" />Add Expense
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total KM (Month)', value: `${totalKm.toFixed(1)} km`, icon: Car,          color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Conveyance ₹',     value: `₹${totalConv.toFixed(0)}`, icon: IndianRupee,  color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/30' },
          { label: 'Credit Collected', value: `₹${totalCred.toFixed(0)}`, icon: Calculator,   color: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-950/30' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className={`border-0 ${bg}`}>
            <CardContent className="p-3 sm:p-4">
              <Icon className={`h-4 w-4 ${color} mb-1.5`} />
              <p className={`text-lg sm:text-2xl font-black ${color}`}>{value}</p>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
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

      {/* List */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <MapPin className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-slate-400 text-sm">No expenses found</p>
            <p className="text-slate-300 text-xs">Add your first expense above</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map(exp => {
              const isExpanded = expandedId === exp.id;
              const hasCredit  = Number(exp.credit_total) > 0;
              return (
                <div key={exp.id}
                  className={exp.status === 'pending' ? 'opacity-80' : ''}>
                  <div className="p-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Title row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white">
                          {leadMap[exp.lead_id] || exp.description || 'Ad-hoc Expense'}
                        </span>
                        <StatusBadge s={exp.status} />
                        {exp.closure_type && exp.closure_type !== 'adhoc' && (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded capitalize">
                            {exp.closure_type}
                          </span>
                        )}
                      </div>

                      {/* Meta row */}
                      <div className="flex gap-3 flex-wrap text-xs">
                        <span className="text-slate-500">{exp.expense_date}</span>
                        <span className="text-blue-600 font-medium">{exp.kilometres} km</span>
                        <span className="text-orange-600 font-medium">₹{exp.conveyance_amount}</span>
                        {hasCredit && (
                          <span className="text-green-600 font-medium">Credit: ₹{exp.credit_total}</span>
                        )}
                      </div>

                      {/* Admin rejection comment */}
                      {exp.status === 'rejected' && exp.admin_comment && (
                        <div className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-1">
                          <strong>Admin:</strong> {exp.admin_comment}
                        </div>
                      )}

                      {/* Notes */}
                      {exp.notes && (
                        <p className="text-xs text-slate-400 italic">{exp.notes}</p>
                      )}
                    </div>

                    {/* Expand button (only if has credit breakdown) */}
                    {hasCredit && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : exp.id)}
                        className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </div>

                  {/* Credit breakdown expanded */}
                  {isExpanded && exp.credit_breakdown && (
                    <div className="mx-4 mb-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 rounded-xl">
                      <p className="text-[10px] font-bold text-green-700 uppercase mb-2">Credit Breakdown</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          ['Apartment Form',    exp.credit_breakdown.apartment_form],
                          ['Security Deposit',  exp.credit_breakdown.security_deposit],
                          ['SIM Charges',       exp.credit_breakdown.sim_charges],
                          ['Other Charges',     exp.credit_breakdown.other_charges],
                        ].filter(([, v]) => Number(v) > 0).map(([label, val]) => (
                          <div key={label as string} className="flex justify-between">
                            <span className="text-slate-500">{label}:</span>
                            <span className="font-bold text-green-700">₹{val}</span>
                          </div>
                        ))}
                        {exp.credit_breakdown.other_description && (
                          <div className="col-span-2 text-slate-400 italic text-[10px]">
                            {exp.credit_breakdown.other_description}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Expense Modal ── */}
      <Dialog open={isAddOpen} onOpenChange={v => { if (!v && !saving) resetAndClose(); }}>
        <DialogContent className="sm:max-w-[460px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-500" />
              Add Conveyance Expense
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Date */}
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">Date *</label>
              <Input
                type="date"
                value={form.expense_date}
                onChange={e => setForm(p => ({ ...p, expense_date: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">Description / Purpose *</label>
              <Input
                placeholder="e.g. Customer visit — Sector 15"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>

            {/* KM + Conveyance */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">Kilometres *</label>
                <Input
                  type="number" min="0" step="0.1"
                  placeholder="0.0"
                  value={form.kilometres}
                  onChange={e => handleKmChange(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">Conveyance ₹ *</label>
                <div className="relative">
                  <IndianRupee className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    type="number" min="0" step="0.01"
                    placeholder="0.00"
                    className="pl-7"
                    value={form.conveyance_amount}
                    onChange={e => setForm(p => ({ ...p, conveyance_amount: e.target.value }))}
                  />
                </div>
                {form.kilometres && (
                  <p className="text-[10px] text-blue-500 mt-0.5">Auto ₹{kmRate}/km — editable</p>
                )}
              </div>
            </div>

            {/* Credit toggle */}
            <button
              type="button"
              onClick={() => setShowCredit(v => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors w-full text-left">
              <Calculator className="h-4 w-4 shrink-0" />
              Customer Credit Collected?
              <span className="ml-auto">{showCredit ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
            </button>

            {showCredit && (
              <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Apartment Form ₹',  'apartment_form'],
                    ['Security Deposit ₹','security_deposit'],
                    ['SIM Charges ₹',     'sim_charges'],
                    ['Other Charges ₹',   'other_charges'],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">{label}</label>
                      <Input
                        type="number" min="0" step="0.01" placeholder="0"
                        value={(credit as any)[key]}
                        onChange={e => setCredit(p => ({ ...p, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">Other Description</label>
                  <Input
                    placeholder="What was the other charge?"
                    value={credit.other_description}
                    onChange={e => setCredit(p => ({ ...p, other_description: e.target.value }))}
                  />
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-green-200 dark:border-green-800">
                  <span className="text-xs font-bold text-green-700 dark:text-green-400">Total Credit</span>
                  <span className="text-lg font-black text-green-700 dark:text-green-400">₹{creditTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">Notes (optional)</label>
              <textarea
                className="w-full min-h-[60px] rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Any additional notes..."
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={resetAndClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? 'Submitting...' : 'Submit Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyConveyancePage;
