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
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, 
  Upload, 
  Download, 
  Filter, 
  Search, 
  UserPlus, 
  Trash2, 
  Edit 
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const LeadManagement: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'All' | 'Not Connected' | 'Interested' | 'Follow-up' | 'Complete'>('All');
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [isBulkStatusDeleteOpen, setIsBulkStatusDeleteOpen] = useState(false);
  const [bulkDeleteStatus, setBulkDeleteStatus] = useState('');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Form states
  const [newLead, setNewLead] = useState({
    name: '',
    phone: '',
    matching_number: '',
    current_operator: '',
    important: false
  });
  const [assigneeId, setAssigneeId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editStatus, setEditStatus] = useState<string>('');
  const [editAssigneeId, setEditAssigneeId] = useState<string>('');

  const handleOpenEdit = (lead: Lead) => {
    setEditingLead(lead);
    setEditStatus(lead.status || 'Not Connected');
    setEditAssigneeId(lead.assigned_to || '');
    setIsEditModalOpen(true);
  };

  const handleUpdateLead = async () => {
    if (!editingLead) return;
    try {
      const { error } = await supabase
        .from('leads')
        .update({ 
          status: editStatus,
          assigned_to: editAssigneeId === '_unassigned' || !editAssigneeId ? null : editAssigneeId
        })
        .eq('id', editingLead.id);

      if (error) throw error;
      toast.success('Lead updated successfully');
      setIsEditModalOpen(false);
      setEditingLead(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: leadsData, error: leadsError } = await supabase
        .from('leads')
        .select('*, assigned_user:user_profiles!assigned_to(*)')
        .order('created_date', { ascending: false });

      const { data: empData, error: empError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('is_active', true);

      if (leadsError || empError) throw leadsError || empError;
      
      setLeads(leadsData || []);
      setEmployees(empData || []);
    } catch (error: any) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLead = async () => {
    try {
      const { error } = await supabase.from('leads').insert([newLead]);
      if (error) throw error;
      toast.success('Lead added successfully');
      setIsAddModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleBulkAssign = async () => {
    if (!assigneeId || selectedLeads.length === 0) return;
    try {
      const { error } = await supabase
        .from('leads')
        .update({ assigned_to: assigneeId, status: 'Not Connected' })
        .in('id', selectedLeads);

      if (error) throw error;
      toast.success(`Assigned ${selectedLeads.length} leads successfully`);
      setIsAssignModalOpen(false);
      setSelectedLeads([]);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile) return;
    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      const res = await fetch('/api/admin/leads/bulk-upload', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      toast.success(`Successfully uploaded ${result.count} leads`);
      setIsUploadModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const toggleSelectAll = () => {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map(l => l.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedLeads(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const downloadTemplate = () => {
    const headers = "Name,Phone,MatchingNumber,CurrentOperator,Status,AssignedTo,AddedBy,LastCallDate,Notes,Important,CreatedDate,CompletedDate,CallDuration\n";
    const blob = new Blob([headers], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'connect_pro_template.csv';
    a.click();
  };

  const filteredLeads = leads.filter(l => {
    const matchesSearch = l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search);
    const matchesTab = filterTab === 'All' ? true : 
                       filterTab === 'Not Connected' ? (l.status === 'Not Connected' || !l.status) : 
                       l.status === filterTab;
    return matchesSearch && matchesTab;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <Button onClick={() => setIsAddModalOpen(true)} className="flex-1 lg:flex-none">
            <Plus className="h-4 w-4 mr-2" /> Add Lead
          </Button>
          <Button variant="outline" onClick={() => setIsUploadModalOpen(true)} className="flex-1 lg:flex-none">
            <Upload className="h-4 w-4 mr-2" /> Bulk Upload
          </Button>
          {selectedLeads.length > 0 && (
            <Button variant="secondary" onClick={() => setIsAssignModalOpen(true)} className="w-full lg:w-auto">
              <UserPlus className="h-4 w-4 mr-2" /> Assign ({selectedLeads.length})
            </Button>
          )}
        </div>
        <div className="flex gap-2 w-full lg:w-auto flex-wrap">
          <div className="relative flex-1 lg:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search leads..." 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="w-44 h-10 text-sm">
              <SelectValue placeholder="All Employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">👥 All Employees</SelectItem>
              <SelectItem value="unassigned">— Unassigned</SelectItem>
              {employees.map((emp: any) => (
                <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button 
          variant={filterTab === 'All' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setFilterTab('All')}
          className={cn("text-xs h-8", filterTab === 'All' ? "bg-slate-800 text-white" : "text-slate-600 bg-white")}
        >
          All ({leads.length})
        </Button>
        <Button 
          variant={filterTab === 'Not Connected' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setFilterTab('Not Connected')}
          className={cn("text-xs h-8", filterTab === 'Not Connected' ? "bg-slate-600 text-white" : "text-slate-600 bg-white")}
        >
          Not Connected ({leads.filter(l => l.status === 'Not Connected' || !l.status).length})
        </Button>
        <Button 
          variant={filterTab === 'Interested' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setFilterTab('Interested')}
          className={cn("text-xs h-8", filterTab === 'Interested' ? "bg-green-600 text-white" : "text-slate-600 bg-white")}
        >
          Interested ({leads.filter(l => l.status === 'Interested').length})
        </Button>
        <Button 
          variant={filterTab === 'Follow-up' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setFilterTab('Follow-up')}
          className={cn("text-xs h-8", filterTab === 'Follow-up' ? "bg-amber-500 text-white" : "text-slate-600 bg-white")}
        >
          Follow-ups ({leads.filter(l => l.status === 'Follow-up').length})
        </Button>
        <Button 
          variant={filterTab === 'Complete' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setFilterTab('Complete')}
          className={cn("text-xs h-8", filterTab === 'Complete' ? "bg-blue-600 text-white" : "text-slate-600 bg-white")}
        >
          Completed ({leads.filter(l => l.status === 'Complete').length})
        </Button>
        <Button 
          variant={filterTab === 'Not Interested' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setFilterTab('Not Interested')}
          className={cn("text-xs h-8", filterTab === 'Not Interested' ? "bg-orange-600 text-white" : "text-slate-600 bg-white")}
        >
          Not Interested ({leads.filter(l => l.status === 'Not Interested').length})
        </Button>
        {filterTab !== 'All' && leads.filter(l => l.status === filterTab).length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8 border-red-200 text-red-600 hover:bg-red-50 ml-auto"
            onClick={() => { setBulkDeleteStatus(filterTab); setIsBulkStatusDeleteOpen(true); }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete All {filterTab} ({leads.filter(l => l.status === filterTab).length})
          </Button>
        )}
      </div>

      <div className="border rounded-xl bg-white shadow-sm overflow-hidden border-slate-200">
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
                <TableHead className="w-12 p-4">
                  <Checkbox 
                    checked={selectedLeads.length === leads.length && leads.length > 0} 
                    onCheckedChange={toggleSelectAll}
                    className="border-slate-300"
                  />
                </TableHead>
                <TableHead className="p-4 font-semibold text-slate-500 uppercase text-[11px] tracking-wider">Name</TableHead>
                <TableHead className="p-4 font-semibold text-slate-500 uppercase text-[11px] tracking-wider">Phone</TableHead>
                <TableHead className="p-4 font-semibold text-slate-500 uppercase text-[11px] tracking-wider">Status</TableHead>
                <TableHead className="p-4 font-semibold text-slate-500 uppercase text-[11px] tracking-wider">Assigned To</TableHead>
                <TableHead className="p-4 font-semibold text-slate-500 uppercase text-[11px] tracking-wider">Created</TableHead>
                <TableHead className="p-4 font-semibold text-slate-500 uppercase text-[11px] tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-20 text-slate-400">Loading leads...</TableCell></TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-20 text-slate-400">No leads found.</TableCell></TableRow>
              ) : (
                  filteredLeads.map((lead) => (
                  <TableRow key={lead.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="p-4">
                      <Checkbox 
                        checked={selectedLeads.includes(lead.id)} 
                        onCheckedChange={() => toggleSelect(lead.id)}
                        className="border-slate-300"
                      />
                    </TableCell>
                    <TableCell className="p-4 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                          {lead.name}
                          {lead.important && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
                      </div>
                    </TableCell>
                    <TableCell className="p-4 text-slate-600 font-mono text-xs">{lead.phone}</TableCell>
                    <TableCell className="p-4">
                      <span className={cn(
                          "px-2 py-1 text-[11px] font-bold rounded-full uppercase",
                          lead.status === 'Interested' ? "bg-green-100 text-green-700" :
                          lead.status === 'Follow-up' ? "bg-blue-100 text-blue-700" :
                          lead.status === 'Complete' ? "bg-blue-600 text-white" :
                          "bg-slate-100 text-slate-600"
                      )}>
                          {lead.status}
                      </span>
                    </TableCell>
                    <TableCell className="p-4 text-slate-600 italic">
                      {lead.assigned_user?.name || <span className="text-slate-400">Unassigned</span>}
                    </TableCell>
                    <TableCell className="p-4 text-xs text-slate-400">
                      {format(new Date(lead.created_date), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell className="p-4 text-right">
                      <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" onClick={() => handleOpenEdit(lead)}>
                              <Edit className="h-4 w-4 text-slate-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:bg-red-50" onClick={() => handleDeleteSingle(lead.id)}>
                              <Trash2 className="h-4 w-4" />
                          </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
             <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : filteredLeads.length === 0 ? (
             <div className="p-8 text-center text-slate-400">No leads found.</div>
          ) : (
            filteredLeads.map(lead => (
              <div key={lead.id} className="p-4 flex items-start gap-3">
                <div className="mt-1">
                  <Checkbox 
                    checked={selectedLeads.includes(lead.id)} 
                    onCheckedChange={() => toggleSelect(lead.id)}
                    className="border-slate-300"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{lead.name}</span>
                      {lead.important && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
                    </div>
                    <span className={cn(
                        "px-2 py-0.5 text-[9px] font-bold rounded-full uppercase",
                        lead.status === 'Interested' ? "bg-green-100 text-green-700" :
                        lead.status === 'Follow-up' ? "bg-blue-100 text-blue-700" :
                        lead.status === 'Complete' ? "bg-blue-600 text-white" :
                        "bg-slate-100 text-slate-600"
                    )}>
                        {lead.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">{lead.phone}</p>
                  <div className="flex items-center justify-between text-[10px] pt-1">
                    <span className="text-slate-400 italic">
                      Assigned: {lead.assigned_user?.name || 'Unassigned'}
                    </span>
                    <span className="text-slate-400">
                      {format(new Date(lead.created_date), 'dd MMM')}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bulk Delete by Status Modal */}
      <Dialog open={isBulkStatusDeleteOpen} onOpenChange={setIsBulkStatusDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete All "{bulkDeleteStatus}" Leads
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            This will permanently delete{' '}
            <strong className="text-red-600">
              {leads.filter(l => l.status === bulkDeleteStatus).length} leads
            </strong>{' '}
            with status <strong>"{bulkDeleteStatus}"</strong>. This cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsBulkStatusDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDeleteByStatus}>
              Yes, Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input value={newLead.name} onChange={(e) => setNewLead({...newLead, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone</label>
                <Input value={newLead.phone} onChange={(e) => setNewLead({...newLead, phone: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Matching Number</label>
                <Input value={newLead.matching_number} onChange={(e) => setNewLead({...newLead, matching_number: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Operator</label>
                <Input value={newLead.current_operator} onChange={(e) => setNewLead({...newLead, current_operator: e.target.value})} />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="imp" checked={newLead.important} onCheckedChange={(c) => setNewLead({...newLead, important: !!c})} />
              <label htmlFor="imp" className="text-sm font-medium">Mark as Important</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLead}>Add Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Upload Leads</DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/50 transition-colors"
                 onClick={() => document.getElementById('file-upload')?.click()}>
              <Upload className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm text-center">
                {uploadFile ? uploadFile.name : 'Click to upload CSV or Excel file'}
              </p>
              <input 
                id="file-upload" 
                type="file" 
                className="hidden" 
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>
            <Button variant="link" className="w-full text-xs" onClick={downloadTemplate}>
              <Download className="h-3 w-3 mr-1" /> Download CSV Template
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadModalOpen(false)}>Cancel</Button>
            <Button onClick={handleFileUpload} disabled={!uploadFile}>Upload Leads</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Modal */}
      <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {selectedLeads.length} Leads</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Choose Employee</label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignModalOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={!assigneeId}>Assign Now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
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
                  <SelectItem value="Complete">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium block">Assigned Employee</label>
              <Select value={editAssigneeId} onValueChange={setEditAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_unassigned">-- Unassigned --</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (editAssigneeId === '_unassigned') {
                setEditAssigneeId('');
              }
              handleUpdateLead();
            }}>Update Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeadManagement;
