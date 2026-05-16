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
import { AlertCircle, RefreshCcw, UserPlus, PhoneOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const FakeCallsPanel: React.FC = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLead, setActiveLead] = useState<any | null>(null);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');

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

      // Fetch leads who have a fake call attempt and are not complete
      // Fixed: use separate query instead of inner join filter
      const { data: fakeCalls } = await supabase
        .from('call_attempts')
        .select('lead_id')
        .eq('fake_call', true);

      const fakeLeadIds = [...new Set((fakeCalls || []).map((c: any) => c.lead_id))];

      let data = null, error = null;
      if (fakeLeadIds.length > 0) {
        const res = await supabase
          .from('leads')
          .select('*, assigned_user:user_profiles!leads_assigned_to_fkey(name)')
          .in('id', fakeLeadIds)
          .neq('status', 'Complete')
          .order('last_call_date', { ascending: false });
        data = res.data;
        error = res.error;
      } else {
        data = [];
      }

      if (error) throw error;
      
      // Filter unique leads (in case multiple fake calls)
      const uniqueLeads = Array.from(new Map(data.map(item => [item.id, item])).values());
      setLeads(uniqueLeads);
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

  return (
    <div className="space-y-6">
      <Card border-destructive>
        <CardHeader className="bg-red-50 dark:bg-red-950/20">
          <div className="flex items-center gap-2">
            <PhoneOff className="h-5 w-5 text-red-500" />
            <CardTitle>Fake Call Detection Panel</CardTitle>
          </div>
          <CardDescription>
            Review leads with suspicious call durations (under 5s) that aren't completed.
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
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 gap-1"
                        onClick={() => handleMarkForRecall(lead.id)}
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        Recall
                      </Button>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="h-8 gap-1"
                        onClick={() => {
                          setActiveLead(lead);
                          setIsReassignModalOpen(true);
                        }}
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
