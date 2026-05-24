import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Upload, Download, Search, UserPlus, Trash2, Edit, Info, Clock, X, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

const STATUS_COLORS: Record<string, string> = {
  'Fresh':          'bg-sky-100 text-sky-700',
  'Not Connected':  'bg-slate-100 text-slate-600',
  'Interested':     'bg-green-100 text-green-700',
  'Not Interested': 'bg-orange-100 text-orange-700',
  'Follow-up':      'bg-blue-100 text-blue-700',
  'Complete':       'bg-emerald-600 text-white',
};

const TABS = ['All','Fresh','Not Connected','Interested','Not Interested','Follow-up','Complete'] as const;
const ALL_STATUSES = ['Fresh','Not Connected','Not Interested','Interested','Follow-up','Complete'];

// ── Isolated Add Lead Form (no re-render of parent table) ────────────────────
const AddLeadForm: React.FC<{ employees: any[]; onClose: () => void; onSuccess: () => void }> = ({ employees, onClose, onSuccess }) => {
  const [form, setForm] = useState({ name:'', phone:'', matching_number:'', current_operator:'', important: false, assigned_to: '' });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleAdd = async () => {
    if (!form.name.trim() || !form.phone.trim()) { toast.error('Name and Phone required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('leads').insert([{
        name: form.name.trim(),
        phone: form.phone.trim(),
        matching_number: form.matching_number || null,
        current_operator: form.current_operator || null,
        important: form.important,
        assigned_to: form.assigned_to || null,
        status: 'Fresh',
        created_date: new Date().toISOString(),
      }]);
      if (error) throw error;
      toast.success('Lead added');
      onSuccess();
      onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <DialogHeader><DialogTitle>Add New Lead</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3 py-4">
        <div><label className="text-xs font-medium text-slate-600 mb-1 block">Name *</label>
          <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Customer name" autoFocus /></div>
        <div><label className="text-xs font-medium text-slate-600 mb-1 block">Phone *</label>
          <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone number" /></div>
        <div><label className="text-xs font-medium text-slate-600 mb-1 block">Matching Number</label>
          <Input value={form.matching_number} onChange={e => set('matching_number', e.target.value)} /></div>
        <div><label className="text-xs font-medium text-slate-600 mb-1 block">Operator</label>
          <Input value={form.current_operator} onChange={e => set('current_operator', e.target.value)} /></div>
        <div className="col-span-2"><label className="text-xs font-medium text-slate-600 mb-1 block">Assign To</label>
          <Select value={form.assigned_to} onValueChange={v => set('assigned_to', v)}>
            <SelectTrigger><SelectValue placeholder="Leave unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— Unassigned</SelectItem>
              {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select></div>
        <div className="col-span-2 flex items-center gap-2">
          <Checkbox id="imp" checked={form.important} onCheckedChange={v => set('important', !!v)} />
          <label htmlFor="imp" className="text-sm text-slate-700">Mark as Important</label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleAdd} disabled={saving}>{saving ? 'Adding...' : 'Add Lead'}</Button>
      </DialogFooter>
    </>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const LeadManagement: React.FC = () => {
  const [leads, setLeads]         = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [searchRaw, setSearchRaw] = useState('');
  const [search, setSearch]       = useState('');
  const [filterTab, setFilterTab] = useState('All');
  const [empFilter, setEmpFilter] = useState('all');
  const [page, setPage]           = useState(1);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const searchTimer = useRef<any>(null);

  // Modals
  const [isAddOpen,          setIsAddOpen]          = useState(false);
  const [isUploadOpen,       setIsUploadOpen]        = useState(false);
  const [isAssignOpen,       setIsAssignOpen]        = useState(false);
  const [isEditOpen,         setIsEditOpen]          = useState(false);
  const [isDetailOpen,       setIsDetailOpen]        = useState(false);
  const [isDeleteSingleOpen, setIsDeleteSingleOpen]  = useState(false);
  const [isBulkDeleteOpen,   setIsBulkDeleteOpen]    = useState(false);

  const [activeLead,       setActiveLead]       = useState<any>(null);
  const [editStatus,       setEditStatus]       = useState('');
  const [editAssigneeId,   setEditAssigneeId]   = useState('');
  const [assigneeId,       setAssigneeId]       = useState('');
  const [deleteSingleLead, setDeleteSingleLead] = useState<any>(null);
  const [bulkDeleteType,   setBulkDeleteType]   = useState<'selection'|'filter'>('selection');
  const [bulkStep,         setBulkStep]         = useState<1|2>(1);
  const [bulkInput,        setBulkInput]        = useState('');
  const [uploadFile,       setUploadFile]       = useState<File|null>(null);
  const [isUploading,      setIsUploading]      = useState(false);
  const [isDeleting,       setIsDeleting]       = useState(false);

  // Debounced search
  const handleSearchChange = useCallback((v: string) => {
    setSearchRaw(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(v); setPage(1); }, 300);
  }, []);

  useEffect(() => { fetchData(); }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: leadsData }, { data: empData }] = await Promise.all([
        supabase.from('leads').select('*').order('created_date', { ascending: false }),
        supabase.from('user_profiles').select('id,name,role').eq('is_active', true),
      ]);
      const empMap: Record<string,string> = {};
      (empData||[]).forEach((e:any) => { empMap[e.id] = e.name; });
      setLeads((leadsData||[]).map((l:any) => ({ ...l, _empName: empMap[l.assigned_to] || '' })));
      setEmployees(empData || []);
    } catch { toast.error('Failed to fetch'); }
    finally { setLoading(false); }
  }, []);

  // ── Memoized filtered + paginated ─────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    const sl = search.toLowerCase();
    return leads.filter(l => {
      if (sl && !l.name.toLowerCase().includes(sl) && !l.phone.includes(search)) return false;
      if (empFilter === 'unassigned' && l.assigned_to) return false;
      if (empFilter !== 'all' && empFilter !== 'unassigned' && l.assigned_to !== empFilter) return false;
      if (filterTab === 'All') return true;
      if (filterTab === 'Not Connected') return l.status === 'Not Connected' || !l.status;
      return l.status === filterTab;
    });
  }, [leads, search, filterTab, empFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const pagedLeads = useMemo(() =>
    filteredLeads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredLeads, page]
  );

  // Reset page when filter changes
  useEffect(() => { setPage(1); setSelectedLeads([]); }, [filterTab, empFilter, search]);

  // Tab counts
  const tabCount = useMemo(() => {
    const base = empFilter === 'all' ? leads :
                 empFilter === 'unassigned' ? leads.filter(l => !l.assigned_to) :
                 leads.filter(l => l.assigned_to === empFilter);
    const out: Record<string, number> = { All: base.length };
    TABS.forEach(t => {
      if (t === 'All') return;
      out[t] = t === 'Not Connected' ? base.filter(l => l.status === 'Not Connected' || !l.status).length
             : base.filter(l => l.status === t).length;
    });
    return out;
  }, [leads, empFilter]);

  // ── Selection (always scoped to filteredLeads) ────────────────────────────
  const visibleIds = useMemo(() => pagedLeads.map(l => l.id), [pagedLeads]);
  const allPageSelected = visibleIds.length > 0 && visibleIds.every(id => selectedLeads.includes(id));
  const selectedInView = useMemo(() => selectedLeads.filter(id => filteredLeads.some(l => l.id === id)), [selectedLeads, filteredLeads]);

  const toggleSelectAll = useCallback(() => {
    if (allPageSelected) setSelectedLeads(p => p.filter(id => !visibleIds.includes(id)));
    else setSelectedLeads(p => [...new Set([...p, ...visibleIds])]);
  }, [allPageSelected, visibleIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedLeads(p => p.includes(id) ? p.filter(i => i !== id) : [...p, id]);
  }, []);

  // ── Scope label ──────────────────────────────────────────────────────────
  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (empFilter !== 'all') { const e = employees.find(e => e.id === empFilter); parts.push(e?.name || 'Unassigned'); }
    if (filterTab !== 'All') parts.push(filterTab);
    return parts.length ? ` — ${parts.join(' — ')}` : '';
  }, [empFilter, filterTab, employees]);

  // ── Edit ─────────────────────────────────────────────────────────────────
  const openEdit = useCallback((lead: any) => {
    setActiveLead(lead);
    setEditStatus(lead.status || 'Fresh');
    setEditAssigneeId(lead.assigned_to || '');
    setIsEditOpen(true);
  }, []);

  const openDetail = useCallback((lead: any) => {
    setActiveLead(lead);
    setIsDetailOpen(true);
  }, []);

  const handleUpdateLead = async () => {
    if (!activeLead) return;
    try {
      const { error } = await supabase.from('leads').update({
        status: editStatus,
        assigned_to: editAssigneeId === '_unassigned' || !editAssigneeId ? null : editAssigneeId,
      }).eq('id', activeLead.id);
      if (error) throw error;
      toast.success('Lead updated');
      setIsEditOpen(false);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Assign ───────────────────────────────────────────────────────────────
  const handleBulkAssign = async () => {
    if (!assigneeId || selectedInView.length === 0) return;
    try {
      const { error } = await supabase.from('leads').update({ assigned_to: assigneeId }).in('id', selectedInView);
      if (error) throw error;
      toast.success(`${selectedInView.length} leads assigned`);
      setIsAssignOpen(false);
      setSelectedLeads([]);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Delete Single ────────────────────────────────────────────────────────
  const handleDeleteSingle = async () => {
    if (!deleteSingleLead) return;
    try {
      const { error } = await supabase.from('leads').delete().eq('id', deleteSingleLead.id);
      if (error) throw error;
      setIsDeleteSingleOpen(false);
      setSelectedLeads(p => p.filter(i => i !== deleteSingleLead.id));
      toast.success(`"${deleteSingleLead.name}" deleted`);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Bulk Delete ──────────────────────────────────────────────────────────
  const bulkDeleteCount = bulkDeleteType === 'selection' ? selectedInView.length : filteredLeads.length;

  const handleBulkDelete = async () => {
    if (bulkStep === 1) { setBulkStep(2); return; }
    if (bulkInput.trim().toUpperCase() !== 'DELETE') { toast.error('Type DELETE to confirm'); return; }
    setIsDeleting(true);
    try {
      const ids = bulkDeleteType === 'selection' ? selectedInView : filteredLeads.map(l => l.id);
      const { error } = await supabase.from('leads').delete().in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} leads deleted`);
      setIsBulkDeleteOpen(false);
      setSelectedLeads([]);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    finally { setIsDeleting(false); setBulkInput(''); setBulkStep(1); }
  };

  // ── Upload ───────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    try {
      const text = await uploadFile.text();
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      const empNameMap: Record<string,string> = {};
      employees.forEach((e:any) => { if (e.name) empNameMap[e.name.trim().toLowerCase()] = e.id; });

      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim());
        const row: any = {};
        headers.forEach((h, i) => { row[h] = vals[i] || ''; });
        const assignedRaw = (row['AssignedTo'] || row['Assigned To'] || '').trim().toLowerCase();
        return {
          name: row['Name'] || '',
          phone: String(row['Phone'] || ''),
          matching_number: row['MatchingNumber'] || null,
          current_operator: row['CurrentOperator'] || null,
          status: row['Status'] || 'Fresh',
          notes: row['Notes'] || null,
          important: row['Important']?.toLowerCase() === 'true',
          created_date: new Date().toISOString(),
          assigned_to: assignedRaw ? (empNameMap[assignedRaw] || null) : null,
        };
      }).filter(l => l.name && l.phone);

      if (!rows.length) { toast.error('No valid leads found'); return; }
      const { error } = await supabase.from('leads').insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} leads uploaded`);
      setIsUploadOpen(false);
      setUploadFile(null);
      fetchData();
    } catch (e: any) { toast.error('Upload failed: ' + e.message); }
    finally { setIsUploading(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setIsAddOpen(true)}><Plus className="h-4 w-4 mr-1" />Add Lead</Button>
          <Button size="sm" variant="outline" onClick={() => setIsUploadOpen(true)}><Upload className="h-4 w-4 mr-1" />Upload</Button>
        </div>
        <div className="flex gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 h-9 text-sm" placeholder="Search name or phone..."
              value={searchRaw} onChange={e => handleSearchChange(e.target.value)} />
          </div>
          <Select value={empFilter} onValueChange={v => { setEmpFilter(v); }}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="All Employees" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">👥 All</SelectItem>
              <SelectItem value="unassigned">— Unassigned</SelectItem>
              {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Selection action bar */}
      {selectedInView.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg flex-wrap">
          <span className="text-sm font-semibold text-blue-700 flex-1">{selectedInView.length} selected</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAssigneeId(''); setIsAssignOpen(true); }}>
            <UserPlus className="h-3 w-3 mr-1" />Assign
          </Button>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { setBulkDeleteType('selection'); setBulkStep(1); setBulkInput(''); setIsBulkDeleteOpen(true); }}>
            <Trash2 className="h-3 w-3 mr-1" />Delete ({selectedInView.length})
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelectedLeads([])}><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {TABS.map(tab => (
          <button key={tab}
            onClick={() => setFilterTab(tab)}
            className={cn("text-xs h-7 px-3 rounded-full font-medium border transition-colors",
              filterTab === tab ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            )}>
            {tab} ({tabCount[tab] ?? 0})
          </button>
        ))}
        {(filterTab !== 'All' || empFilter !== 'all') && filteredLeads.length > 0 && (
          <button onClick={() => { setBulkDeleteType('filter'); setBulkStep(1); setBulkInput(''); setIsBulkDeleteOpen(true); }}
            className="text-xs h-7 px-3 rounded-full border border-red-200 text-red-600 hover:bg-red-50 ml-auto transition-colors">
            <Trash2 className="h-3 w-3 inline mr-1" />Delete All ({filteredLeads.length})
          </button>
        )}
      </div>

      {/* Count + pagination info */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Showing <strong className="text-slate-600">{filteredLeads.length}</strong> leads{scopeLabel}</span>
        {totalPages > 1 && <span>Page {page} of {totalPages}</span>}
      </div>

      {/* Table */}
      <div className="border rounded-xl bg-white overflow-hidden border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 border-b border-slate-200">
                <TableHead className="w-10 pl-4">
                  <Checkbox checked={allPageSelected} onCheckedChange={toggleSelectAll} className="border-slate-300" />
                </TableHead>
                <TableHead className="text-[11px] uppercase text-slate-500 font-semibold">Name</TableHead>
                <TableHead className="text-[11px] uppercase text-slate-500 font-semibold">Phone</TableHead>
                <TableHead className="text-[11px] uppercase text-slate-500 font-semibold">Status</TableHead>
                <TableHead className="text-[11px] uppercase text-slate-500 font-semibold">Assigned</TableHead>
                <TableHead className="text-[11px] uppercase text-slate-500 font-semibold">Date</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-slate-500 font-semibold pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-slate-100 rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : pagedLeads.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-16 text-center text-slate-400">No leads found</TableCell></TableRow>
              ) : pagedLeads.map(lead => (
                <TableRow key={lead.id} className={cn("hover:bg-slate-50/70 transition-colors", selectedLeads.includes(lead.id) && "bg-blue-50/30")}>
                  <TableCell className="pl-4 w-10">
                    <Checkbox checked={selectedLeads.includes(lead.id)} onCheckedChange={() => toggleSelect(lead.id)} className="border-slate-300" />
                  </TableCell>
                  <TableCell className="font-medium">
                    <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors text-left group" onClick={() => openDetail(lead)}>
                      <Info className="h-3.5 w-3.5 text-slate-300 group-hover:text-blue-400 shrink-0" />
                      <span>{lead.name}</span>
                      {lead.important && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{lead.phone}</TableCell>
                  <TableCell>
                    <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full uppercase", STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600')}>
                      {lead.status || 'Fresh'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 italic">{lead._empName || <span className="text-slate-400 not-italic text-xs">—</span>}</TableCell>
                  <TableCell className="text-xs text-slate-400">
                    {lead.created_date ? format(new Date(lead.created_date), 'dd/MM/yy') : '—'}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-slate-100" onClick={() => openEdit(lead)}>
                        <Edit className="h-3.5 w-3.5 text-slate-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => { setDeleteSingleLead(lead); setIsDeleteSingleOpen(true); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />Prev
            </Button>
            <div className="flex gap-1">
              {[...Array(Math.min(totalPages, 7))].map((_, i) => {
                const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn("w-7 h-7 rounded text-xs font-medium transition-colors",
                      page === p ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100")}>
                    {p}
                  </button>
                );
              })}
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              Next<ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        )}
      </div>

      {/* ═══ MODALS ═══ */}

      {/* Add Lead */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[480px]">
          {isAddOpen && <AddLeadForm employees={employees} onClose={() => setIsAddOpen(false)} onSuccess={fetchData} />}
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden">
          <div className="bg-slate-900 text-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{activeLead?.name}</h2>
                <p className="text-slate-400 font-mono text-sm mt-0.5">{activeLead?.phone}</p>
              </div>
              <span className={cn("px-2.5 py-1 text-[10px] font-bold rounded-full uppercase shrink-0 mt-0.5", STATUS_COLORS[activeLead?.status] || 'bg-slate-700 text-slate-300')}>
                {activeLead?.status || 'Fresh'}
              </span>
            </div>
          </div>
          <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Matching No.', activeLead?.matching_number || '—'],
                ['Operator', activeLead?.current_operator || '—'],
                ['Assigned To', activeLead?._empName || 'Unassigned'],
                ['Created', activeLead?.created_date ? format(new Date(activeLead.created_date), 'dd MMM yyyy') : '—'],
                ['Last Call', activeLead?.last_call_date ? format(new Date(activeLead.last_call_date), 'HH:mm dd/MM/yy') : '—'],
                ['Duration', `${activeLead?.last_call_duration || 0}s`],
              ].map(([label, value]) => (
                <div key={label as string} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">{label}</p>
                  <p className="text-sm font-medium text-slate-800 truncate">{value}</p>
                </div>
              ))}
            </div>
            {activeLead?.follow_up_date && (
              <div className="flex items-center gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-amber-700 uppercase">Follow-up</p>
                  <p className="text-sm font-bold text-amber-900">{format(new Date(activeLead.follow_up_date), 'PPP')} {activeLead.follow_up_time || ''}</p>
                </div>
              </div>
            )}
            {activeLead?.notes && (
              <div className="bg-slate-50 border rounded-lg p-3">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Notes</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{activeLead.notes}</p>
              </div>
            )}
          </div>
          <div className="p-4 border-t bg-slate-50 flex gap-2">
            <Button className="flex-1" size="sm" onClick={() => { setIsDetailOpen(false); openEdit(activeLead); }}>
              <Edit className="h-3.5 w-3.5 mr-1.5" />Edit Lead
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setIsDetailOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Single */}
      <Dialog open={isDeleteSingleOpen} onOpenChange={setIsDeleteSingleOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="h-4 w-4" />Delete Lead</DialogTitle></DialogHeader>
          <div className="py-3">
            <div className="p-3 bg-slate-50 rounded-lg border mb-3">
              <p className="font-bold text-slate-900">{deleteSingleLead?.name}</p>
              <p className="text-xs text-slate-500 font-mono">{deleteSingleLead?.phone}</p>
            </div>
            <p className="text-xs text-slate-500">This action cannot be undone.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteSingleOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSingle}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete */}
      <Dialog open={isBulkDeleteOpen} onOpenChange={v => { if (!isDeleting) { setIsBulkDeleteOpen(v); setBulkStep(1); setBulkInput(''); }}}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {bulkStep === 1 ? `Delete ${bulkDeleteCount} leads?` : 'Type to confirm'}
            </DialogTitle>
          </DialogHeader>
          {bulkStep === 1 ? (
            <p className="text-sm text-slate-600 py-2">
              You are about to permanently delete <strong className="text-red-600">{bulkDeleteCount} leads</strong>.
              This cannot be undone.
            </p>
          ) : (
            <div className="py-2 space-y-2">
              <p className="text-sm text-slate-600">Type <strong>DELETE</strong> to confirm:</p>
              <Input className="font-mono tracking-widest" placeholder="DELETE" value={bulkInput}
                onChange={e => setBulkInput(e.target.value)} autoFocus />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsBulkDeleteOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" disabled={isDeleting || (bulkStep === 2 && bulkInput.trim().toUpperCase() !== 'DELETE')} onClick={handleBulkDelete}>
              {isDeleting ? 'Deleting...' : bulkStep === 1 ? 'Continue →' : `Delete ${bulkDeleteCount}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Edit — {activeLead?.name}</DialogTitle>
            <DialogDescription className="font-mono text-xs">{activeLead?.phone}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div><label className="text-xs font-medium text-slate-600 mb-1 block">Status</label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select></div>
            <div><label className="text-xs font-medium text-slate-600 mb-1 block">Assigned To</label>
              <Select value={editAssigneeId || '_unassigned'} onValueChange={setEditAssigneeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_unassigned">— Unassigned</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateLead}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign */}
      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader><DialogTitle>Assign {selectedInView.length} leads</DialogTitle></DialogHeader>
          <div className="py-3">
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={!assigneeId}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Bulk Upload CSV</DialogTitle>
            <DialogDescription>Columns: Name, Phone, MatchingNumber, CurrentOperator, Status, Notes, Important, AssignedTo</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => document.getElementById('csv-upload')?.click()}>
              <Upload className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">{uploadFile ? uploadFile.name : 'Click to select CSV'}</p>
              <input id="csv-upload" type="file" className="hidden" accept=".csv" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
            </div>
            <button className="w-full text-xs text-blue-600 hover:underline flex items-center justify-center gap-1"
              onClick={() => { const b = new Blob(["Name,Phone,MatchingNumber,CurrentOperator,Status,Notes,Important,AssignedTo\n"],{type:'text/csv'}); const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='template.csv';a.click(); }}>
              <Download className="h-3 w-3" />Download Template
            </button>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!uploadFile || isUploading}>{isUploading ? 'Uploading...' : 'Upload'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeadManagement;
