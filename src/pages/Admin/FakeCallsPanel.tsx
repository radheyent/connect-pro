import React, { useState, useEffect } from 'react';
import { supabase, Lead, UserProfile } from '@/lib/supabase';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { AlertCircle, RefreshCcw, UserPlus, PhoneOff, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const FakeCallsPanel: React.FC = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLead, setActiveLead] = useState<any | null>(null);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [deleteTarget, setDeleteTarget]   = useState<any>(null);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [isDeleting, setIsDeleting]       = useState(false);

  useEffect(() => {
    fetchFakeLeads();
    fetchEmployees();
  }, []);

  const fetchFakeLeads = async () => {
    setLoading(true);
    try {
      const { isSupabaseConfigured } = await import('@/lib/supabase');
      if (!isSupabaseConfigured) {
        setLeads([
          {
            id: '1', name: 'S. Mehra', phone: '+91 88888 77777', status: 'Flagged',
            assigned_user: { name: 'Employee_04' },
            call_attempts: [{ duration_seconds: 3, fake_call: true, created_at: new Date().toISOString() }],
            last_call_date: new Date().toISOString(),
            last_call_duration: 3
          }
        ] as any);
        return;
      }

      // Step 1: Get lead IDs with fake calls
      const { data: fakeCalls, error: fcErr } = await supabase
        .from('call_attempts').select('lead_id').eq('fake_call', true);
      if (fcErr) throw fcErr;

      const fakeLeadIds = [...new Set((fakeCalls || []).map((c: any) => c.lead_id))];
      if (fakeLeadIds.length === 0) { setLeads([]); return; }

      // Step 2: Fetch those leads (simple select)
      const { data: leadsData, error } = await supabase
        .from('leads').select('*')
        .in('id', fakeLeadIds)
        .neq('status', 'Complete')
        .order('last_call_date', { ascending: false });
      if (error) throw error;

      // Step 3: Enrich with employee names separately
      const assignedIds = [...new Set((leadsData||[]).map((l:any)=>l.assigned_to).filter(Boolean))];
      const empMap: Record<string,string> = {};
      if (assignedIds.length > 0) {
        const { data: emps } = await supabase.from('user_profiles').select('id,name').in('id', assignedIds);
        (emps||[]).forEach((e:any) => { empMap[e.id] = e.name; });
      }

      const enriched = (leadsData||[]).map((l:any) => ({
        ...l, assigned_user: l.assigned_to ? { name: empMap[l.assigned_to] || 'Unknown' } : null
      }));
      setLeads(enriched);
    } catch (error: any) {
      toast.error('Failed to fetch fake call leads');
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    const { isSupabaseConfigured } = await import('@/lib/supabase');
    if (!isSupabaseConfigured) {
      setEmployees([{ id: '1', name: 'Amit Kumar' }, { id: '2', name: 'Rajesh M.' }] as any);
      return;
    }
    const { data } = await supabase.from('user_profiles').select('*').eq('is_active', true);
    setEmployees(data || []);
  };

  const handleMarkForRecall = async (leadId: string) => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({ 
          pending_recall: true, 
          status: 'Not Connected' 
        })
        .eq('id', leadId);

      if (error) throw error;
      toast.success('Lead marked for recall.');
      fetchFakeLeads();
    } catch (error: any) {
      toast.error('Operation failed');
    }
  };

  const handleReassignAndRecall = async () => {
    if (!activeLead || !assigneeId) return;
    try {
      const { error } = await supabase
        .from('leads')
        .update({ 
          assigned_to: assigneeId,
          pending_recall: true, 
          status: 'Not Connected' 
        })
        .eq('id', activeLead.id);

      if (error) throw error;
      toast.success('Lead reassigned and queued for recall.');
      setIsReassignModalOpen(false);
      fetchFakeLeads();
    } catch (error: any) {
      toast.error('Reassignment failed');
    }
  };

  const handleDeleteSingle = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('leads').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      fetchFakeLeads();
    } catch (e: any) { toast.error(e.message); }
    finally { setIsDeleting(false); }
  };

  const handleDeleteAll = async () => {
    if (leads.length === 0) return;
    setIsDeleting(true);
    try {
      const ids = leads.map(l => l.id);
      const { error } = await supabase.from('leads').delete().in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} fake call leads deleted`);
      setIsDeleteAllOpen(false);
      fetchFakeLeads();
    } catch (e: any) { toast.error(e.message); }
    finally { setIsDeleting(false); }
  };

  return (
    <div className="space-y-6">
      <Card border-destructive>
        <CardHeader className="bg-red-50 dark:bg-red-950/20">
          <div className="flex items-center gap-2">
            <PhoneOff className="h-5 w-5 text-red-500" />
            <CardTitle>Fake Call Detection Panel</CardTitle>
          </div>
          <CardDescription className="flex items-center justify-between flex-wrap gap-2">
            <span>Review leads with suspicious call durations (under 10s) that aren't completed.</span>
            {leads.length > 0 && (
              <Button variant="destructive" size="sm" className="h-7 text-xs"
                onClick={() => setIsDeleteAllOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />Delete All ({leads.length})
              </Button>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Current Assignee</TableHead>
                <TableHead>Last Duration</TableHead>
                <TableHead>Detected At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10">Searching for suspicious activity...</TableCell></TableRow>
              ) : leads.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No fake calls detected recently.</TableCell></TableRow>
              ) : leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell>{lead.phone}</TableCell>
                  <TableCell>{lead.assigned_user?.name || 'Unassigned'}</TableCell>
                  <TableCell>
                    <Badge variant="destructive" className="animate-pulse">
                      {lead.last_call_duration}s
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {lead.last_call_date ? format(new Date(lead.last_call_date), 'HH:mm dd/MM') : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" className="h-8 gap-1"
                        onClick={() => handleMarkForRecall(lead.id)}>
                        <RefreshCcw className="h-3.5 w-3.5" />Recall
                      </Button>
                      <Button variant="secondary" size="sm" className="h-8 gap-1"
                        onClick={() => { setActiveLead(lead); setIsReassignModalOpen(true); }}>
                        <UserPlus className="h-3.5 w-3.5" />Reassign
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:bg-red-50"
                        onClick={() => setDeleteTarget(lead)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Single Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Delete Lead
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <div className="p-3 bg-slate-50 rounded-lg border mb-3">
              <p className="font-bold text-slate-900">{deleteTarget?.name}</p>
              <p className="text-xs text-slate-500 font-mono">{deleteTarget?.phone}</p>
            </div>
            <p className="text-xs text-slate-500">This lead will be permanently deleted. This cannot be undone.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSingle} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete All Confirm */}
      <Dialog open={isDeleteAllOpen} onOpenChange={v => { if (!v) setIsDeleteAllOpen(false); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Delete All Fake Call Leads
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-slate-600">
              This will permanently delete all <strong className="text-red-600">{leads.length} leads</strong> flagged for fake calls.
            </p>
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-xs text-red-700 font-semibold">⚠️ This action cannot be undone.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteAllOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : `Delete All (${leads.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign Modal */}
      <Dialog open={isReassignModalOpen} onOpenChange={setIsReassignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign & Recall</DialogTitle>
            <DialogDescription>
              Assign {activeLead?.name} to a different employee for a fresh call.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Choose New Employee</label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReassignModalOpen(false)}>Cancel</Button>
            <Button onClick={handleReassignAndRecall} disabled={!assigneeId}>Reassign & Recall</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FakeCallsPanel;
