import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, RefreshCcw, UserPlus, PhoneOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// ─── What this panel does ─────────────────────────────────────────────────────
// This is a VALIDATION GATE — not a delete gate.
// Leads with fake call attempts appear here for admin review.
// Admin can:
//   1. ✅ "Not Fake"  → clear fake_call flag on call_attempts → lead exits this list safely
//   2. 🔄 Reassign   → reset lead to Fresh + clear fake flags + assign to employee
//   3. 🔁 Recall     → mark pending_recall = true, status = Not Connected
// No lead is ever deleted from this panel.

const FakeCallsPanel: React.FC = () => {
  const [leads,     setLeads]     = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [empMap,    setEmpMap]    = useState<Record<string,string>>({});
  const [loading,   setLoading]   = useState(true);

  // Reassign modal
  const [activeLead,       setActiveLead]       = useState<any>(null);
  const [isReassignOpen,   setIsReassignOpen]   = useState(false);
  const [assigneeId,       setAssigneeId]       = useState('');
  const [actioning,        setActioning]        = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Step 1: Get lead IDs that have active fake calls
      const { data: fakeCalls, error: fcErr } = await supabase
        .from('call_attempts')
        .select('lead_id')
        .eq('fake_call', true);
      if (fcErr) throw fcErr;

      const fakeLeadIds = [...new Set((fakeCalls || []).map((c: any) => c.lead_id).filter(Boolean))];

      if (fakeLeadIds.length === 0) {
        setLeads([]);
        setLoading(false);
        return;
      }

      // Step 2: Fetch those leads (exclude Complete)
      const { data: leadsData, error: lErr } = await supabase
        .from('leads')
        .select('*')
        .in('id', fakeLeadIds)
        .neq('status', 'Complete')
        .order('last_call_date', { ascending: false });
      if (lErr) throw lErr;

      // Step 3: Employee names
      const { data: emps } = await supabase.from('user_profiles').select('id,name').eq('is_active', true);
      const em: Record<string,string> = {};
      (emps||[]).forEach((e:any) => { em[e.id] = e.name; });
      setEmpMap(em);
      setEmployees(emps || []);

      // Enrich leads with employee name
      const enriched = (leadsData||[]).map((l:any) => ({
        ...l,
        assigneeName: em[l.assigned_to] || 'Unassigned',
      }));
      setLeads(enriched);
    } catch (e: any) {
      toast.error('Failed to fetch: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Action 1: Not Fake — clear fake_call flag ─────────────────────────────
  // This removes the lead from this list without touching the lead record itself
  const handleNotFake = async (lead: any) => {
    setActioning(true);
    try {
      const { error } = await supabase
        .from('call_attempts')
        .update({ fake_call: false })
        .eq('lead_id', lead.id);
      if (error) throw error;
      toast.success(`"${lead.name}" cleared — not a fake call ✅`);
      fetchAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActioning(false);
    }
  };

  // ── Action 2: Recall — mark pending_recall ────────────────────────────────
  // Clears fake flag + marks for recall. Lead stays with same employee.
  const handleRecall = async (lead: any) => {
    setActioning(true);
    try {
      // Clear fake flags
      await supabase.from('call_attempts').update({ fake_call: false }).eq('lead_id', lead.id);
      // Mark lead for recall
      const { error } = await supabase.from('leads')
        .update({ pending_recall: true, status: 'Not Connected' })
        .eq('id', lead.id);
      if (error) throw error;
      toast.success(`"${lead.name}" marked for recall 🔁`);
      fetchAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActioning(false);
    }
  };

  // ── Action 3: Reassign — Fresh + clear fake + new employee ────────────────
  const handleReassign = async () => {
    if (!activeLead || !assigneeId) return;
    setActioning(true);
    try {
      // 1. Clear all fake call flags for this lead
      await supabase.from('call_attempts').update({ fake_call: false }).eq('lead_id', activeLead.id);
      // 2. Reset lead to Fresh + new assignee
      const { error } = await supabase.from('leads').update({
        status:        'Fresh',
        assigned_to:   assigneeId,
        pending_recall: false,
      }).eq('id', activeLead.id);
      if (error) throw error;
      toast.success(`"${activeLead.name}" reassigned as Fresh lead ✅`);
      setIsReassignOpen(false);
      setActiveLead(null);
      setAssigneeId('');
      fetchAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActioning(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="bg-red-50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-900">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <PhoneOff className="h-5 w-5 text-red-500" />
              <div>
                <CardTitle>Fake Call Validation Gate</CardTitle>
                <CardDescription className="mt-0.5">
                  Leads flagged for calls under 10s — review and decide next action.
                  No lead is deleted from here.
                </CardDescription>
              </div>
            </div>
            {leads.length > 0 && (
              <Badge variant="destructive" className="text-sm px-3 py-1">
                {leads.length} flagged
              </Badge>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              <strong>Not Fake</strong> — remove from list, lead untouched
            </span>
            <span className="flex items-center gap-1.5">
              <RefreshCcw className="h-3.5 w-3.5 text-blue-600" />
              <strong>Recall</strong> — clear flag + mark pending recall
            </span>
            <span className="flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5 text-purple-600" />
              <strong>Reassign</strong> — reset to Fresh + new employee
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-900">
                <TableHead>Lead</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Detected At</TableHead>
                <TableHead className="text-right min-w-[260px]">Admin Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center text-slate-400">
                    Scanning for suspicious activity...
                  </TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center">
                    <ShieldCheck className="h-10 w-10 text-green-400 mx-auto mb-2" />
                    <p className="text-slate-400 font-medium">All clear — no fake calls detected</p>
                  </TableCell>
                </TableRow>
              ) : leads.map(lead => (
                <TableRow key={lead.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                  <TableCell className="font-semibold">{lead.name}</TableCell>
                  <TableCell className="font-mono text-sm">{lead.phone}</TableCell>
                  <TableCell className="text-sm italic text-slate-600 dark:text-slate-400">
                    {lead.assigneeName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive" className="animate-pulse font-mono">
                      {lead.last_call_duration}s
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-400">
                    {lead.last_call_date
                      ? format(new Date(lead.last_call_date), 'HH:mm dd/MM/yy')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5 flex-wrap">

                      {/* Action 1: Not Fake */}
                      <Button
                        size="sm"
                        className="h-8 gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                        disabled={actioning}
                        onClick={() => handleNotFake(lead)}
                        title="Mark as genuine — remove from this list"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Not Fake
                      </Button>

                      {/* Action 2: Recall */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 text-xs"
                        disabled={actioning}
                        onClick={() => handleRecall(lead)}
                        title="Clear flag + mark for recall by same employee"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        Recall
                      </Button>

                      {/* Action 3: Reassign */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-purple-600 border-purple-200 hover:bg-purple-50 text-xs"
                        disabled={actioning}
                        onClick={() => {
                          setActiveLead(lead);
                          setAssigneeId(lead.assigned_to || '');
                          setIsReassignOpen(true);
                        }}
                        title="Reset to Fresh + assign to different employee"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Reassign
                      </Button>

                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Reassign Modal ── */}
      <Dialog open={isReassignOpen} onOpenChange={v => { if (!v) { setIsReassignOpen(false); setActiveLead(null); setAssigneeId(''); }}}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-purple-600" />
              Reassign as Fresh Lead
            </DialogTitle>
            <DialogDescription>
              Lead will be reset to <strong>Fresh</strong> status and all fake call flags will be cleared.
              Choose which employee should get this lead.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            {/* Lead info */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <p className="font-bold text-slate-900 dark:text-white">{activeLead?.name}</p>
              <p className="text-xs text-slate-500 font-mono">{activeLead?.phone}</p>
              <p className="text-xs text-slate-400 mt-1">
                Currently: <span className="italic">{activeLead?.assigneeName}</span>
              </p>
            </div>

            {/* Employee select */}
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">
                Assign To Employee
              </label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name}
                      {emp.id === activeLead?.assigned_to && ' (current)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* What will happen */}
            <div className="text-xs text-slate-400 space-y-0.5 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900 rounded-lg p-3">
              <p>✅ Lead status → <strong>Fresh</strong></p>
              <p>✅ Fake call history → cleared (call_attempts)</p>
              <p>✅ Pending recall → reset</p>
              <p>✅ Lead stays in system safely</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsReassignOpen(false)} disabled={actioning}>
              Cancel
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              onClick={handleReassign}
              disabled={!assigneeId || actioning}
            >
              {actioning ? 'Processing...' : 'Reassign as Fresh'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FakeCallsPanel;
