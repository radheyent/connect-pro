import React, { useState, useEffect } from 'react';
import { supabase, Lead } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
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
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter
} from '@/components/ui/dialog';
import { Phone, CheckCircle2, Search, History, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const FieldBoyDashboard: React.FC = () => {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isResubmitModalOpen, setIsResubmitModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailLead, setDetailLead] = useState<any>(null);
  const [empMap, setEmpMap] = useState<Record<string,string>>({});
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [resubmitReason, setResubmitReason] = useState('Resubmission');

  useEffect(() => {
    fetchLeads();
  }, [user]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads').select('*').eq('status', 'Interested')
        .order('important', { ascending: false });
      if (error) throw error;

      // Fetch employee names
      const { data: emps } = await supabase.from('user_profiles').select('id,name');
      const map: Record<string,string> = {};
      (emps||[]).forEach((e:any) => { map[e.id] = e.name; });
      setEmpMap(map);
      setLeads(data || []);
    } catch (error: any) {
      toast.error('Fetch failed');
    } finally {
      setLoading(false);
    }
  };

  const markAsComplete = async (leadId: string) => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({ 
          status: 'Complete',
          completed_date: new Date().toISOString()
        })
        .eq('id', leadId);

      if (error) throw error;
      toast.success('Lead marked as Complete!');
      fetchLeads();
    } catch (error) {
      toast.error('Operation failed');
    }
  };
  
  const handleCancel = async (leadId: string) => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({ 
          status: 'Not Interested'
        })
        .eq('id', leadId);

      if (error) throw error;
      toast.info('Lead canceled and moved to Not Interested');
      fetchLeads();
    } catch (error) {
      toast.error('Operation failed');
    }
  };

  const handleResubmit = async () => {
    if (!activeLead) return;
    try {
      const currentNotes = activeLead.notes ? `${activeLead.notes} | ` : '';
      
      const { error } = await supabase
        .from('leads')
        .update({ 
          status: 'Follow-up',
          follow_up_date: null,
          follow_up_time: null,
          notes: `${currentNotes}Resubmission Note: ${resubmitReason || 'Resubmission'}`
        })
        .eq('id', activeLead.id);

      if (error) throw error;
      toast.success('Lead successfully resubmitted to employee followup.');
      setIsResubmitModalOpen(false);
      fetchLeads();
    } catch (error) {
      toast.error('Operation failed');
    }
  };

  const filteredLeads = leads.filter(l => 
    l.name.toLowerCase().includes(search.toLowerCase()) || 
    l.phone.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <h1 className="text-2xl font-bold">Field Closure Desk</h1>
        <div className="flex w-full md:w-auto items-center gap-2">
          <Input 
            placeholder="Find lead to close..." 
            className="flex-1 md:w-80"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="outline" size="icon" onClick={fetchLeads} className="shrink-0">
            <History className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[120px]">Customer</TableHead>
                  <TableHead className="min-w-[120px]">Phone</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Wait Time</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10">Syncing sales data...</TableCell></TableRow>
                ) : filteredLeads.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">All leads are closed.</TableCell></TableRow>
                ) : (
                  filteredLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">
                        <button className="flex items-center gap-2 hover:underline text-left" onClick={() => { setDetailLead({...lead, assigned_user_name: empMap[lead.assigned_to] || 'Unassigned'}); setIsDetailOpen(true); }}>
                          {lead.name}
                          {lead.important && <Badge variant="destructive" className="h-2 w-2 p-0 rounded-full" title="Important" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{lead.phone}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        {empMap[lead.assigned_to] || '--'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={lead.status === 'Interested' ? 'default' : 'secondary'} className="text-[10px]">
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground uppercase">
                         {format(new Date(lead.created_date), 'dd MMM')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                           <Button 
                             size="sm" 
                             className="bg-emerald-600 hover:bg-emerald-700 h-8 gap-1 px-2 sm:px-3 text-[11px]"
                             onClick={() => markAsComplete(lead.id)}
                           >
                             <CheckCircle2 className="h-3.5 w-3.5" />
                             <span className="hidden xs:inline">Done</span>
                           </Button>
                           <Button 
                             size="sm" 
                             variant="outline"
                             className="h-8 gap-1 px-2 sm:px-3 text-[11px] border-blue-200 text-blue-700 hover:bg-blue-50"
                             onClick={() => {
                               setActiveLead(lead);
                               setResubmitReason('Resubmission');
                               setIsResubmitModalOpen(true);
                             }}
                           >
                             <RefreshCw className="h-3.5 w-3.5" />
                             <span className="hidden xs:inline">Resubmit</span>
                           </Button>
                           <Button 
                             size="sm" 
                             variant="outline"
                             className="h-8 gap-1 px-2 sm:px-3 text-[11px] border-red-200 text-red-700 hover:bg-red-50"
                             onClick={() => handleCancel(lead.id)}
                           >
                             <XCircle className="h-3.5 w-3.5" />
                           </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Lead Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailLead?.name}
              {detailLead?.important && <Badge variant="destructive" className="text-[10px]">Important</Badge>}
            </DialogTitle>
          </DialogHeader>
          {detailLead && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-slate-400 uppercase">Phone</p><p className="font-mono font-bold">{detailLead.phone}</p></div>
                <div><p className="text-xs text-slate-400 uppercase">Matching No.</p><p className="font-mono">{detailLead.matching_number || '—'}</p></div>
                <div><p className="text-xs text-slate-400 uppercase">Operator</p><p>{detailLead.current_operator || '—'}</p></div>
                <div><p className="text-xs text-slate-400 uppercase">Status</p><Badge variant="default" className="text-[10px]">{detailLead.status}</Badge></div>
                <div><p className="text-xs text-slate-400 uppercase">Assigned Employee</p><p className="font-semibold text-blue-700">{detailLead.assigned_user_name}</p></div>
                <div><p className="text-xs text-slate-400 uppercase">Created</p><p>{detailLead.created_date ? format(new Date(detailLead.created_date), 'dd MMM yyyy') : '—'}</p></div>
                {detailLead.follow_up_date && (
                  <div><p className="text-xs text-slate-400 uppercase">Follow-up</p><p>{format(new Date(detailLead.follow_up_date), 'dd MMM yyyy')} {detailLead.follow_up_time || ''}</p></div>
                )}
              </div>
              {detailLead.notes && (
                <div><p className="text-xs text-slate-400 uppercase mb-1">Notes</p><p className="bg-slate-50 rounded p-2 text-xs">{detailLead.notes}</p></div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isResubmitModalOpen} onOpenChange={setIsResubmitModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Resubmit Lead</DialogTitle>
            <DialogDescription>
              This lead will be returned to {activeLead ? (empMap[activeLead.assigned_to] || 'the employee') : ''} as a Follow-up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Review Reason (Optional)</label>
              <Input 
                value={resubmitReason}
                onChange={(e) => setResubmitReason(e.target.value)}
                placeholder="Resubmission"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResubmitModalOpen(false)}>Cancel</Button>
            <Button onClick={handleResubmit}>Confirm Resubmit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FieldBoyDashboard;

