import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase, Lead } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Share2, Phone, History, Users, Clock, Plus, Info } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';
import StatusSelect from '@/components/StatusSelect';

const PAGE_SIZE = 50;

const EmployeeLeadsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchRaw, setSearchRaw] = useState('');
  const searchTimer = useRef<any>(null);
  const [filterTab, setFilterTab] = useState<'Fresh' | 'Not Connected' | 'Interested' | 'Complete' | 'Follow-up'>('Fresh');
  const [currentPage, setCurrentPage] = useState(1);

  // Call Modal State
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [calledLeadIds, setCalledLeadIds] = useState<Set<string>>(new Set());
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);

  // Edit Lead State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editFollowUpDate, setEditFollowUpDate] = useState('');
  const [editFollowUpTime, setEditFollowUpTime] = useState('');

  // Call History State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [callHistory, setCallHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // WhatsApp Modal State
  const [isWAModalOpen, setIsWAModalOpen] = useState(false);
  const [waData, setWAData] = useState({
    totalNumbers: '1', anyCharge: 'Zero', note: '', pickupTime: ''
  });

  // Add Lead Modal State
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [newLeadData, setNewLeadData] = useState({
    name: '', phone: '', matching_number: '', current_operator: '', notes: ''
  });

  // Lead View Modal State
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const handleSearchChange = useCallback((val: string) => {
    setSearchRaw(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(val); setCurrentPage(1); }, 300);
  }, []);

  useEffect(() => {
    fetchLeads();
    return () => clearTimeout(searchTimer.current);
  }, []);

  const triggerSaleClosed = useCallback((employeeName: string, details: string) => {
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899'] });
    toast.success(`Hurray!! Good News ${employeeName} Closed the Lead! 🌟`, {
      description: details, position: 'top-center', duration: 10000,
    });
  }, []);

  const fetchCallHistory = useCallback(async (leadId: string) => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('call_attempts').select('*').eq('lead_id', leadId)
        .order('call_start_time', { ascending: false });
      if (error) throw error;
      setCallHistory(data || []);
    } catch { toast.error('Failed to fetch call history'); }
    finally { setLoadingHistory(false); }
  }, []);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads').select('*').eq('assigned_to', user.id)
        .order('important', { ascending: false })
        .order('created_date', { ascending: false });
      if (error) throw error;
      setLeads(data || []);

      // Load called lead IDs from DB for this user (scoped to today for freshness)
      const { data: callData } = await supabase
        .from('call_attempts').select('lead_id').eq('user_id', user.id);
      if (callData) {
        setCalledLeadIds(new Set(callData.map((c: any) => c.lead_id)));
      }
    } catch { toast.error('Failed to fetch leads. Please check your connection.'); }
    finally { setLoading(false); }
  }, [user]);

  const handleAddLead = async () => {
    if (!newLeadData.name || !newLeadData.phone) { toast.error('Name and Phone are required'); return; }
    try {
      const { error } = await supabase.from('leads').insert({
        ...newLeadData, assigned_to: user?.id, added_by: user?.id, status: 'Fresh'
      });
      if (error) throw error;
      toast.success('Lead added successfully and assigned to you');
      setIsAddLeadModalOpen(false);
      setNewLeadData({ name: '', phone: '', matching_number: '', current_operator: '', notes: '' });
      fetchLeads();
    } catch { toast.error('Failed to add lead'); }
  };

  const startCall = useCallback((lead: Lead) => {
    setActiveLead(lead);
    setCallStartTime(Date.now());
    setEditStatus(lead.status || 'Fresh');
    setEditNotes(lead.notes || '');
    setEditFollowUpDate(lead.follow_up_date || '');
    setEditFollowUpTime(lead.follow_up_time || '');
    setCalledLeadIds(prev => new Set([...prev, lead.id]));
    setIsCallModalOpen(true);
    window.location.href = `tel:${lead.phone}`;
  }, []);

  const endCall = async () => {
    if (!activeLead || !callStartTime) return;
    const duration = Math.floor((Date.now() - callStartTime) / 1000);
    const isFake = duration < 10;
    try {
      await supabase.from('call_attempts').insert({
        lead_id: activeLead.id, user_id: user?.id,
        call_start_time: new Date(callStartTime).toISOString(),
        call_end_time: new Date().toISOString(),
        duration_seconds: duration, fake_call: isFake, status_after_call: editStatus
      });
      await supabase.from('leads').update({
        status: editStatus, notes: editNotes,
        follow_up_date: editStatus === 'Follow-up' ? editFollowUpDate || null : null,
        follow_up_time: editStatus === 'Follow-up' ? editFollowUpTime || null : null,
        last_call_date: new Date().toISOString(),
        last_call_duration: duration, pending_recall: isFake
      }).eq('id', activeLead.id);
      if (isFake) toast.warning('Warning: Call duration < 10s. Logged as potential fake call.');
      else toast.success('Call attempt logged successfully.');
      if (editStatus === 'Complete' && activeLead.status !== 'Complete') {
        triggerSaleClosed(profile?.name || 'Employee', `Closed lead ${activeLead.name}`);
      }
      setIsCallModalOpen(false);
      setCallStartTime(null);
      fetchLeads();
    } catch { toast.error('Failed to log call'); }
  };

  const canUpdateStatus = (lead: Lead) => {
    if (!lead) return true;
    if (lead.status !== 'Fresh') return true;
    return calledLeadIds.has(lead.id) || !!lead.last_call_date;
  };

  const handleUpdateStatus = async () => {
    if (!activeLead) return;
    try {
      const { error } = await supabase.from('leads').update({
        status: editStatus, notes: editNotes,
        follow_up_date: editStatus === 'Follow-up' ? editFollowUpDate || null : null,
        follow_up_time: editStatus === 'Follow-up' ? editFollowUpTime || null : null
      }).eq('id', activeLead.id);
      if (error) throw error;
      toast.success('Lead updated successfully');
      setIsEditModalOpen(false);
      fetchLeads();
    } catch { toast.error('Update failed'); }
  };

  const handleWAShare = async () => {
    if (!activeLead || !profile) return;
    const message = `Please close My sale\nCustomer Name: ${activeLead.name}\nCustomer No: ${activeLead.phone}\nTotal Numbers: ${waData.totalNumbers}\nAny Charge: ${waData.anyCharge}\nNote: ${waData.note}\nPickup Time: ${waData.pickupTime}\nEmployee: ${profile.name}`;
    try {
      await supabase.from('whatsapp_messages').insert({
        lead_id: activeLead.id, user_id: user?.id,
        total_numbers: waData.totalNumbers, any_charge: waData.anyCharge,
        note: waData.note, pickup_time: waData.pickupTime, employee_name: profile.name
      });
      if (navigator.share) await navigator.share({ text: message });
      else { await navigator.clipboard.writeText(message); toast.info('Message copied to clipboard!'); }
      setIsWAModalOpen(false);
    } catch (e) { console.error('Share error:', e); }
  };

  const tabCounts = useMemo(() => ({
    Fresh:            leads.filter(l => l.status === 'Fresh').length,
    'Not Connected':  leads.filter(l => l.status === 'Not Connected').length,
    Interested:       leads.filter(l => l.status === 'Interested').length,
    Complete:         leads.filter(l => l.status === 'Complete').length,
    'Follow-up':      leads.filter(l => l.status === 'Follow-up').length,
    'Not Interested': leads.filter(l => l.status === 'Not Interested').length,
  }), [leads]);

  const filteredLeads = useMemo(() => {
    const sl = search.toLowerCase();
    return leads.filter(l => {
      if (sl && !l.name.toLowerCase().includes(sl) && !l.phone.includes(search)) return false;
      return l.status === filterTab;
    });
  }, [leads, search, filterTab]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const currentLeads = useMemo(() =>
    filteredLeads.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredLeads, currentPage]
  );

  // ── Shared Follow-up time fields ──────────────────────────────────────────
  const FollowUpFields = () => (
    <div className="grid grid-cols-2 gap-3 mt-3">
      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Follow-up Date</label>
        <Input type="date" value={editFollowUpDate}
          onChange={e => setEditFollowUpDate(e.target.value)}
          min={new Date().toISOString().split('T')[0]} />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Follow-up Time</label>
        <Select value={editFollowUpTime} onValueChange={setEditFollowUpTime}>
          <SelectTrigger><SelectValue placeholder="Select Time" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Morning">Morning</SelectItem>
            <SelectItem value="Afternoon">Afternoon</SelectItem>
            <SelectItem value="Lunch-2nd Half">Lunch-2nd Half</SelectItem>
            <SelectItem value="Evening">Evening</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b pb-4 border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">My Leads</h1>
          <p className="text-sm text-slate-500">Manage your entire lead queue</p>
        </div>
        <div className="flex w-full md:w-auto items-center gap-3">
          <Button onClick={() => setIsAddLeadModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 h-9">
            <Plus className="h-4 w-4 mr-2" /> Add New Lead
          </Button>
          <div className="relative w-full md:w-64">
            <Input placeholder="Search phone or name..."
              className="pl-3 pr-10 py-1.5 h-9 text-sm"
              value={searchRaw} onChange={e => handleSearchChange(e.target.value)} />
          </div>
          <Button variant="outline" size="icon" onClick={fetchLeads} className="border-slate-300 h-9 w-9">
            <History className="h-4 w-4 text-slate-500" />
          </Button>
        </div>
      </div>

      <Card className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between bg-slate-50/50 gap-4">
          <div className="flex flex-wrap gap-2">
            {([
              { tab: 'Fresh', emoji: '🆕', color: 'bg-slate-800 text-white', outColor: 'text-slate-600 bg-white' },
              { tab: 'Not Connected', emoji: '❌', color: 'bg-red-600 text-white', outColor: 'text-slate-600 bg-white' },
              { tab: 'Interested', emoji: '✅', color: 'bg-green-600 text-white', outColor: 'text-slate-600 bg-white' },
              { tab: 'Complete', emoji: '🏆', color: 'bg-blue-600 text-white', outColor: 'text-slate-600 bg-white' },
              { tab: 'Follow-up', emoji: '🔔', color: 'bg-amber-500 text-white', outColor: 'text-slate-600 bg-white' },
            ] as const).map(({ tab, emoji, color, outColor }) => (
              <Button key={tab}
                variant={filterTab === tab ? 'default' : 'outline'} size="sm"
                onClick={() => { setFilterTab(tab as any); setCurrentPage(1); }}
                className={cn("text-xs h-8", filterTab === tab ? color : outColor)}>
                {emoji} {tab} ({tabCounts[tab as keyof typeof tabCounts] || 0})
              </Button>
            ))}
          </div>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 uppercase text-[10px] py-1">
            {filteredLeads.length} Matches
          </Badge>
        </div>

        <CardContent className="p-0">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
                  <TableHead className="p-4 font-semibold text-slate-500 uppercase text-[11px] tracking-wider">Lead Name</TableHead>
                  <TableHead className="p-4 font-semibold text-slate-500 uppercase text-[11px] tracking-wider">Phone</TableHead>
                  <TableHead className="p-4 font-semibold text-slate-500 uppercase text-[11px] tracking-wider">Status</TableHead>
                  <TableHead className="p-4 font-semibold text-slate-500 uppercase text-[11px] tracking-wider">Last Call</TableHead>
                  <TableHead className="p-4 font-semibold text-slate-500 uppercase text-[11px] tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {loading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {Array(5).fill(0).map((_, j) => (
                        <TableCell key={j} className="p-4"><div className="h-4 w-24 bg-slate-100 animate-pulse rounded" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : currentLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-slate-400">
                      <Users className="h-10 w-10 opacity-20 mx-auto mb-2" />
                      <p>No leads found.</p>
                    </TableCell>
                  </TableRow>
                ) : currentLeads.map(lead => (
                  <TableRow key={lead.id} className="hover:bg-slate-50 transition-colors group">
                    <TableCell className="p-4 font-medium text-slate-900">
                      <div className="flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors"
                        onClick={() => { setActiveLead(lead); setIsDetailsModalOpen(true); }}>
                        <Info className="h-3 w-3 text-slate-300 group-hover:text-blue-500" />
                        {lead.name}
                        {lead.important && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
                        {lead.pending_recall && (
                          <span className="text-[10px] text-red-500 font-bold uppercase underline decoration-red-300">Recall</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="p-4 text-slate-600">{lead.phone}</TableCell>
                    <TableCell className="p-4">
                      <span className={cn(
                        "px-2 py-1 text-[11px] font-bold rounded-full uppercase whitespace-nowrap",
                        lead.status === 'Interested' ? "bg-green-100 text-green-700" :
                        lead.status === 'Follow-up' ? "bg-blue-100 text-blue-700" :
                        lead.status === 'Complete' ? "bg-blue-600 text-white" :
                        lead.status === 'Not Interested' ? "bg-slate-200 text-slate-700" :
                        "bg-slate-100 text-slate-600"
                      )}>{lead.status}</span>
                    </TableCell>
                    <TableCell className="p-4 text-slate-500">
                      {lead.last_call_date ? (
                        <>
                          <span className="block font-medium">{format(new Date(lead.last_call_date), 'HH:mm dd/MM')}</span>
                          <span className="text-[10px] block opacity-70">{lead.last_call_duration || 0}s duration</span>
                        </>
                      ) : '--'}
                    </TableCell>
                    <TableCell className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm"
                          className="bg-white border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 shadow-sm"
                          onClick={() => { setActiveLead(lead); setIsHistoryModalOpen(true); fetchCallHistory(lead.id); }}>
                          <History className="h-3 w-3 mr-1" /> HISTORY
                        </Button>
                        <Button variant="outline" size="sm"
                          className="bg-white border-slate-200 text-blue-600 font-bold text-xs hover:bg-slate-50 shadow-sm"
                          onClick={() => startCall(lead)}>
                          CALL
                        </Button>
                        <Button variant="outline" size="sm"
                          className={cn("font-bold text-xs shadow-sm",
                            canUpdateStatus(lead) ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                                  : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed")}
                          onClick={() => {
                            if (!canUpdateStatus(lead)) { toast.error('📞 Please make a call first to update the status'); return; }
                            setActiveLead(lead);
                            setEditStatus(lead.status || 'Fresh');
                            setEditNotes(lead.notes || '');
                            setEditFollowUpDate(lead.follow_up_date || '');
                            setEditFollowUpTime(lead.follow_up_time || '');
                            setIsEditModalOpen(true);
                          }}>
                          UPDATE
                        </Button>
                        {lead.status === 'Interested' && (
                          <Button variant="default" size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs shadow-sm shadow-green-100"
                            onClick={() => { setActiveLead(lead); setIsWAModalOpen(true); }}>
                            SHARE
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile List View */}
          <div className="md:hidden divide-y divide-slate-100">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="p-4 space-y-3">
                  <div className="h-4 w-1/2 bg-slate-100 animate-pulse rounded" />
                  <div className="flex gap-2">
                    <div className="h-8 w-20 bg-slate-100 animate-pulse rounded" />
                    <div className="h-8 w-20 bg-slate-100 animate-pulse rounded" />
                  </div>
                </div>
              ))
            ) : currentLeads.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <Users className="h-10 w-10 opacity-20 mx-auto" />
                <p>No leads found.</p>
              </div>
            ) : currentLeads.map(lead => (
              <div key={lead.id} className="p-4 space-y-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 cursor-pointer"
                    onClick={() => { setActiveLead(lead); setIsDetailsModalOpen(true); }}>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900">{lead.name}</h4>
                      <Info className="h-3 w-3 text-slate-300" />
                      {lead.important && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
                    </div>
                    <p className="text-sm font-mono text-slate-500">{lead.phone}</p>
                  </div>
                  <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full uppercase shrink-0",
                    lead.status === 'Interested' ? "bg-green-100 text-green-700" :
                    lead.status === 'Follow-up' ? "bg-blue-100 text-blue-700" :
                    lead.status === 'Complete' ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600")}>
                    {lead.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {lead.last_call_date ? format(new Date(lead.last_call_date), 'HH:mm dd/MM') : 'No calls yet'}
                  </div>
                  {lead.pending_recall && (
                    <Badge variant="destructive" className="h-4 text-[9px] px-1 uppercase">Recall</Badge>
                  )}
                </div>

                {/* Mobile action buttons — 3 or 4 per row */}
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm"
                    className="w-full bg-blue-50 border-blue-100 text-blue-600 font-bold text-[11px] h-9"
                    onClick={() => startCall(lead)}>
                    📞 CALL
                  </Button>
                  <Button variant="outline" size="sm"
                    className={cn("w-full font-bold text-[11px] h-9",
                      canUpdateStatus(lead)
                        ? "bg-slate-50 border-slate-200 text-slate-600"
                        : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed")}
                    onClick={() => {
                      if (!canUpdateStatus(lead)) { toast.error('📞 Please make a call first'); return; }
                      setActiveLead(lead);
                      setEditStatus(lead.status || 'Fresh');
                      setEditNotes(lead.notes || '');
                      setEditFollowUpDate(lead.follow_up_date || '');
                      setEditFollowUpTime(lead.follow_up_time || '');
                      setIsEditModalOpen(true);
                    }}>
                    ✏️ EDIT
                  </Button>
                  {lead.status === 'Interested' ? (
                    <Button variant="default" size="sm"
                      className="w-full bg-green-600 text-white font-bold text-[11px] h-9"
                      onClick={() => { setActiveLead(lead); setIsWAModalOpen(true); }}>
                      📤 SHARE
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm"
                      className="w-full bg-white border-slate-200 text-slate-500 font-bold text-[11px] h-9"
                      onClick={() => { setActiveLead(lead); setIsHistoryModalOpen(true); fetchCallHistory(lead.id); }}>
                      🕐 LOG
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 text-[11px] flex items-center justify-between">
          <span className="text-slate-500 font-medium">
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredLeads.length)} of {filteredLeads.length}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 px-3 bg-white text-[11px] font-bold border-slate-300"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
              Prev
            </Button>
            <span className="h-7 px-3 flex items-center bg-blue-50 text-blue-700 text-[11px] font-bold border-blue-200 rounded-md border">
              {currentPage} / {Math.max(1, totalPages)}
            </span>
            <Button variant="outline" size="sm" className="h-7 px-3 bg-white text-[11px] font-bold border-slate-300"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Post-Call Modal with StatusSelect ── */}
      <Dialog open={isCallModalOpen} onOpenChange={setIsCallModalOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-blue-500" />Log Call Details
            </DialogTitle>
            <DialogDescription>
              Call with <span className="font-bold text-slate-800">{activeLead?.name}</span> ({activeLead?.phone}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-3 block">Call Outcome</label>
              <StatusSelect
                value={editStatus}
                onChange={setEditStatus}
                allowComplete={profile?.role === 'admin' || profile?.role === 'field_boy'}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Call Notes</label>
              <Input value={editNotes} onChange={e => setEditNotes(e.target.value)}
                placeholder="Enter details about the conversation..." />
            </div>
            {editStatus === 'Follow-up' && <FollowUpFields />}
          </div>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setIsCallModalOpen(false)}>Cancel Log</Button>
            <Button onClick={endCall} className="flex-1 sm:flex-none">Save Call & Outcome</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Status Modal with StatusSelect ── */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Lead Status</DialogTitle>
            <DialogDescription>Change status for {activeLead?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-3 block">Select Status</label>
              <StatusSelect
                value={editStatus}
                onChange={setEditStatus}
                allowComplete={profile?.role === 'admin' || profile?.role === 'field_boy'}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <Input value={editNotes} onChange={e => setEditNotes(e.target.value)}
                placeholder="Add call notes..." />
            </div>
            {editStatus === 'Follow-up' && <FollowUpFields />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStatus}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── WhatsApp Share Modal ── */}
      <Dialog open={isWAModalOpen} onOpenChange={setIsWAModalOpen}>
        <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden rounded-2xl border border-slate-200 shadow-2xl">
          <div className="bg-green-600 text-white p-4">
            <h4 className="font-bold">Close My Sale</h4>
            <p className="text-[11px] opacity-80 uppercase font-semibold">WhatsApp Submission Form</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Customer Name</label>
                <Input value={activeLead?.name} disabled className="bg-slate-50 text-slate-500 h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Customer No</label>
                <Input value={activeLead?.phone} disabled className="bg-slate-50 text-slate-500 h-9" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Total Numbers</label>
                <Select value={waData.totalNumbers} onValueChange={v => setWAData({...waData, totalNumbers: v})}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{['1','2','3','4','5'].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Any Charge</label>
                <Select value={waData.anyCharge} onValueChange={v => setWAData({...waData, anyCharge: v})}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{['Zero','250','300','Other Type'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Input value={waData.note} onChange={e => setWAData({...waData, note: e.target.value})}
              placeholder="Note (optional)" className="h-9" />
            <Input type="time" value={waData.pickupTime} onChange={e => setWAData({...waData, pickupTime: e.target.value})}
              className="h-9" />
            <Button className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-6 rounded-xl flex items-center justify-center gap-2"
              onClick={handleWAShare}>
              <Share2 className="h-4 w-4" />Share to WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Call History Modal ── */}
      <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-500" />Call History
            </DialogTitle>
            <DialogDescription>Recent calls to {activeLead?.name} ({activeLead?.phone})</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingHistory ? (
              <div className="flex justify-center p-8"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-500" /></div>
            ) : callHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No recorded calls for this lead.</div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                {callHistory.map((call, i) => (
                  <div key={i} className="p-3 border rounded-lg bg-slate-50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{format(new Date(call.call_start_time), 'PPp')}</span>
                      <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full uppercase",
                        call.status_after_call === 'Interested' ? "bg-green-100 text-green-700" :
                        call.status_after_call === 'Follow-up' ? "bg-blue-100 text-blue-700" :
                        call.status_after_call === 'Complete' ? "bg-blue-600 text-white" :
                        "bg-slate-100 text-slate-600")}>
                        {call.status_after_call || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-500 mt-1">
                      <span>Duration: <strong>{call.duration_seconds}s</strong></span>
                      {call.fake_call && <Badge variant="destructive" className="h-4 text-[9px] px-1">Fake</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter><Button onClick={() => setIsHistoryModalOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Lead Modal ── */}
      <Dialog open={isAddLeadModalOpen} onOpenChange={setIsAddLeadModalOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
            <DialogDescription>Create a new lead assigned to yourself.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {[
              { id: 'name', label: 'Name *', placeholder: 'Customer name', key: 'name' },
              { id: 'phone', label: 'Phone *', placeholder: 'Phone number', key: 'phone' },
              { id: 'matching', label: 'Matching No', placeholder: '', key: 'matching_number' },
              { id: 'operator', label: 'Operator', placeholder: '', key: 'current_operator' },
              { id: 'notes', label: 'Notes', placeholder: '', key: 'notes' },
            ].map(({ id, label, placeholder, key }) => (
              <div key={id} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={id} className="text-right text-xs">{label}</Label>
                <Input id={id} className="col-span-3 h-9"
                  placeholder={placeholder}
                  value={(newLeadData as any)[key]}
                  onChange={e => setNewLeadData({...newLeadData, [key]: e.target.value})} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddLeadModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLead} className="bg-blue-600 hover:bg-blue-700 text-white">Save & Assign to Me</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lead Details Modal ── */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden">
          <div className="bg-slate-900 text-white p-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{activeLead?.name}</h2>
                <p className="text-slate-400 font-mono text-sm mt-1">{activeLead?.phone}</p>
              </div>
              <span className={cn("px-2.5 py-1 text-[10px] font-bold rounded-full uppercase shrink-0 mt-0.5",
                activeLead?.status === 'Interested' ? "bg-green-100 text-green-700" :
                activeLead?.status === 'Follow-up' ? "bg-blue-100 text-blue-700" :
                activeLead?.status === 'Complete' ? "bg-blue-600 text-white" :
                "bg-slate-700 text-slate-300")}>
                {activeLead?.status || 'Fresh'}
              </span>
            </div>
          </div>
          <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="space-y-3 text-sm">
              {/* Matching No. and Operator — full width so long text wraps properly */}
              {[
                ['Matching No.', activeLead?.matching_number || '—'],
                ['Operator', activeLead?.current_operator || '—'],
              ].map(([label, value]) => (
                <div key={label} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">{label}</p>
                  <p className="text-sm font-medium text-slate-800 break-words whitespace-pre-wrap">{value}</p>
                </div>
              ))}
              {/* Last Call and Duration — short values, 2-col is fine */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Last Call', activeLead?.last_call_date ? format(new Date(activeLead.last_call_date), 'HH:mm dd/MM/yy') : '—'],
                  ['Duration', `${activeLead?.last_call_duration || 0}s`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">{label}</p>
                    <p className="text-sm font-medium text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            {activeLead?.notes && (
              <div className="bg-slate-50 border rounded-lg p-3">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Notes</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{activeLead.notes}</p>
              </div>
            )}
          </div>
          <div className="p-4 border-t bg-slate-50 flex gap-2">
            <Button className="flex-1" size="sm" onClick={() => { setIsDetailsModalOpen(false); startCall(activeLead!); }}>
              <Phone className="h-3.5 w-3.5 mr-1.5" />CALL NOW
            </Button>
            <Button variant="outline" size="sm" className="flex-1"
              onClick={() => {
                if (!canUpdateStatus(activeLead!)) { toast.error('📞 Call first'); return; }
                setIsDetailsModalOpen(false);
                setEditStatus(activeLead?.status || 'Fresh');
                setEditNotes(activeLead?.notes || '');
                setEditFollowUpDate(activeLead?.follow_up_date || '');
                setEditFollowUpTime(activeLead?.follow_up_time || '');
                setIsEditModalOpen(true);
              }}>
              {canUpdateStatus(activeLead!) ? 'UPDATE' : '🔒 Call First'}
            </Button>
            <Button variant="outline" size="sm" className="flex-1"
              onClick={() => { setIsDetailsModalOpen(false); setIsHistoryModalOpen(true); fetchCallHistory(activeLead?.id!); }}>
              HISTORY
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeLeadsPage;
