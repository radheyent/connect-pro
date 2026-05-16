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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Share2, Phone, MessageSquare, Edit2, CheckCircle2, History, Info, AlertTriangle, Users, Trophy, Star, Activity, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';

interface RecentActivity {
  id: string;
  message: string;
  timestamp: Date;
  type: 'sale_closed' | 'call_made';
}

const EmployeeDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Performance logic
  const [performanceStats, setPerformanceStats] = useState({
    assigned: 0,
    callsMade: 0,
    interested: 0,
    completed: 0,
    callsToday: 0,
    successRate: 0
  });

  const [filterTab, setFilterTab] = useState<'All' | 'Interested' | 'Complete'>('All');

  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);

  // Call Modal State
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);

  // WhatsApp Modal State
  const [isWAModalOpen, setIsWAModalOpen] = useState(false);
  const [waData, setWAData] = useState({
    totalNumbers: '1',
    anyCharge: 'Zero',
    note: '',
    pickupTime: ''
  });

  // Edit Lead State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editFollowUpDate, setEditFollowUpDate] = useState('');
  const [editFollowUpTime, setEditFollowUpTime] = useState('');

  const [todaysFollowUps, setTodaysFollowUps] = useState<Lead[]>([]);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const hasShownFollowUpModal = React.useRef(false);

  // Call History State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [callHistory, setCallHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, [user]);

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
      duration: 5000,
    });

    setRecentActivities(prev => [
      {
        id: Math.random().toString(),
        message: `Hurray!! Good News ${employeeName} Closed the Lead! - ${details}`,
        timestamp: new Date(),
        type: 'sale_closed'
      },
      ...prev
    ].slice(0, 10)); // Keep last 10
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

  const fetchLeads = async () => {
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
      
      // Compute stats
      const loadedLeads = data || [];
      const interested = loadedLeads.filter((l: any) => l.status === 'Interested').length;
      const completed = loadedLeads.filter((l: any) => l.status === 'Complete').length;
      const todayString = new Date().toISOString().split('T')[0];
      const todayFollowUpsList = loadedLeads.filter((l: any) => l.status === 'Follow-up' && l.follow_up_date === todayString);
      setTodaysFollowUps(todayFollowUpsList);
      
      if (todayFollowUpsList.length > 0 && !hasShownFollowUpModal.current) {
        setIsFollowUpModalOpen(true);
        hasShownFollowUpModal.current = true;
      }

      const callsToday = loadedLeads.filter((l: any) => l.last_call_date && l.last_call_date.startsWith(todayString)).length;
      const callsMade = loadedLeads.filter((l: any) => l.last_call_date).length;

      setPerformanceStats({
        assigned: loadedLeads.length,
        callsMade: callsMade,
        interested: interested,
        completed: completed,
        callsToday: callsToday,
        successRate: callsMade > 0 ? Math.round((completed / callsMade) * 100) : 0
      });

    } catch (error: any) {
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  };

  const startCall = (lead: Lead) => {
    setActiveLead(lead);
    setCallStartTime(Date.now());
    setEditStatus(lead.status);
    setEditNotes(lead.notes || '');
    setEditFollowUpDate(lead.follow_up_date || '');
    setEditFollowUpTime(lead.follow_up_time || '');
    setIsCallModalOpen(true);
    // Log intent to dial immediately as a short attempt just in case they never click "Hang up"
    setRecentActivities(prev => [{
      id: Math.random().toString(),
      message: `Started call with ${lead.name}`,
      timestamp: new Date(),
      type: 'call_made'
    }, ...prev].slice(0,10));
    window.location.href = `tel:${lead.phone}`;
  };

  const endCall = async () => {
    if (!activeLead || !callStartTime) return;
    
    const duration = Math.floor((Date.now() - callStartTime) / 1000);
    const isFake = duration < 5;

    try {
      // 1. Log Call Attempt
      await supabase.from('call_attempts').insert({
        lead_id: activeLead.id,
        user_id: user?.id,
        call_start_time: new Date(callStartTime).toISOString(),
        call_end_time: new Date().toISOString(),
        duration_seconds: duration,
        fake_call: isFake,
        status_after_call: editStatus
      });

      // 2. Update Lead
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
        toast.warning('Warning: Call duration < 5s. Logged as potential fake call.');
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
      // Log Share
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
        await navigator.share({
          text: message
        });
      } else {
        await navigator.clipboard.writeText(message);
        toast.info('Message copied to clipboard! Paste it into WhatsApp.');
      }
      
      triggerSaleClosed(profile.name, `Shared lead via WhatsApp: ${activeLead.name}`);
      setIsWAModalOpen(false);
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const filteredLeads = leads.filter(l => {
    const matchesSearch = l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search);
    const matchesTab = filterTab === 'All' ? true : l.status === filterTab;
    return matchesSearch && matchesTab;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Overview</h1>
          <p className="text-sm text-slate-500">Your performance stats and recent activities</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Performance Stats */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-white border-slate-200 shadow-sm border-b-4 border-b-slate-400">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-slate-50 text-slate-600 rounded-lg hidden sm:block">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Assigned</p>
                  <p className="text-xl font-black text-slate-800">{performanceStats.assigned}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-slate-200 shadow-sm border-b-4 border-b-amber-500">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg hidden sm:block">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Calls</p>
                  <p className="text-xl font-black text-slate-800">{performanceStats.callsMade}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-slate-200 shadow-sm border-b-4 border-b-blue-500">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg hidden sm:block">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Calls Today</p>
                  <p className="text-xl font-black text-slate-800">{performanceStats.callsToday}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-slate-200 shadow-sm border-b-4 border-b-emerald-500">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hidden sm:block">
                  <Star className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interested</p>
                  <p className="text-xl font-black text-slate-800">{performanceStats.interested}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-slate-200 shadow-sm border-b-4 border-b-emerald-700">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg hidden sm:block">
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Completed</p>
                  <p className="text-xl font-black text-slate-800">{performanceStats.completed}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-slate-200 shadow-sm border-b-4 border-b-indigo-500">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hidden sm:block">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Success Rate</p>
                  <p className="text-xl font-black text-slate-800">{performanceStats.successRate}%</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full max-h-[800px]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                Recent Activity
              </h3>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 uppercase text-[10px] animate-pulse">Live</Badge>
            </div>
            <CardContent className="p-0 overflow-y-auto w-full flex-grow">
              {recentActivities.length === 0 ? (
                <div className="p-8 flex flex-col items-center justify-center text-center text-slate-400">
                  <History className="h-10 w-10 opacity-20 mb-2" />
                  <p className="text-sm">No recent activities.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentActivities.map(activity => (
                    <div key={activity.id} className="p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex gap-3">
                        <div className={cn(
                          "mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                          activity.type === 'sale_closed' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                        )}>
                          {activity.type === 'sale_closed' ? <Trophy className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                        </div>
                        <div className="space-y-1">
                          <p className={cn(
                            "text-sm font-medium",
                            activity.type === 'sale_closed' ? "text-green-700 font-bold block space-y-1" : "text-slate-700"
                          )}>
                            {activity.message}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            {format(activity.timestamp, 'HH:mm:ss')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

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

      {/* Today's Follow Ups Modal */}
      <Dialog open={isFollowUpModalOpen} onOpenChange={setIsFollowUpModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              Today's Follow-ups
            </DialogTitle>
            <DialogDescription>
              You have {todaysFollowUps.length} todays task your follow-up check details for More Information.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 py-4 pr-1">
            {todaysFollowUps.map(lead => (
              <div key={lead.id} className="p-3 border rounded-lg bg-blue-50/50 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-800">{lead.name}</h4>
                    <p className="font-mono text-sm text-slate-600">{lead.phone}</p>
                  </div>
                  {lead.follow_up_time && (
                    <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                      {lead.follow_up_time}
                    </Badge>
                  )}
                </div>
                {lead.notes && <p className="text-xs text-slate-500 italic">Note: {lead.notes}</p>}
                <div className="flex justify-end pt-1 gap-2">
                  <Button variant="outline" size="sm" onClick={() => { 
                    setActiveLead(lead); 
                    setIsHistoryModalOpen(true); 
                    fetchCallHistory(lead.id); 
                  }} className="h-7 text-xs bg-white text-slate-600">
                    <History className="h-3 w-3 mr-1" /> History
                  </Button>
                  <Button size="sm" onClick={() => { setIsFollowUpModalOpen(false); startCall(lead); }} className="h-7 text-xs">
                    <Phone className="h-3 w-3 mr-1" /> Call Now
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsFollowUpModalOpen(false)} className="w-full">Dismiss</Button>
          </DialogFooter>
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
    </div>
  );
};

export default EmployeeDashboard;
