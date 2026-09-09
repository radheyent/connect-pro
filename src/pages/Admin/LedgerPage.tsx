import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { BookOpenText, Search, X, TrendingDown, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

type Source = 'Field' | 'Office' | 'Employee' | 'Credit';

interface LedgerRow {
  id: string;
  source: Source;
  date: string;
  personName: string;
  description: string;
  amount: number;
  isCredit: boolean;
  status?: string;
}

const SOURCE_COLORS: Record<Source, string> = {
  Field: 'bg-orange-50 text-orange-600',
  Office: 'bg-red-50 text-red-600',
  Employee: 'bg-purple-50 text-purple-600',
  Credit: 'bg-green-50 text-green-600',
};

const LedgerPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | Source>('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [fieldRes, officeRes, empRes, creditRes, userRes] = await Promise.all([
          supabase.from('field_expenses').select('*'),
          supabase.from('office_expenses').select('*'),
          supabase.from('employee_expenses').select('*'),
          supabase.from('admin_credits').select('*'),
          supabase.from('user_profiles').select('id,name'),
        ]);
        const userMap = Object.fromEntries((userRes.data || []).map((u: any) => [u.id, u.name]));

        const fieldRows: LedgerRow[] = (fieldRes.data || []).map((f: any) => ({
          id: `field-${f.id}`, source: 'Field', date: f.expense_date,
          personName: userMap[f.field_boy_id] || 'Unknown',
          description: f.description || 'Conveyance', amount: Number(f.conveyance_amount) + Number(f.credit_total || 0),
          isCredit: false, status: f.status,
        }));
        const officeRows: LedgerRow[] = (officeRes.data || []).map((o: any) => ({
          id: `office-${o.id}`, source: 'Office', date: o.expense_date,
          personName: o.spent_by_name || '—', description: `${o.category} — ${o.description}`,
          amount: Number(o.amount), isCredit: false,
        }));
        const empRows: LedgerRow[] = (empRes.data || []).map((e: any) => ({
          id: `emp-${e.id}`, source: 'Employee', date: e.expense_date,
          personName: userMap[e.user_id] || 'Unknown',
          description: `${e.category === 'other' ? e.custom_category : e.category} — ${e.description}`,
          amount: Number(e.amount), isCredit: false, status: e.status,
        }));
        const creditRows: LedgerRow[] = (creditRes.data || []).map((c: any) => ({
          id: `credit-${c.id}`, source: 'Credit', date: c.credit_date,
          personName: c.reference || '—', description: `${c.category === 'other' ? c.custom_category : c.category} — ${c.description}`,
          amount: Number(c.amount), isCredit: true,
        }));

        setRows([...fieldRows, ...officeRows, ...empRows, ...creditRows].sort((a, b) => b.date.localeCompare(a.date)));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(format(d, 'yyyy-MM'));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => r.date?.startsWith(month))
      .filter(r => sourceFilter === 'all' || r.source === sourceFilter)
      .filter(r => !q || r.personName.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }, [rows, month, sourceFilter, search]);

  const totalOut = filtered.filter(r => !r.isCredit).reduce((s, r) => s + r.amount, 0);
  const totalIn = filtered.filter(r => r.isCredit).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
          <BookOpenText className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Ledger</h2>
          <p className="text-sm text-slate-500">Sabhi transactions — ek jagah, search & filter ke saath</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="font-semibold text-slate-800 w-36 text-center">{format(parseISO(month + '-01'), 'MMMM yyyy')}</span>
        <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-red-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-red-500 text-xs font-semibold uppercase mb-1"><TrendingDown className="h-4 w-4" /> Total Out</div>
          <p className="text-xl font-bold text-slate-800">₹{totalOut.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-green-600 text-xs font-semibold uppercase mb-1"><TrendingUp className="h-4 w-4" /> Total In</div>
          <p className="text-xl font-bold text-slate-800">₹{totalIn.toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={sourceFilter} onValueChange={(v: any) => setSourceFilter(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="Field">Field</SelectItem>
            <SelectItem value="Office">Office</SelectItem>
            <SelectItem value="Employee">Employee</SelectItem>
            <SelectItem value="Credit">Credit</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-9 pr-8" placeholder="Search name or description..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-red-500">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-10 text-center text-slate-400 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">Koi entry nahi mili</div>
          ) : filtered.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3.5 hover:bg-slate-50">
              <div className="flex items-center gap-3 min-w-0">
                <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0", SOURCE_COLORS[r.source])}>{r.source}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{r.personName}</p>
                  <p className="text-xs text-slate-500 truncate">{r.description}</p>
                  <p className="text-[10px] text-slate-400">{format(parseISO(r.date), 'dd MMM yyyy')} {r.status ? `• ${r.status}` : ''}</p>
                </div>
              </div>
              <span className={cn("font-bold text-sm shrink-0", r.isCredit ? "text-green-600" : "text-red-500")}>
                {r.isCredit ? '+' : '-'}₹{r.amount.toLocaleString('en-IN')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LedgerPage;
