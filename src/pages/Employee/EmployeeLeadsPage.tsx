import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Share2, Phone, History, Users, Clock, Plus, Info } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';

const PAGE_SIZE = 50;

const EmployeeLeadsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchRaw, setSearchRaw] = useState('');
  const searchTimer = useRef<any>(null);
  const [filterTab, setFilterTab] = useState<'Fresh' | 'Not Connected' | 'Interested' | 'Complete' | 'Follow-up'>('Fresh');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);

  // Call Modal State
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  // Tracks which leads this employee has called (session + DB)
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
    totalNumbers: '1',
    anyCharge: 'Zero',
    note: '',
    pickupTime: ''
  });

  // Add Lead Modal State
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [newLeadData, setNewLeadData] = useState({
    name: '',
    phone: '',
    matching_number: '',
    current_operator: '',
    notes: ''
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

  const triggerSaleClosed = (employeeName: string, details: string) => {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899']
    });
    
    toast.success(`Hurray!! Good News ${employeeName} Closed the Lead! 🌟`, {
      description: details,
      position: 'top-center',
      duration: 10000,
    });
  };

  const fetchCallHistory = async (leadId: string) => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('call_attempts')
        .select('*')
        .eq('lead_id', leadId)
        .order('call_start_time', { ascending: false });
      
      if (error) throw error;
      setCallHistory(data || []);
    } catch (err) {
      toast.error('Failed to fetch call history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('assigned_to', user.id)
        .order('important', { ascending: false })
        .order('created_date', { ascending: false });

      if (error) throw error;
      setLeads(data || []);

      // Load called lead IDs from DB for this user
      const { data: callData } = await supabase
        .from('call_attempts')
        .select('lead_id')
        .eq('user_id', user.id);
      if (callData) {
        setCalledLeadIds(new Set(callData.map((c: any) => c.lead_id)));
      }
    } catch (error: any) {
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleAddLead = async () => {
    if (!newLeadData.name || !newLeadData.phone) {
      toast.error('Name and Phone are required');
      return;
    }

    try {
      const { error } = await supabase.from('leads').insert({
        ...newLeadData,
        assigned_to: user?.id,
        added_by: user?.id,
        status: 'Fresh'
      });
      if (error) throw error;
      
      toast.success('Lead added successfully and assigned to you');
      setIsAddLeadModalOpen(false);
      setNewLeadData({ name: '', phone: '', matching_number: '', current_operator: '', notes: '' });
      fetchLeads();
    } catch (error) {
      toast.error('Failed to add lead');
    }
  };

  const startCall = useCallback((lead: Lead) => {
    setActiveLead(lead);
    setCallStartTime(Date.now());
    setEditStatus(lead.status || 'Fresh');
    setEditNotes(lead.notes || '');
    setEditFollowUpDate(lead.follow_up_date || '');
    setEditFollowUpTime(lead.follow_up_time || '');
    // Mark this lead as called immediately (so UPDATE button enables)
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
        lead_id: activeLead.id,
        user_id: user?.id,
        call_start_time: new Date(callStartTime).toISOString(),
        call_end_time: new Date().toISOString(),
        duration_seconds: duration,
        fake_call: isFake,
        status_after_call: editStatus
      });

      await supabase.from('leads').update({
        status: editStatus,
        notes: editNotes,
        follow_up_date: editStatus === 'Follow-up' ? editFollowUpDate || null : null,
        follow_up_time: editStatus === 'Follow-up' ? editFollowUpTime || null : null,
        last_call_date: new Date().toISOString(),
        last_call_duration: duration,
        pending_recall: isFake
      }).eq('id', activeLead.id);

      if (isFake) {
        toast.warning('Warning: Call duration < 10s. Logged as potential fake call.');
      } else {
        toast.success('Call attempt logged successfully.');
      }
      
      if (editStatus === 'Complete' && activeLead.status !== 'Complete') {
        triggerSaleClosed(profile?.name || 'Employee', `Closed lead ${activeLead.name}`);
      }

      setIsCallModalOpen(false);
      setCallStartTime(null);
      fetchLeads();
    } catch (error: any) {
      toast.error('Failed to log call');
    }
  };

  // Gate: can this lead's status be updated?
  // Rule: ONLY enforced for Fresh leads — must call first
  // All other statuses (Not Connected, Interested, Follow-up, etc.) are freely updatable
  const canUpdateStatus = (lead: Lead) => {
    if (!lead) return true; // safe default
    if (lead.status !== 'Fresh') return true; // only Fresh is gated
    return calledLeadIds.has(lead.id) || !!lead.last_call_date;
  };

  const handleUpdateStatus = async () => {
    if (!activeLead) return;
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          status: editStatus,
          notes: editNotes,
          follow_up_date: editStatus === 'Follow-up' ? editFollowUpDate || null : null,
          follow_up_time: editStatus === 'Follow-up' ? editFollowUpTime || null : null
        })
        .eq('id', activeLead.id);
      if (error) throw error;
      
      toast.success('Lead updated successfully');
      setIsEditModalOpen(false);
      fetchLeads();
    } catch (error) {
      toast.error('Update failed');
    }
  };

  const handleWAShare = async () => {
    if (!activeLead || !profile) return;

    const message = `Please close My sale
Customer Name: ${activeLead.name}
Customer No: ${activeLead.phone}
Total Numbers: ${waData.totalNumbers}
Any Charge: ${waData.anyCharge}
Note: ${waData.note}
Pickup Time: ${waData.pickupTime}
Employee: ${profile.name}`;

    try {
      await supabase.from('whatsapp_messages').insert({
        lead_id: activeLead.id,
        user_id: user?.id,
        total_numbers: waData.totalNumbers,
        any_charge: waData.anyCharge,
        note: waData.note,
        pickup_time: waData.pickupTime,
        employee_name: profile.name
      });

      if (navigator.share) {
        await navigator.share({ text: message });
      } else {
        await navigator.clipboard.writeText(message);
        toast.info('Message copied to clipboard! Paste it into WhatsApp.');
      }
      
      setIsWAModalOpen(false);
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  // Memoized tab counts — computed once per leads change
  const tabCounts = useMemo(() => ({
    Fresh:         leads.filter(l => l.status === 'Fresh').length,
    'Not Connected': leads.filter(l => l.status === 'Not Connected').length,
    Interested:    leads.filter(l => l.status === 'Interested').length,
    Complete:      leads.filter(l => l.status === 'Complete').length,
    'Follow-up':   leads.filter(l => l.status === 'Follow-up').length,
    'Not Interested': leads.filter(l => l.status === 'Not Interested').length,
  }), [leads]);

  // Memoized filtered list — only recalculates when deps change
  const filteredLeads = useMemo(() => {
    const sl = search.toLowerCase();
    return leads.filter(l => {
      if (sl && !l.name.toLowerCase().includes(sl) && !l.phone.includes(search)) return false;
      return l.status === filterTab;
    });
  }, [leads, search, filterTab]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  // Memoized current page slice
  const currentLeads = useMemo(() =>
    filteredLeads.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredLeads, currentPage]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b pb-4 border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Leads</h1>
          <p className="text-sm text-slate-500">Manage your entire lead queue</p>
        </div>
        <div className="flex w-full md:w-auto items-center gap-3">
          <Button onClick={() => setIsAddLeadModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 h-9">
            <Plus className="h-4 w-4 mr-2" /> Add New Lead
          </Button>
          <div className="relative w-full md:w-64">
            <Input 
              placeholder="Search phone or name..." 
              className="pl-3 pr-10 py-1.5 h-9 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchLeads} className="border-slate-300 h-9 w-9">
            <History className="h-4 w-4 text-slate-500" />
          </Button>
        </div>
      </div>

      <Card className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between bg-slate-50/50 gap-4">
          <div className="flex flex-wrap gap-2">
            <Button 
              variant={filterTab === 'Fresh' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => { setFilterTab('Fresh'); setCurrentPage(1); }}
              className={cn("text-xs h-8", filterTab === 'Fresh' ? "bg-slate-800 text-white hover:bg-slate-700" : "text-slate-600 bg-white")}
            >
              🆕 Fresh ({tabCounts['Fresh']})
            </Button>
            <Button 
              variant={filterTab === 'Not Connected' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => { setFilterTab('Not Connected'); setCurrentPage(1); }}
              className={cn("text-xs h-8", filterTab === 'Not Connected' ? "bg-red-600 text-white hover:bg-red-700" : "text-slate-600 bg-white")}
            >
              ❌ Not Connected ({tabCounts['Not Connected']})
            </Button>
            <Button 
              variant={filterTab === 'Interested' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => { setFilterTab('Interested'); setCurrentPage(1); }}
              className={cn("text-xs h-8", filterTab === 'Interested' ? "bg-green-600 text-white hover:bg-green-700" : "text-slate-600 bg-white")}
            >
              Interested ({tabCounts['Interested']})
            </Button>
            <Button 
              variant={filterTab === 'Complete' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => { setFilterTab('Complete'); setCurrentPage(1); }}
              className={cn("text-xs h-8", filterTab === 'Complete' ? "bg-blue-600 text-white hover:bg-blue-700" : "text-slate-600 bg-white")}
            >
              Completed ({tabCounts['Complete']})
            </Button>
            <Button 
              variant={filterTab === 'Follow-up' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => { setFilterTab('Follow-up'); setCurrentPage(1); }}
              className={cn("text-xs h-8", filterTab === 'Follow-up' ? "bg-amber-500 text-white hover:bg-amber-600" : "text-slate-600 bg-white")}
            >
              Follow-ups ({tabCounts['Follow-up']})
            </Button>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 uppercase text-[10px] py-1">
              Total {filteredLeads.length} Matches
            </Badge>
          </div>
        </div>
        <CardContent className="p-0">
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
                      <TableCell className="p-4"><div className="h-4 w-24 bg-slate-100 animate-pulse rounded" /></TableCell>
                      <TableCell className="p-4"><div className="h-4 w-24 bg-slate-100 animate-pulse rounded" /></TableCell>
                      <TableCell className="p-4"><div className="h-4 w-16 bg-slate-100 animate-pulse rounded" /></TableCell>
                      <TableCell className="p-4"><div className="h-4 w-24 bg-slate-100 animate-pulse rounded" /></TableCell>
                      <TableCell className="p-4"><div className="h-8 w-24 ml-auto bg-slate-100 animate-pulse rounded" /></TableCell>
                    </TableRow>
                  ))
                ) : currentLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-10 w-10 opacity-20" />
                        <p>No leads found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  currentLeads.map((lead) => (
                    <TableRow key={lead.id} className="hover:bg-slate-50 transition-colors group">
                      <TableCell className="p-4 font-medium text-slate-900">
                        <div 
                          className="flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors"
                          onClick={() => {
                            setActiveLead(lead);
                            setIsDetailsModalOpen(true);
                          }}
                        >
                          <Info className="h-3 w-3 text-slate-300 group-hover:text-blue-500" />
                          {lead.name}
                          {lead.important && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
                          {lead.pending_recall && (
                            <span className="text-[10px] text-red-500 font-bold uppercase underline decoration-red-300">Recall</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="p-4 text-slate-600">{lead.phone}</TableCell>
                      <TableCell className="p-4 text-slate-600">
                        <span className={cn(
                          "px-2 py-1 text-[11px] font-bold rounded-full uppercase whitespace-nowrap",
                          lead.status === 'Interested' ? "bg-green-100 text-green-700" :
                          lead.status === 'Follow-up' ? "bg-blue-100 text-blue-700" :
                          lead.status === 'Complete' ? "bg-blue-600 text-white" :
                          lead.status === 'Not Interested' ? "bg-slate-200 text-slate-700" :
                          "bg-slate-100 text-slate-600"
                        )}>
                          {lead.status}
                        </span>
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
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="bg-white border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 shadow-sm"
                              onClick={() => {
                                setActiveLead(lead);
                                setIsHistoryModalOpen(true);
                                fetchCallHistory(lead.id);
                              }}
                            >
                              <History className="h-3 w-3 mr-1" /> HISTORY
                            </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="bg-white border-slate-200 text-blue-600 font-bold text-xs hover:bg-slate-50 shadow-sm"
                          onClick={() => startCall(lead)}
                        >
                          CALL
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className={cn(
                            "font-bold text-xs shadow-sm",
                            canUpdateStatus(lead)
                              ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                              : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                          )}
                          title={canUpdateStatus(lead) ? 'Update lead status' : 'Call karo pehle'}
                          onClick={() => {
                              if (!canUpdateStatus(lead)) {
                                toast.error('📞 Please make a call first to update the status', { duration: 3000 });
                                return;
                              }
                              setActiveLead(lead);
                              setEditStatus(lead.status || 'Fresh');
                              setEditNotes(lead.notes || '');
                              setEditFollowUpDate(lead.follow_up_date || '');
                              setEditFollowUpTime(lead.follow_up_time || '');
                              setIsEditModalOpen(true);
                            }}
                          >
                            UPDATE
                          </Button>
                          {lead.status === 'Interested' && (
                            <Button 
                              variant="default"
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs shadow-sm shadow-green-100"
                              onClick={() => {
                                setActiveLead(lead);
                                setIsWAModalOpen(true);
                              }}
                            >
                              SHARE
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden divide-y divide-slate-100">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="p-4 space-y-3">
                  <div className="h-4 w-1/2 bg-slate-100 animate-pulse rounded" />
                  <div className="h-4 w-1/4 bg-slate-100 animate-pulse rounded" />
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
            ) : (
              currentLeads.map((lead) => (
                <div key={lead.id} className="p-4 space-y-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div 
                      className="space-y-1 cursor-pointer"
                      onClick={() => {
                        setActiveLead(lead);
                        setIsDetailsModalOpen(true);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 group-hover:text-blue-600">{lead.name}</h4>
                        <Info className="h-3 w-3 text-slate-300" />
                        {lead.important && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
                      </div>
                      <p className="text-sm font-mono text-slate-500">{lead.phone}</p>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 text-[10px] font-bold rounded-full uppercase",
                      lead.status === 'Interested' ? "bg-green-100 text-green-700" :
                      lead.status === 'Follow-up' ? "bg-blue-100 text-blue-700" :
                      lead.status === 'Complete' ? "bg-blue-600 text-white" :
                      "bg-slate-100 text-slate-600"
                    )}>
                      {lead.status}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {lead.last_call_date ? format(new Date(lead.last_call_date), 'HH:mm dd/MM') : 'No calls yet'}
                    </div>
                    {lead.pending_recall && (
                      <Badge variant="destructive" className="h-4 text-[9px] px-1 uppercase tracking-tighter">Recall Needed</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="w-full bg-blue-50 border-blue-100 text-blue-600 font-bold text-[11px] h-9"
                      onClick={() => startCall(lead)}
                    >
                      CALL
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="w-full bg-slate-50 border-slate-200 text-slate-600 font-bold text-[11px] h-9"
                      onClick={() => {
                        if (!canUpdateStatus(lead)) {
                          toast.error('📞 Please make a call first to update the status', { duration: 3000 });
                          return;
                        }
                        setActiveLead(lead);
                        setEditStatus(lead.status || 'Fresh');
                        setEditNotes(lead.notes || '');
                        setEditFollowUpDate(lead.follow_up_date || '');
                        setEditFollowUpTime(lead.follow_up_time || '');
                        setIsEditModalOpen(true);
                      }}
                    >
                      EDIT
                    </Button>
                    {lead.status === 'Interested' && (
                      <Button 
                        variant="default"
                        size="sm"
                        className="w-full bg-green-600 text-white font-bold text-[11px] h-9 shadow-sm"
                        onClick={() => {
                          setActiveLead(lead);
                          setIsWAModalOpen(true);
                        }}
                      >
                        SHARE
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
        <div className="p-4 border-t border-slate-100 bg-slate-50 text-[11px] flex items-center justify-between">
          <span className="text-slate-500 font-medium">
            Showing {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, filteredLeads.length)} of {filteredLeads.length} entries
          </span>
          <div className="flex gap-1">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 px-3 bg-white text-[11px] font-bold border-slate-300"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </Button>
            <span className="h-7 px-3 flex items-center bg-blue-50 text-blue-700 text-[11px] font-bold border-blue-200 rounded-md border">
              Page {currentPage} of {Math.max(1, totalPages)}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 px-3 bg-white text-[11px] font-bold border-slate-300"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Post-Call Modal */}
      <Dialog open={isCallModalOpen} onOpenChange={setIsCallModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-blue-500" />
              Log Call Details
            </DialogTitle>
            <DialogDescription>
              Call initiated with <span className="font-bold text-slate-800">{activeLead?.name}</span> ({activeLead?.phone}). 
              Please enter the outcome below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
               <label className="text-sm font-medium">Outcome Status</label>
               <Select value={editStatus} onValueChange={setEditStatus}>
                 <SelectTrigger>
                   <SelectValue placeholder="Select Status" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="Not Connected">Not Connected</SelectItem>
                   <SelectItem value="Not Interested">Not Interested</SelectItem>
                   <SelectItem value="Interested">Interested</SelectItem>
                   <SelectItem value="Follow-up">Follow-up</SelectItem>
                   {(profile?.role === 'admin' || profile?.role === 'field_boy') && (
                     <SelectItem value="Complete">Complete</SelectItem>
                   )}
                 </SelectContent>
               </Select>
            </div>
            <div className="space-y-2">
               <label className="text-sm font-medium">Call Notes</label>
               <Input 
                 value={editNotes} 
                 onChange={(e) => setEditNotes(e.target.value)} 
                 placeholder="Enter details about the conversation..."
               />
            </div>
            {editStatus === 'Follow-up' && (
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Follow-up Date</label>
                   <Input 
                     type="date"
                     value={editFollowUpDate}
                     onChange={(e) => setEditFollowUpDate(e.target.value)}
                     min={new Date().toISOString().split('T')[0]}
                   />
                 </div>
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Follow-up Time</label>
                   <Select value={editFollowUpTime} onValueChange={setEditFollowUpTime}>
                     <SelectTrigger>
                       <SelectValue placeholder="Select Time" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="Morning">Morning</SelectItem>
                       <SelectItem value="Afternoon">Afternoon</SelectItem>
                       <SelectItem value="Lunch-2nd Half">Lunch-2nd Half</SelectItem>
                       <SelectItem value="Evening">Evening</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setIsCallModalOpen(false)}>Cancel Log</Button>
            <Button onClick={endCall} className="flex-1 sm:flex-none">Save Call & Outcome</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Status Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Lead Status</DialogTitle>
            <DialogDescription>
              Change status for {activeLead?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2">
               <label className="text-sm font-medium">Status</label>
               <Select value={editStatus} onValueChange={setEditStatus}>
                 <SelectTrigger>
                   <SelectValue placeholder="Select Status" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="Not Connected">Not Connected</SelectItem>
                   <SelectItem value="Not Interested">Not Interested</SelectItem>
                   <SelectItem value="Interested">Interested</SelectItem>
                   <SelectItem value="Follow-up">Follow-up</SelectItem>
                   {(profile?.role === 'admin' || profile?.role === 'field_boy') && (
                     <SelectItem value="Complete">Complete</SelectItem>
                   )}
                 </SelectContent>
               </Select>
             </div>
             <div className="space-y-2">
               <label className="text-sm font-medium">Notes</label>
               <Input 
                 value={editNotes} 
                 onChange={(e) => setEditNotes(e.target.value)} 
                 placeholder="Add call notes..."
               />
             </div>
             {editStatus === 'Follow-up' && (
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Follow-up Date</label>
                   <Input 
                     type="date"
                     value={editFollowUpDate}
                     onChange={(e) => setEditFollowUpDate(e.target.value)}
                     min={new Date().toISOString().split('T')[0]}
                   />
                 </div>
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Follow-up Time</label>
                   <Select value={editFollowUpTime} onValueChange={setEditFollowUpTime}>
                     <SelectTrigger>
                       <SelectValue placeholder="Select Time" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="Morning">Morning</SelectItem>
                       <SelectItem value="Afternoon">Afternoon</SelectItem>
                       <SelectItem value="Lunch-2nd Half">Lunch-2nd Half</SelectItem>
                       <SelectItem value="Evening">Evening</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStatus}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Share Modal */}
      <Dialog open={isWAModalOpen} onOpenChange={setIsWAModalOpen}>
        <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden rounded-2xl border border-slate-200 shadow-2xl ring-4 ring-blue-500/10">
          <div className="bg-green-600 text-white p-4 flex items-center justify-between">
            <div>
              <h4 className="font-bold">Close My Sale</h4>
              <p className="text-[11px] opacity-80 uppercase font-semibold">WhatsApp Submission Form</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer Name</label>
                <Input value={activeLead?.name} disabled className="bg-slate-50 border-slate-200 text-slate-500 h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer No</label>
                <Input value={activeLead?.phone} disabled className="bg-slate-50 border-slate-200 text-slate-500 h-9" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Numbers</label>
                <Select value={waData.totalNumbers} onValueChange={(v) => setWAData({...waData, totalNumbers: v})}>
                  <SelectTrigger className="h-9 border-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['1','2','3','4','5'].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Any Charge</label>
                <Select value={waData.anyCharge} onValueChange={(v) => setWAData({...waData, anyCharge: v})}>
                  <SelectTrigger className="h-9 border-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['Zero', '250', '300', 'Other Type'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Note</label>
              <Input 
                value={waData.note} 
                onChange={(e) => setWAData({...waData, note: e.target.value})}
                placeholder="Optional notes"
                className="h-9 border-slate-300"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pickup Time</label>
              <Input 
                type="time" 
                value={waData.pickupTime} 
                onChange={(e) => setWAData({...waData, pickupTime: e.target.value})}
                className="h-9 border-slate-300"
              />
            </div>

            <Button className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-6 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-green-100 transition-all active:scale-95" onClick={handleWAShare}>
              <Share2 className="h-4 w-4" />
              Share to WhatsApp
            </Button>
              <p className="text-[10px] text-center text-slate-400 italic">Logs will be recorded in the system for admin review.</p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Call History Modal */}
        <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-blue-500" />
                Call History
              </DialogTitle>
              <DialogDescription>
                Recent calls made to {activeLead?.name} ({activeLead?.phone})
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {loadingHistory ? (
                <div className="flex justify-center p-8"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-500" /></div>
              ) : callHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No recorded calls for this lead.</div>
              ) : (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  {callHistory.map((call, i) => (
                    <div key={i} className="flex flex-col gap-1 p-3 border rounded-lg bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-800">
                          {format(new Date(call.call_start_time), 'PPp')}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 text-[10px] font-bold rounded-full uppercase",
                          call.status_after_call === 'Interested' ? "bg-green-100 text-green-700" :
                          call.status_after_call === 'Follow-up' ? "bg-blue-100 text-blue-700" :
                          call.status_after_call === 'Complete' ? "bg-blue-600 text-white" :
                          call.status_after_call === 'Not Interested' ? "bg-slate-200 text-slate-700" :
                          "bg-slate-100 text-slate-600"
                        )}>
                          {call.status_after_call || 'Unknown'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-slate-500 mt-1">
                        <div className="flex gap-4">
                          <span>Duration: <strong>{call.duration_seconds}s</strong></span>
                          {call.fake_call && <Badge variant="destructive" className="h-4 text-[9px] px-1">Fake</Badge>}
                        </div>
                        {call.call_end_time && (
                          <span>Ended: {format(new Date(call.call_end_time), 'p')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setIsHistoryModalOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Lead Modal */}
        <Dialog open={isAddLeadModalOpen} onOpenChange={setIsAddLeadModalOpen}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle>Add New Lead</DialogTitle>
              <DialogDescription>
                Create a new lead and assign it to yourself.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right text-xs">Name</Label>
                <Input 
                  id="name" 
                  className="col-span-3 text-sm h-9" 
                  value={newLeadData.name} 
                  onChange={(e) => setNewLeadData({...newLeadData, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="phone" className="text-right text-xs">Phone</Label>
                <Input 
                  id="phone" 
                  className="col-span-3 text-sm h-9" 
                  value={newLeadData.phone} 
                  onChange={(e) => setNewLeadData({...newLeadData, phone: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="matching" className="text-right text-[10px] leading-tight">Matching No</Label>
                <Input 
                  id="matching" 
                  className="col-span-3 text-sm h-9" 
                  value={newLeadData.matching_number} 
                  onChange={(e) => setNewLeadData({...newLeadData, matching_number: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="operator" className="text-right text-xs">Operator</Label>
                <Input 
                  id="operator" 
                  className="col-span-3 text-sm h-9" 
                  value={newLeadData.current_operator} 
                  onChange={(e) => setNewLeadData({...newLeadData, current_operator: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="notes" className="text-right text-xs">Notes</Label>
                <Input 
                  id="notes" 
                  className="col-span-3 text-sm h-9" 
                  value={newLeadData.notes} 
                  onChange={(e) => setNewLeadData({...newLeadData, notes: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddLeadModalOpen(false)}>Cancel</Button>
              <Button onClick={handleAddLead} className="bg-blue-600 hover:bg-blue-700 text-white">Save & Assign to Me</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Lead Details Modal */}
        <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
          <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden">
            <DialogHeader className="bg-slate-900 text-white p-6">
              <div className="flex justify-between items-start">
                <div>
                  <DialogTitle className="text-xl font-bold">{activeLead?.name}</DialogTitle>
                  <DialogDescription className="text-slate-400 font-mono mt-1">
                    {activeLead?.phone}
                  </DialogDescription>
                </div>
                <Badge className={cn(
                  "uppercase font-bold",
                  activeLead?.status === 'Interested' ? "bg-green-500 hover:bg-green-600" :
                  activeLead?.status === 'Follow-up' ? "bg-blue-500 hover:bg-blue-600" :
                  activeLead?.status === 'Complete' ? "bg-blue-700 hover:bg-blue-800" :
                  activeLead?.status === 'Not Interested' ? "bg-slate-400" :
                  "bg-slate-700 hover:bg-slate-800"
                )}>
                  {activeLead?.status || 'Not Connected'}
                </Badge>
              </div>
            </DialogHeader>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Matching Number</p>
                  <p className="text-sm font-medium text-slate-900 bg-slate-50 p-2 rounded border border-slate-100">{activeLead?.matching_number || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Operator</p>
                  <p className="text-sm font-medium text-slate-900 bg-slate-50 p-2 rounded border border-slate-100">{activeLead?.current_operator || 'N/A'}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Remarks / Notes</p>
                <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 min-h-[60px] italic">
                  {activeLead?.notes || 'No remarks added yet...'}
                </div>
              </div>

              {activeLead?.status === 'Follow-up' && activeLead.follow_up_date && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
                      <Clock className="h-5 w-5 text-amber-600" />
                      <div>
                          <p className="text-[10px] font-bold text-amber-700 uppercase">Next Follow-up</p>
                          <p className="text-sm font-bold text-amber-900">{format(new Date(activeLead.follow_up_date), 'PPP text-amber-900')} - {activeLead.follow_up_time}</p>
                      </div>
                  </div>
              )}

              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Communication Logs</p>
                <div className="grid grid-cols-2 gap-4">
                   <div className="p-3 border rounded-lg bg-slate-50 flex items-center justify-between">
                      <div>
                          <p className="text-[10px] text-slate-500 uppercase">Last Interaction</p>
                          <p className="text-sm font-bold text-slate-800">
                            {activeLead?.last_call_date ? format(new Date(activeLead.last_call_date), 'HH:mm dd/MM') : 'N/A'}
                          </p>
                      </div>
                      <History className="h-4 w-4 text-slate-400" />
                   </div>
                   <div className="p-3 border rounded-lg bg-slate-50 flex items-center justify-between">
                      <div>
                          <p className="text-[10px] text-slate-500 uppercase">Last Duration</p>
                          <p className="text-sm font-bold text-slate-800">{activeLead?.last_call_duration || 0}s</p>
                      </div>
                      <Phone className="h-4 w-4 text-slate-400" />
                   </div>
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t flex flex-wrap gap-2">
              <Button 
                  onClick={() => { setIsDetailsModalOpen(false); startCall(activeLead!); }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 h-10 font-bold"
              >
                  <Phone className="h-4 w-4 mr-2" /> CALL NOW
              </Button>
              <Button 
                  variant="outline"
                  onClick={() => {
                    if (!canUpdateStatus(activeLead!)) {
                      toast.error('📞 Please make a call first to update the status', { duration: 3000 });
                      return;
                    }
                    setIsDetailsModalOpen(false);
                    setEditStatus(activeLead?.status || 'Fresh');
                    setEditNotes(activeLead?.notes || '');
                    setEditFollowUpDate(activeLead?.follow_up_date || '');
                    setEditFollowUpTime(activeLead?.follow_up_time || '');
                    setIsEditModalOpen(true);
                  }}
                  className={`flex-1 h-10 font-bold ${
                    canUpdateStatus(activeLead!)
                      ? 'border-slate-300'
                      : 'border-slate-100 text-slate-300 cursor-not-allowed'
                  }`}
              >
                  {canUpdateStatus(activeLead!) ? 'UPDATE' : '🔒 Call First'}
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  setIsDetailsModalOpen(false);
                  setIsHistoryModalOpen(true);
                  fetchCallHistory(activeLead?.id!);
                }}
                className="flex-1 border-slate-300 h-10 font-bold"
              >
                HISTORY
              </Button>
              {activeLead?.status === 'Interested' && (
                  <Button 
                    className="w-full mt-2 bg-green-600 hover:bg-green-700 h-10 font-bold"
                    onClick={() => {
                      setIsDetailsModalOpen(false);
                      setIsWAModalOpen(true);
                    }}
                  >
                    <Share2 className="h-4 w-4 mr-2" /> SHARE ON WHATSAPP
                  </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  export default EmployeeLeadsPage;
