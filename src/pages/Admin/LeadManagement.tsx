import React, { useState, useEffect, useRef } from 'react';
import { supabase, Lead, UserProfile } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Upload, Download, Search, UserPlus, Trash2, Edit, Info, Phone, Clock, FileText, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  'Fresh':         'bg-sky-100 text-sky-700',
  'Not Connected': 'bg-slate-100 text-slate-600',
  'Interested':    'bg-green-100 text-green-700',
  'Not Interested':'bg-orange-100 text-orange-700',
  'Follow-up':     'bg-blue-100 text-blue-700',
  'Complete':      'bg-blue-600 text-white',
};

const TABS = ['All','Fresh','Not Connected','Interested','Not Interested','Follow-up','Complete'] as const;

const LeadManagement: React.FC = () => {
  const [leads, setLeads]         = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterTab, setFilterTab] = useState<string>('All');
  const [empFilter, setEmpFilter] = useState<string>('all');
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  // Modals
  const [isAddOpen,     setIsAddOpen]     = useState(false);
  const [isUploadOpen,  setIsUploadOpen]  = useState(false);
  const [isAssignOpen,  setIsAssignOpen]  = useState(false);
  const [isEditOpen,    setIsEditOpen]    = useState(false);
  const [isDetailOpen,  setIsDetailOpen]  = useState(false);

  // Delete modals
  const [deleteSingleLead,   setDeleteSingleLead]   = useState<Lead | null>(null);
  const [isDeleteSingleOpen, setIsDeleteSingleOpen] = useState(false);
  const [isBulkDeleteOpen,   setIsBulkDeleteOpen]   = useState(false);
  const [bulkDeleteType,     setBulkDeleteType]      = useState<'selection'|'filter'>('selection');
  const [bulkConfirmStep,    setBulkConfirmStep]     = useState<1|2>(1);
  const [bulkConfirmInput,   setBulkConfirmInput]    = useState('');
  const [isDeletingBulk,     setIsDeletingBulk]      = useState(false);

  // Selected lead for detail/edit
  const [activeLead,    setActiveLead]    = useState<Lead | null>(null);
  const [editStatus,    setEditStatus]    = useState('');
  const [editAssigneeId,setEditAssigneeId]= useState('');

  // Add form
  const [newLead, setNewLead] = useState({ name:'', phone:'', matching_number:'', current_operator:'', important: false });
  const [assigneeId, setAssigneeId] = useState('');

  // Upload
  const [uploadFile,   setUploadFile]   = useState<File | null>(null);
  const [isUploading,  setIsUploading]  = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: leadsData, error: leadsError } = await supabase
        .from('leads').select('*').order('created_date', { ascending: false });
      const { data: empData, error: empError } = await supabase
        .from('user_profiles').select('*').eq('is_active', true);
      if (leadsError || empError) throw leadsError || empError;

      const empMap: Record<string,string> = {};
      (empData||[]).forEach((e:any) => { empMap[e.id] = e.name; });
      const enriched = (leadsData||[]).map((l:any) => ({
        ...l,
        assigned_user: l.assigned_to ? { name: empMap[l.assigned_to] || 'Unknown' } : null
      }));
      setLeads(enriched);
      setEmployees(empData || []);
    } catch { toast.error('Failed to fetch data'); }
    finally { setLoading(false); }
  };

  // ── filteredLeads: single source of truth ──────────────────────────────────
  const filteredLeads = leads.filter(l => {
    const matchSearch = l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search);
    const matchTab    = filterTab === 'All' ? true
                      : filterTab === 'Not Connected' ? (l.status === 'Not Connected' || !l.status)
                      : l.status === filterTab;
    const matchEmp    = empFilter === 'all' ? true
                      : empFilter === 'unassigned' ? !l.assigned_to
                      : l.assigned_to === empFilter;
    return matchSearch && matchTab && matchEmp;
  });

  // ── Selection helpers (always scoped to filteredLeads) ────────────────────
  const visibleIds = filteredLeads.map(l => l.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedLeads.includes(id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedLeads(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedLeads(prev => [...new Set([...prev, ...visibleIds])]);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedLeads(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // Only selected leads that are within current filter
  const selectedInView = selectedLeads.filter(id => visibleIds.includes(id));

  // ── Tab counts (based on employee filter, not status filter) ─────────────
  const countForTab = (tab: string) => {
    const base = leads.filter(l => {
      const matchEmp = empFilter === 'all' ? true : empFilter === 'unassigned' ? !l.assigned_to : l.assigned_to === empFilter;
      if (!matchEmp) return false;
      if (tab === 'All') return true;
      if (tab === 'Not Connected') return l.status === 'Not Connected' || !l.status;
      return l.status === tab;
    });
    return base.length;
  };

  // ── ADD LEAD ──────────────────────────────────────────────────────────────
  const handleAddLead = async () => {
    try {
      const { error } = await supabase.from('leads').insert([{ ...newLead, status: 'Fresh' }]);
      if (error) throw error;
      toast.success('Lead added');
      setIsAddOpen(false);
      setNewLead({ name:'', phone:'', matching_number:'', current_operator:'', important: false });
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  // ── UPDATE LEAD (edit) ────────────────────────────────────────────────────
  const handleUpdateLead = async () => {
    if (!activeLead) return;
    try {
      const { error } = await supabase.from('leads').update({
        status: editStatus,
        assigned_to: editAssigneeId === '_unassigned' || !editAssigneeId ? null : editAssigneeId
      }).eq('id', activeLead.id);
      if (error) throw error;
      toast.success('Lead updated');
      setIsEditOpen(false);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const openEdit = (lead: Lead) => {
    setActiveLead(lead);
    setEditStatus(lead.status || 'Fresh');
    setEditAssigneeId(lead.assigned_to || '');
    setIsEditOpen(true);
  };

  const openDetail = (lead: Lead) => {
    setActiveLead(lead);
    setIsDetailOpen(true);
  };

  // ── BULK ASSIGN ───────────────────────────────────────────────────────────
  const handleBulkAssign = async () => {
    if (!assigneeId || selectedInView.length === 0) return;
    try {
      const { error } = await supabase.from('leads')
        .update({ assigned_to: assigneeId }).in('id', selectedInView);
      if (error) throw error;
      toast.success(`${selectedInView.length} leads assigned`);
      setIsAssignOpen(false);
      setSelectedLeads([]);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  // ── DELETE TYPE 1: Single Row ─────────────────────────────────────────────
  const confirmDeleteSingle = (lead: Lead) => { setDeleteSingleLead(lead); setIsDeleteSingleOpen(true); };

  const handleDeleteSingle = async () => {
    if (!deleteSingleLead) return;
    const id = deleteSingleLead.id;
    const name = deleteSingleLead.name;
    try {
      const { error } = await supabase.from('leads').delete().eq('id', id);
      if (error) throw error;
      setIsDeleteSingleOpen(false);
      setDeleteSingleLead(null);
      setSelectedLeads(prev => prev.filter(i => i !== id));
      fetchData();
      toast.success(`"${name}" deleted`, {
        action: { label: 'Undo', onClick: () => toast.info('Undo not available for permanent deletes') },
        duration: 5000
      });
    } catch (e: any) { toast.error(e.message); }
  };

  // ── DELETE TYPE 2 & 3 & 4: Bulk (selection / filter-scoped) ──────────────
  const openBulkDelete = (type: 'selection' | 'filter') => {
    setBulkDeleteType(type);
    setBulkConfirmStep(1);
    setBulkConfirmInput('');
    setIsBulkDeleteOpen(true);
  };

  const bulkDeleteCount = bulkDeleteType === 'selection' ? selectedInView.length : filteredLeads.length;
  const bulkDeleteScope = () => {
    const parts: string[] = [];
    if (empFilter !== 'all') {
      const emp = employees.find(e => e.id === empFilter);
      parts.push(emp ? `assigned to ${emp.name}` : 'Unassigned');
    }
    if (filterTab !== 'All') parts.push(`status: ${filterTab}`);
    return parts.length ? parts.join(', ') : 'all leads';
  };

  const handleBulkDelete = async () => {
    if (bulkConfirmStep === 1) { setBulkConfirmStep(2); return; }
    if (bulkConfirmInput.trim().toUpperCase() !== 'DELETE') {
      toast.error('Type DELETE to confirm'); return;
    }
    setIsDeletingBulk(true);
    try {
      const ids = bulkDeleteType === 'selection' ? selectedInView : filteredLeads.map(l => l.id);
      if (ids.length === 0) { toast.error('Nothing to delete'); return; }
      const { error } = await supabase.from('leads').delete().in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} leads deleted`);
      setIsBulkDeleteOpen(false);
      setSelectedLeads([]);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    finally { setIsDeletingBulk(false); setBulkConfirmInput(''); }
  };

  // ── FILE UPLOAD ───────────────────────────────────────────────────────────
  const handleFileUpload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    try {
      const text = await uploadFile.text();
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim());

      const empNameMap: Record<string, string> = {};
      employees.forEach((e: any) => { if (e.name) empNameMap[e.name.trim().toLowerCase()] = e.id; });

      const mappedLeads = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim());
        const row: any = {};
        headers.forEach((h, i) => { row[h] = vals[i] || ''; });
        const assignedRaw = (row['AssignedTo'] || row['Assigned To'] || row['assigned_to'] || '').trim().toLowerCase();
        return {
          name: row['Name'] || '',
          phone: String(row['Phone'] || ''),
          matching_number: row['MatchingNumber'] || null,
          current_operator: row['CurrentOperator'] || null,
          status: row['Status'] || 'Fresh',
          notes: row['Notes'] || null,
          important: String(row['Important']).toLowerCase() === 'true',
          created_date: row['CreatedDate'] || new Date().toISOString(),
          pending_recall: false,
          assigned_to: assignedRaw ? (empNameMap[assignedRaw] || null) : null,
        };
      }).filter(l => l.name && l.phone);

      if (!mappedLeads.length) { toast.error('No valid leads in file'); return; }
      const { error } = await supabase.from('leads').insert(mappedLeads);
      if (error) throw error;
      toast.success(`${mappedLeads.length} leads uploaded`);
      setIsUploadOpen(false);
      setUploadFile(null);
      fetchData();
    } catch (e: any) { toast.error('Upload failed: ' + e.message); }
    finally { setIsUploading(false); }
  };

  const downloadTemplate = () => {
    const csv = "Name,Phone,MatchingNumber,CurrentOperator,Status,Notes,Important,AssignedTo\n";
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'connect_pro_template.csv'; a.click();
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  const filterScopeLabel = () => {
    const parts: string[] = [];
    if (empFilter !== 'all') {
      const emp = employees.find(e => e.id === empFilter);
      parts.push(emp?.name || 'Unassigned');
    }
    if (filterTab !== 'All') parts.push(filterTab);
    return parts.length ? ` — ${parts.join(' — ')}` : '';
  };

  return (
    <div className="space-y-4">
      {/* ── Top action bar ── */}
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setIsAddOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Lead</Button>
          <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(true)}><Upload className="h-4 w-4 mr-1" /> Bulk Upload</Button>
        </div>
        <div className="flex gap-2 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search leads..." className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {/* Employee filter */}
          <Select value={empFilter} onValueChange={v => { setEmpFilter(v); setSelectedLeads([]); }}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All Employees" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">👥 All Employees</SelectItem>
              <SelectItem value="unassigned">— Unassigned</SelectItem>
              {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Selection action bar ── */}
      {selectedInView.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl flex-wrap">
          <span className="text-sm font-semibold text-blue-700 flex-1">{selectedInView.length} lead{selectedInView.length > 1 ? 's' : ''} selected</span>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setAssigneeId(''); setIsAssignOpen(true); }}>
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Assign
          </Button>
          <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => openBulkDelete('selection')}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Selected ({selectedInView.length})
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-500" onClick={() => setSelectedLeads([])}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {TABS.map(tab => (
          <Button key={tab} variant={filterTab === tab ? 'default' : 'outline'} size="sm"
            onClick={() => { setFilterTab(tab); setSelectedLeads([]); }}
            className={cn("text-xs h-7 px-3", filterTab === tab ? "bg-slate-800 text-white" : "text-slate-600 bg-white")}>
            {tab} ({countForTab(tab)})
          </Button>
        ))}
        {/* Filter-scoped Delete All */}
        {filteredLeads.length > 0 && (filterTab !== 'All' || empFilter !== 'all') && (
          <Button size="sm" variant="outline"
            className="text-xs h-7 px-3 ml-auto border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => openBulkDelete('filter')}>
            <Trash2 className="h-3 w-3 mr-1" /> Delete All Filtered ({filteredLeads.length})
          </Button>
        )}
      </div>

      {/* Showing label */}
      <p className="text-xs text-slate-400">
        Showing <strong>{filteredLeads.length}</strong> leads{filterScopeLabel()}
      </p>

      {/* ── Table ── */}
      <div className="border rounded-xl bg-white shadow-sm overflow-hidden border-slate-200">
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
                <TableHead className="w-10 p-4">
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} className="border-slate-300" />
                </TableHead>
                <TableHead className="p-4 text-[11px] uppercase text-slate-500 font-semibold tracking-wider">Name</TableHead>
                <TableHead className="p-4 text-[11px] uppercase text-slate-500 font-semibold tracking-wider">Phone</TableHead>
                <TableHead className="p-4 text-[11px] uppercase text-slate-500 font-semibold tracking-wider">Status</TableHead>
                <TableHead className="p-4 text-[11px] uppercase text-slate-500 font-semibold tracking-wider">Assigned To</TableHead>
                <TableHead className="p-4 text-[11px] uppercase text-slate-500 font-semibold tracking-wider">Created</TableHead>
                <TableHead className="p-4 text-right text-[11px] uppercase text-slate-500 font-semibold tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-20 text-center text-slate-400">Loading leads...</TableCell></TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-20 text-center text-slate-400">No leads found.</TableCell></TableRow>
              ) : filteredLeads.map(lead => (
                <TableRow key={lead.id} className={cn("hover:bg-slate-50 transition-colors", selectedLeads.includes(lead.id) && "bg-blue-50/40")}>
                  <TableCell className="p-4">
                    <Checkbox checked={selectedLeads.includes(lead.id)} onCheckedChange={() => toggleSelect(lead.id)} className="border-slate-300" />
                  </TableCell>
                  <TableCell className="p-4 font-medium text-slate-900">
                    <button className="flex items-center gap-2 hover:text-blue-600 transition-colors text-left group"
                      onClick={() => openDetail(lead)}>
                      <Info className="h-3.5 w-3.5 text-slate-300 group-hover:text-blue-500 shrink-0" />
                      <span>{lead.name}</span>
                      {lead.important && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />}
                    </button>
                  </TableCell>
                  <TableCell className="p-4 text-slate-600 font-mono text-xs">{lead.phone}</TableCell>
                  <TableCell className="p-4">
                    <span className={cn("px-2 py-1 text-[10px] font-bold rounded-full uppercase", STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600')}>
                      {lead.status || 'Fresh'}
                    </span>
                  </TableCell>
                  <TableCell className="p-4 text-slate-600 text-sm italic">
                    {lead.assigned_user?.name || <span className="text-slate-400 not-italic">Unassigned</span>}
                  </TableCell>
                  <TableCell className="p-4 text-xs text-slate-400">
                    {lead.created_date ? format(new Date(lead.created_date), 'dd MMM yyyy') : '—'}
                  </TableCell>
                  <TableCell className="p-4 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" onClick={() => openEdit(lead)}>
                        <Edit className="h-4 w-4 text-slate-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:bg-red-50" onClick={() => confirmDeleteSingle(lead)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredLeads.map(lead => (
            <div key={lead.id} className="p-4 flex items-start gap-3">
              <Checkbox checked={selectedLeads.includes(lead.id)} onCheckedChange={() => toggleSelect(lead.id)} className="border-slate-300 mt-1" />
              <div className="flex-1 space-y-1" onClick={() => openDetail(lead)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    {lead.name}
                    {lead.important && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                  </span>
                  <span className={cn("px-2 py-0.5 text-[9px] font-bold rounded-full uppercase", STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600')}>
                    {lead.status || 'Fresh'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono">{lead.phone}</p>
                <p className="text-[10px] text-slate-400">Assigned: {lead.assigned_user?.name || 'Unassigned'}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(lead)}><Edit className="h-3.5 w-3.5 text-slate-500" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => confirmDeleteSingle(lead)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════ */}

      {/* ── Lead Detail Modal ── */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden">
          <DialogHeader className="bg-slate-900 text-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-xl font-bold">{activeLead?.name}</DialogTitle>
                <DialogDescription className="text-slate-400 font-mono mt-1">{activeLead?.phone}</DialogDescription>
              </div>
              <span className={cn("px-3 py-1 text-xs font-bold rounded-full uppercase mt-1", STATUS_COLORS[activeLead?.status || ''] || 'bg-slate-700 text-white')}>
                {activeLead?.status || 'Fresh'}
              </span>
            </div>
          </DialogHeader>
          <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Matching Number</p>
                <p className="text-sm bg-slate-50 border rounded p-2 font-mono">{activeLead?.matching_number || '—'}</p></div>
              <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Operator</p>
                <p className="text-sm bg-slate-50 border rounded p-2">{activeLead?.current_operator || '—'}</p></div>
              <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Assigned To</p>
                <p className="text-sm bg-slate-50 border rounded p-2 font-semibold text-blue-700">{activeLead?.assigned_user?.name || 'Unassigned'}</p></div>
              <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Created</p>
                <p className="text-sm bg-slate-50 border rounded p-2">{activeLead?.created_date ? format(new Date(activeLead.created_date), 'dd MMM yyyy') : '—'}</p></div>
              <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Last Call</p>
                <p className="text-sm bg-slate-50 border rounded p-2">{activeLead?.last_call_date ? format(new Date(activeLead.last_call_date), 'HH:mm dd/MM/yy') : '—'}</p></div>
              <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Call Duration</p>
                <p className="text-sm bg-slate-50 border rounded p-2">{activeLead?.last_call_duration || 0}s</p></div>
            </div>
            {activeLead?.follow_up_date && (
              <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Clock className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-amber-700 uppercase">Follow-up Scheduled</p>
                  <p className="text-sm font-bold text-amber-900">{format(new Date(activeLead.follow_up_date), 'PPP')} — {activeLead.follow_up_time || ''}</p>
                </div>
              </div>
            )}
            {activeLead?.notes && (
              <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Notes</p>
                <div className="text-sm text-slate-700 bg-slate-50 border rounded p-3 min-h-[60px] whitespace-pre-wrap">{activeLead.notes}</div></div>
            )}
            <div className="flex gap-2 flex-wrap">
              {activeLead?.important && <Badge variant="destructive" className="text-xs">⭐ Important</Badge>}
              {activeLead?.pending_recall && <Badge variant="outline" className="text-xs text-red-600 border-red-300">🔁 Pending Recall</Badge>}
            </div>
          </div>
          <div className="p-4 border-t bg-slate-50 flex gap-2">
            <Button className="flex-1" onClick={() => { setIsDetailOpen(false); openEdit(activeLead!); }}>
              <Edit className="h-4 w-4 mr-2" /> Edit Lead
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setIsDetailOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Single Confirm ── */}
      <Dialog open={isDeleteSingleOpen} onOpenChange={setIsDeleteSingleOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete Lead
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <p className="text-slate-700 text-sm">Delete this lead permanently?</p>
            <div className="mt-3 p-3 bg-slate-50 rounded-lg border">
              <p className="font-bold text-slate-900">{deleteSingleLead?.name}</p>
              <p className="text-xs text-slate-500 font-mono">{deleteSingleLead?.phone}</p>
            </div>
            <p className="text-xs text-slate-400 mt-2">This action cannot be undone.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteSingleOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSingle}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Delete Modal (Selection + Filter-scoped) ── */}
      <Dialog open={isBulkDeleteOpen} onOpenChange={v => { if (!isDeletingBulk) { setIsBulkDeleteOpen(v); setBulkConfirmStep(1); setBulkConfirmInput(''); }}}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {bulkConfirmStep === 1 ? `Delete ${bulkDeleteCount} Leads` : 'Confirm Deletion'}
            </DialogTitle>
          </DialogHeader>
          {bulkConfirmStep === 1 ? (
            <div className="py-3 space-y-3">
              <p className="text-slate-700 text-sm">
                You are about to delete <strong className="text-red-600">{bulkDeleteCount} leads</strong>
                {bulkDeleteType === 'filter' && bulkDeleteScope() !== 'all leads' && (
                  <span className="text-slate-500"> ({bulkDeleteScope()})</span>
                )}.
              </p>
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-xs text-red-700 font-semibold">⚠️ This cannot be undone. All deleted leads will be permanently removed.</p>
              </div>
            </div>
          ) : (
            <div className="py-3 space-y-3">
              <p className="text-sm text-slate-700">Type <strong>DELETE</strong> to confirm deleting <strong className="text-red-600">{bulkDeleteCount} leads</strong>:</p>
              <Input
                placeholder="Type DELETE here"
                value={bulkConfirmInput}
                onChange={e => setBulkConfirmInput(e.target.value)}
                className="font-mono tracking-widest"
                autoFocus
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsBulkDeleteOpen(false); setBulkConfirmStep(1); setBulkConfirmInput(''); }}
              disabled={isDeletingBulk}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isDeletingBulk ||
              (bulkConfirmStep === 2 && bulkConfirmInput.trim().toUpperCase() !== 'DELETE')}>
              {isDeletingBulk ? 'Deleting...' : bulkConfirmStep === 1 ? 'Continue →' : `Delete ${bulkDeleteCount} Leads`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Lead Modal ── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Lead</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium">Name *</label>
                <Input value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Phone *</label>
                <Input value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium">Matching Number</label>
                <Input value={newLead.matching_number} onChange={e => setNewLead({...newLead, matching_number: e.target.value})} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Operator</label>
                <Input value={newLead.current_operator} onChange={e => setNewLead({...newLead, current_operator: e.target.value})} /></div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="imp" checked={newLead.important} onCheckedChange={c => setNewLead({...newLead, important: !!c})} />
              <label htmlFor="imp" className="text-sm font-medium">Mark as Important</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLead} disabled={!newLead.name || !newLead.phone}>Add Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Upload Modal ── */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Upload Leads (CSV)</DialogTitle>
            <DialogDescription>Columns: Name, Phone, MatchingNumber, CurrentOperator, Status, Notes, Important, AssignedTo (employee name)</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => document.getElementById('file-upload')?.click()}>
              <Upload className="h-10 w-10 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">{uploadFile ? uploadFile.name : 'Click to upload CSV file'}</p>
              <input id="file-upload" type="file" className="hidden" accept=".csv" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
            </div>
            <Button variant="link" className="w-full text-xs" onClick={downloadTemplate}>
              <Download className="h-3 w-3 mr-1" /> Download CSV Template
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleFileUpload} disabled={!uploadFile || isUploading}>
              {isUploading ? 'Uploading...' : 'Upload Leads'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Modal ── */}
      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign {selectedInView.length} Leads</DialogTitle></DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Choose Employee</label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger><SelectValue placeholder="Select an employee" /></SelectTrigger>
              <SelectContent>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={!assigneeId}>Assign Now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Lead Modal ── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Lead — {activeLead?.name}</DialogTitle>
            <DialogDescription className="font-mono text-xs">{activeLead?.phone}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><label className="text-sm font-medium">Status</label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                <SelectContent>
                  {['Fresh','Not Connected','Not Interested','Interested','Follow-up','Complete'].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Assigned Employee</label>
              <Select value={editAssigneeId || '_unassigned'} onValueChange={setEditAssigneeId}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_unassigned">— Unassigned</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateLead}>Update Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeadManagement;
