/**
 * AdminEmployeeExpensesPanel
 * Add this panel inside ExpensesPage.tsx as a new tab "Staff Expenses"
 * so Admin can approve/reject employee expense claims.
 *
 * Usage inside ExpensesPage tabs:
 *   { tab === 'Staff Expenses' && <AdminEmployeeExpensesPanel empMap={empMap} /> }
 */
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const CAT_LABELS: Record<string, string> = {
  tea_refreshments: '☕ Tea & Refreshments',
  stationary:       '📝 Stationary',
  travel:           '🚗 Travel',
  food:             '🍱 Food',
  internet:         '📶 Internet',
  printing:         '🖨️ Printing',
  miscellaneous:    '📦 Miscellaneous',
  other:            '➕ Other',
};

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved: 'bg-green-100  text-green-800  border-green-200',
  rejected: 'bg-red-100    text-red-800    border-red-200',
};

interface Props {
  empMap: Record<string, string>;
}

const AdminEmployeeExpensesPanel: React.FC<Props> = ({ empMap }) => {
  const { user } = useAuth();
  const [expenses,      setExpenses]      = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filterStatus,  setFilterStatus]  = useState('all');
  const [filterEmp,     setFilterEmp]     = useState('all');
  const [rejectTarget,  setRejectTarget]  = useState<any>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [deleteTarget,  setDeleteTarget]  = useState<any>(null);
  const [actioning,     setActioning]     = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employee_expenses')
        .select('*')
        .order('expense_date', { ascending: false });
      if (error && error.code !== '42P01') throw error;
      setExpenses(data || []);
    } catch (e: any) {
      toast.error('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const pendingCount = expenses.filter(e => e.status === 'pending').length;

  const filtered = expenses.filter(e => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterEmp    !== 'all' && e.user_id !== filterEmp)   return false;
    return true;
  });

  const handleApprove = async (id: string) => {
    setActioning(true);
    try {
      const { error } = await supabase.from('employee_expenses').update({
        status:      'approved',
        approved_by: user!.id,
        approved_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      toast.success('Approved ✅');
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setActioning(false); }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectComment.trim()) { toast.error('Enter a reason'); return; }
    setActioning(true);
    try {
      const { error } = await supabase.from('employee_expenses').update({
        status:        'rejected',
        admin_comment: rejectComment.trim(),
      }).eq('id', rejectTarget.id);
      if (error) throw error;
      toast.success('Rejected');
      setRejectTarget(null);
      setRejectComment('');
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setActioning(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from('employee_expenses').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Deleted');
      setDeleteTarget(null);
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const empOptions = Object.entries(empMap).map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">🟡 Pending ({pendingCount})</SelectItem>
            <SelectItem value="approved">✅ Approved</SelectItem>
            <SelectItem value="rejected">❌ Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEmp} onValueChange={setFilterEmp}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All Employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">👥 All Employees</SelectItem>
            {empOptions.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} entries</span>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400">No expenses found</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map(exp => (
              <div key={exp.id} className="p-4 flex items-start gap-3">
                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{empMap[exp.user_id] || '—'}</span>
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border',
                      STATUS_BADGE[exp.status] || ''
                    )}>
                      {exp.status === 'pending' ? '🟡' : exp.status === 'approved' ? '✅' : '❌'} {exp.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {CAT_LABELS[exp.category] || exp.custom_category || exp.category}
                  </p>
                  <p className="text-xs text-slate-500">{exp.description}</p>
                  <div className="flex gap-3 flex-wrap text-xs">
                    <span className="text-slate-400">{exp.expense_date}</span>
                    <span className="text-orange-600 font-bold">₹{exp.amount}</span>
                  </div>
                  {exp.admin_comment && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-1.5">
                      💬 {exp.admin_comment}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  {exp.status === 'pending' && (
                    <>
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                        disabled={actioning} onClick={() => handleApprove(exp.id)}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />OK
                      </Button>
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs text-red-600 border-red-200"
                        disabled={actioning}
                        onClick={() => { setRejectTarget(exp); setRejectComment(''); }}>
                        <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400"
                    onClick={() => setDeleteTarget(exp)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      <Dialog open={!!rejectTarget} onOpenChange={v => { if (!v) { setRejectTarget(null); setRejectComment(''); }}}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle className="text-red-600">Reject Expense</DialogTitle></DialogHeader>
          <div className="py-3 space-y-2">
            <p className="text-sm text-slate-600">Rejection reason (shown to employee):</p>
            <textarea
              className="w-full min-h-[80px] rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              value={rejectComment}
              onChange={e => setRejectComment(e.target.value)}
              autoFocus
              placeholder="e.g. Receipt not attached, please resubmit"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={actioning}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Confirm Delete
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">Delete this expense? Cannot be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEmployeeExpensesPanel;
