import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IndianRupee, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface BudgetEntry {
  id?: string;
  user_id: string;
  monthly_limit: number;
  note: string;
}

const BudgetPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<{ id: string; name: string; role: string }[]>([]);
  const [budgets, setBudgets] = useState<Record<string, BudgetEntry>>({});
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [form, setForm] = useState<Record<string, { limit: string; note: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const thisMonth = format(new Date(), 'yyyy-MM');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [empRes, budgetRes, fieldRes, empExpRes] = await Promise.all([
        supabase.from('user_profiles').select('id,name,role').eq('is_active', true).in('role', ['employee', 'field_boy']),
        supabase.from('expense_budgets').select('*'),
        supabase.from('field_expenses').select('field_boy_id,conveyance_amount,credit_total,expense_date,status'),
        supabase.from('employee_expenses').select('user_id,amount,expense_date,status'),
      ]);

      setEmployees(empRes.data || []);

      const bm: Record<string, BudgetEntry> = {};
      const fm: Record<string, { limit: string; note: string }> = {};
      (budgetRes.data || []).forEach((b: any) => {
        bm[b.user_id] = b;
        fm[b.user_id] = { limit: String(b.monthly_limit), note: b.note || '' };
      });
      setBudgets(bm);
      setForm(fm);

      const usageMap: Record<string, number> = {};
      (fieldRes.data || [])
        .filter((e: any) => e.status !== 'rejected' && e.expense_date?.startsWith(thisMonth))
        .forEach((e: any) => {
          usageMap[e.field_boy_id] = (usageMap[e.field_boy_id] || 0) + Number(e.conveyance_amount || 0) + Number(e.credit_total || 0);
        });
      (empExpRes.data || [])
        .filter((e: any) => e.status !== 'rejected' && e.expense_date?.startsWith(thisMonth))
        .forEach((e: any) => {
          usageMap[e.user_id] = (usageMap[e.user_id] || 0) + Number(e.amount || 0);
        });
      setUsage(usageMap);
    } catch (e: any) {
      toast.error('Failed to load budgets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const saveBudget = async (empId: string) => {
    const limit = parseFloat(form[empId]?.limit || '0');
    if (!limit || limit < 0) { toast.error('Valid budget amount daalo'); return; }
    setSaving(empId);
    try {
      const payload = {
        user_id: empId,
        monthly_limit: limit,
        note: form[empId]?.note || '',
        updated_by: user!.id,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('expense_budgets').upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
      setBudgets(prev => ({ ...prev, [empId]: payload }));
      toast.success('Spend limit saved');
    } catch (e: any) {
      toast.error(e.message || 'Save fail ho gaya');
    } finally {
      setSaving(null);
    }
  };

  const rows = useMemo(() => employees.map(emp => {
    const budget = budgets[emp.id];
    const used = usage[emp.id] || 0;
    const limit = budget?.monthly_limit || 0;
    const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    const overBudget = limit > 0 && used > limit;
    return { ...emp, budget, used, limit, pct, overBudget };
  }), [employees, budgets, usage]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <IndianRupee className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Employee Spend Limit</h2>
          <p className="text-sm text-slate-500">Har employee ka monthly expense budget set karo — {format(new Date(), 'MMMM yyyy')}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-10 text-center text-slate-400 text-sm">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">Koi active employee/field boy nahi mila</div>
          ) : rows.map(row => (
            <div key={row.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {row.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{row.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase">{row.role.replace('_', ' ')}</p>
                  </div>
                </div>
                {row.limit > 0 && (
                  row.overBudget ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                      <AlertTriangle className="h-3 w-3" /> Over Budget
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                      <Check className="h-3 w-3" /> Within Limit
                    </span>
                  )
                )}
              </div>

              {row.limit > 0 && (
                <div>
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>₹{row.used.toLocaleString('en-IN')} used</span>
                    <span>₹{row.limit.toLocaleString('en-IN')} limit</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", row.overBudget ? "bg-red-500" : "bg-green-500")}
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="number"
                  placeholder="Monthly limit (₹)"
                  className="sm:w-40"
                  value={form[row.id]?.limit || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, [row.id]: { limit: e.target.value, note: prev[row.id]?.note || '' } }))}
                />
                <Input
                  placeholder="Note (optional)"
                  className="flex-1"
                  value={form[row.id]?.note || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, [row.id]: { limit: prev[row.id]?.limit || '', note: e.target.value } }))}
                />
                <Button size="sm" onClick={() => saveBudget(row.id)} disabled={saving === row.id} className="bg-indigo-600 hover:bg-indigo-700">
                  {saving === row.id ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BudgetPage;
