import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { MapPin, IndianRupee, Calculator, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  leadId: string;
  leadName: string;
  closureType: 'completed' | 'resubmission' | 'cancelled';
}

const CLOSURE_LABELS = {
  completed:    '✅ Completed',
  resubmission: '🔄 Resubmission',
  cancelled:    '❌ Cancelled',
};

const SaleClosureExpenseModal: React.FC<Props> = ({
  open, onClose, onConfirm, leadId, leadName, closureType
}) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [kmRate, setKmRate] = useState(5);
  const [showCredit, setShowCredit] = useState(false);

  // Budget state
  const [monthlyBudget,  setMonthlyBudget]  = useState<number | null>(null);
  const [usedBudget,     setUsedBudget]     = useState(0);

  const [form, setForm] = useState({
    expense_date:      new Date().toISOString().split('T')[0],
    kilometres:        '',
    conveyance_amount: '',
    notes:             '',
  });

  const [credit, setCredit] = useState({
    apartment_form: '', security_deposit: '',
    sim_charges: '', other_charges: '', other_description: '',
  });

  const creditTotal = [
    credit.apartment_form, credit.security_deposit,
    credit.sim_charges, credit.other_charges
  ].reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

  useEffect(() => {
    if (!open || !user) return;
    const fetchSettings = async () => {
      const [settRes, budgetRes, expRes] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key', 'km_rate_per_km').single(),
        supabase.from('expense_budgets').select('monthly_limit').eq('user_id', user.id).maybeSingle(),
        supabase.from('field_expenses')
          .select('conveyance_amount')
          .eq('field_boy_id', user.id)
          .neq('status', 'rejected')
          .gte('expense_date', new Date().toISOString().slice(0, 7) + '-01'),
      ]);
      if (settRes.data)   setKmRate(parseFloat(settRes.data.value) || 5);
      if (budgetRes.data) setMonthlyBudget(budgetRes.data.monthly_limit || null);
      if (expRes.data)    setUsedBudget(expRes.data.reduce((s: number, e: any) => s + (Number(e.conveyance_amount) || 0), 0));
    };
    fetchSettings();
  }, [open, user]);

  const handleKmChange = (val: string) => {
    setForm(p => ({
      ...p,
      kilometres:        val,
      conveyance_amount: val ? String((parseFloat(val) || 0) * kmRate) : '',
    }));
  };

  const set  = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const setC = (k: string, v: string) => setCredit(p => ({ ...p, [k]: v }));

  const newAmount    = parseFloat(form.conveyance_amount) || 0;
  const wouldExceed  = monthlyBudget !== null && (usedBudget + newAmount) > monthlyBudget;
  const remaining    = monthlyBudget !== null ? monthlyBudget - usedBudget : null;

  const handleSubmit = async () => {
    if (!form.kilometres || parseFloat(form.kilometres) <= 0) { toast.error('Kilometres must be > 0'); return; }
    if (form.conveyance_amount === '' || parseFloat(form.conveyance_amount) < 0) { toast.error('Conveyance amount required'); return; }
    if (showCredit && creditTotal === 0) { toast.error('Enter at least one credit amount'); return; }

    // Budget check
    if (monthlyBudget !== null && wouldExceed) {
      toast.error(
        `Expense limit exceeded. Budget: ₹${monthlyBudget.toFixed(0)}, Used: ₹${usedBudget.toFixed(0)}, Remaining: ₹${Math.max(0, remaining!).toFixed(0)}. Please contact Admin.`,
        { duration: 7000 }
      );
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('field_expenses').insert({
        lead_id:           leadId,
        field_boy_id:      user!.id,
        closure_type:      closureType,
        expense_date:      form.expense_date,
        kilometres:        parseFloat(form.kilometres),
        conveyance_amount: parseFloat(form.conveyance_amount),
        credit_collected:  showCredit,
        credit_total:      showCredit ? creditTotal : 0,
        credit_breakdown:  showCredit ? {
          apartment_form:    parseFloat(credit.apartment_form) || 0,
          security_deposit:  parseFloat(credit.security_deposit) || 0,
          sim_charges:       parseFloat(credit.sim_charges) || 0,
          other_charges:     parseFloat(credit.other_charges) || 0,
          other_description: credit.other_description,
        } : {},
        notes:  form.notes || null,
        status: 'pending',
      });
      if (error) throw error;
      toast.success('Expense submitted — pending admin approval 🕐');
      onConfirm();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-500" />
            Log Conveyance Expense
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            <span className="font-medium">Customer:</span> {leadName} &nbsp;|&nbsp;
            <span className="font-medium">Type:</span> {CLOSURE_LABELS[closureType]}
          </p>
        </DialogHeader>

        {/* Budget status */}
        {monthlyBudget !== null && (
          <div className={`rounded-lg p-3 text-xs flex items-center gap-2 ${
            wouldExceed
              ? 'bg-red-50 border border-red-200 text-red-700'
              : remaining! < 500
                ? 'bg-amber-50 border border-amber-200 text-amber-700'
                : 'bg-blue-50 border border-blue-200 text-blue-700'
          }`}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {wouldExceed
              ? `⚠️ This would exceed your budget. Remaining: ₹${Math.max(0, remaining!).toFixed(0)}`
              : `Budget: ₹${usedBudget.toFixed(0)} used of ₹${monthlyBudget.toFixed(0)} — ₹${remaining!.toFixed(0)} remaining`}
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Date */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Expense Date</label>
            <Input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} />
          </div>

          {/* KM + Conveyance */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Kilometres *</label>
              <Input type="number" min="0" step="0.1" placeholder="e.g. 12.5"
                value={form.kilometres} onChange={e => handleKmChange(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Conveyance ₹ *</label>
              <div className="relative">
                <IndianRupee className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input type="number" min="0" step="0.01" placeholder="0.00" className="pl-7"
                  value={form.conveyance_amount} onChange={e => set('conveyance_amount', e.target.value)} />
              </div>
              {form.kilometres && (
                <p className="text-[10px] text-blue-500 mt-0.5">Auto at ₹{kmRate}/km — editable</p>
              )}
            </div>
          </div>

          {/* Credit toggle */}
          <button type="button" onClick={() => setShowCredit(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-600 transition-colors">
            <Calculator className="h-4 w-4" />
            Customer Credit Collected?
            {showCredit ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showCredit && (
            <div className="p-3 bg-green-50 border border-green-100 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Apartment Form ₹', 'apartment_form'],
                  ['Security Deposit ₹', 'security_deposit'],
                  ['SIM Charges ₹', 'sim_charges'],
                  ['Other Charges ₹', 'other_charges'],
                ].map(([label, key]) => (
                  <div key={key}>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">{label}</label>
                    <Input type="number" min="0" step="0.01" placeholder="0"
                      value={(credit as any)[key]}
                      onChange={e => setC(key, e.target.value)} />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Other Description</label>
                <Input placeholder="What was the other charge?" value={credit.other_description}
                  onChange={e => setC('other_description', e.target.value)} />
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-green-200">
                <span className="text-xs font-bold text-green-700">Total Credit</span>
                <span className="text-lg font-black text-green-700">₹{creditTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Notes / Remarks (optional)</label>
            <textarea
              className="w-full min-h-[70px] rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Any additional notes..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Skip (No Expense)</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || (monthlyBudget !== null && wouldExceed)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? 'Submitting...' : 'Submit Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaleClosureExpenseModal;
