import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, Phone, User, Pencil, Wifi, AlertTriangle, MapPin, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO, isToday, isBefore, startOfDay } from 'date-fns';

const ALL_STATUSES = ['Fresh', 'Not Connected', 'Not Interested', 'Interested', 'Follow-up', 'Complete'];
const TIME_ORDER: Record<string, number> = { Morning: 0, Afternoon: 1, 'Lunch-2nd Half': 2, Evening: 3 };

interface LeadRow {
  id: string;
  name: string;
  phone: string;
  current_operator?: string;
  matching_number?: string;
  notes?: string;
  location_link?: string;
  status: string;
  assigned_to?: string;
  follow_up_date?: string;
  follow_up_time?: string;
}

const FollowUpsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [empFilter, setEmpFilter] = useState('all');

  const [editTarget, setEditTarget] = useState<LeadRow | null>(null);
  const [editForm, setEditForm] = useState({ status: '', follow_up_date: '', follow_up_time: '', notes: '', assigned_to: '', location_link: '' });
  const [saving, setSaving] = useState(false);

  const userMap = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e.name])), [employees]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [leadRes, empRes] = await Promise.all([
        supabase.from('leads').select('*').eq('status', 'Follow-up').order('follow_up_date', { ascending: true }),
        supabase.from('user_profiles').select('id,name').eq('is_active', true),
      ]);
      setLeads(leadRes.data || []);
      setEmployees(empRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load follow-ups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(
    () => leads.filter(l => empFilter === 'all' || l.assigned_to === empFilter),
    [leads, empFilter]
  );

  // Sort by date asc, then by the follow-up time-slot order (Morning → Evening) — soonest first
  const sortRows = (rows: LeadRow[]) => [...rows].sort((a, b) => {
    const d = (a.follow_up_date || '').localeCompare(b.follow_up_date || '');
    if (d !== 0) return d;
    return (TIME_ORDER[a.follow_up_time || ''] ?? 99) - (TIME_ORDER[b.follow_up_time || ''] ?? 99);
  });

  const today = startOfDay(new Date());
  const overdue = sortRows(filtered.filter(l => l.follow_up_date && isBefore(parseISO(l.follow_up_date), today)));
  const todayRows = sortRows(filtered.filter(l => l.follow_up_date && isToday(parseISO(l.follow_up_date))));
  const upcoming = sortRows(filtered.filter(l => l.follow_up_date && isBefore(today, parseISO(l.follow_up_date))));

  const shareLead = async (lead: LeadRow) => {
    const lines = [
      `Customer: ${lead.name}`,
      `Phone: ${lead.phone}`,
    ];
    if (lead.current_operator) lines.push(`Operator: ${lead.current_operator}${lead.matching_number ? ' ' + lead.matching_number : ''}`);
    lines.push(`Assigned To: ${userMap[lead.assigned_to || ''] || 'Unassigned'}`);
    if (lead.follow_up_date) lines.push(`Follow-up: ${format(parseISO(lead.follow_up_date), 'dd MMM yyyy')} (${lead.follow_up_time || 'No slot'})`);
    lines.push(`Notes: ${lead.notes || 'No notes'}`);
    if (lead.location_link) lines.push(`Location: ${lead.location_link}`);

    const text = lines.join('\n');

    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* user cancelled share */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const openEdit = (lead: LeadRow) => {
    setEditTarget(lead);
    setEditForm({
      status: lead.status,
      follow_up_date: lead.follow_up_date || '',
      follow_up_time: lead.follow_up_time || '',
      notes: lead.notes || '',
      assigned_to: lead.assigned_to || '',
      location_link: lead.location_link || '',
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (editForm.location_link.trim() && !/^https?:\/\//i.test(editForm.location_link.trim())) {
      toast.error('Location link http:// ya https:// se shuru hona chahiye'); return;
    }
    setSaving(true);
    try {
      const payload: any = {
        status: editForm.status,
        notes: editForm.notes.trim() || null,
        assigned_to: editForm.assigned_to || null,
        location_link: editForm.location_link.trim() || null,
        follow_up_date: editForm.status === 'Follow-up' ? (editForm.follow_up_date || null) : null,
        follow_up_time: editForm.status === 'Follow-up' ? (editForm.follow_up_time || null) : null,
      };
      const { error } = await supabase.from('leads').update(payload).eq('id', editTarget.id);
      if (error) throw error;
      toast.success('Follow-up updated');
      setEditTarget(null);
      fetchAll();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const LeadCard: React.FC<{ lead: LeadRow; overdueFlag?: boolean }> = ({ lead, overdueFlag }) => (
    <div className={cn(
      "bg-white rounded-xl border p-4 shadow-sm space-y-2",
      overdueFlag ? "border-red-200" : "border-slate-200"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 text-sm">{lead.name}</p>
            {overdueFlag && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-red-100 text-red-700">Overdue</span>
            )}
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
            <Phone className="h-3 w-3" /> {lead.phone}
            {lead.current_operator && <span className="flex items-center gap-1 ml-2"><Wifi className="h-3 w-3" /> {lead.current_operator} {lead.matching_number || ''}</span>}
          </p>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
            <User className="h-3 w-3" /> {userMap[lead.assigned_to || ''] || 'Unassigned'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {lead.location_link && (
            <Button
              size="sm" variant="ghost"
              className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
              title="Open location"
              onClick={() => window.open(lead.location_link, '_blank', 'noopener,noreferrer')}
            >
              <MapPin className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-green-600 hover:bg-green-50" title="Share" onClick={() => shareLead(lead)}>
            <Share2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-500 hover:bg-slate-100" title="Edit" onClick={() => openEdit(lead)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 w-fit">
        <CalendarClock className="h-3.5 w-3.5" />
        {lead.follow_up_date ? format(parseISO(lead.follow_up_date), 'dd MMM yyyy') : '—'} • {lead.follow_up_time || 'No slot'}
      </div>

      {/* Notes always visible on this page, not hidden behind another click */}
      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
        <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Notes</p>
        <p className="text-xs text-slate-700 whitespace-pre-wrap">{lead.notes || 'No notes'}</p>
      </div>
    </div>
  );

  const Section = ({ title, rows, overdueFlag }: { title: string; rows: LeadRow[]; overdueFlag?: boolean }) => (
    <div className="space-y-3">
      <h3 className={cn("text-sm font-bold uppercase tracking-wide", overdueFlag ? "text-red-600" : "text-slate-600")}>
        {title} <span className="text-slate-400 font-normal">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 pb-2">No entries</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(l => <LeadCard key={l.id} lead={l} overdueFlag={overdueFlag} />)}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
            <CalendarClock className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Follow-ups</h2>
            <p className="text-sm text-slate-500">All employees' follow-ups, in one place — the soonest one first</p>
          </div>
        </div>
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-slate-400 text-sm bg-white rounded-xl border border-slate-200">No follow-ups found</div>
      ) : (
        <div className="space-y-8">
          {overdue.length > 0 && <Section title="Overdue" rows={overdue} overdueFlag />}
          <Section title="Today" rows={todayRows} />
          <Section title="Upcoming" rows={upcoming} />
        </div>
      )}

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Follow-up — {editTarget?.name}</DialogTitle>
            <DialogDescription className="font-mono text-xs">{editTarget?.phone}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Status</label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {editForm.status === 'Follow-up' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Follow-up Date</label>
                  <Input type="date" value={editForm.follow_up_date} onChange={(e) => setEditForm({ ...editForm, follow_up_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Follow-up Time</label>
                  <Select value={editForm.follow_up_time} onValueChange={(v) => setEditForm({ ...editForm, follow_up_time: v })}>
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
            )}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Assigned To</label>
              <Select value={editForm.assigned_to || '_unassigned'} onValueChange={(v) => setEditForm({ ...editForm, assigned_to: v === '_unassigned' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_unassigned">— Unassigned</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Notes</label>
              <textarea
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Write notes..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block flex items-center gap-1"><MapPin className="h-3 w-3" /> Customer Location (Google Maps link)</label>
              <Input
                value={editForm.location_link}
                onChange={(e) => setEditForm({ ...editForm, location_link: e.target.value })}
                placeholder="https://maps.google.com/?q=..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FollowUpsPage;
