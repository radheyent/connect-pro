import React, { useState, useEffect } from 'react';
import { supabase, UserProfile } from '@/lib/supabase';
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
import { UserPlus, Mail, Lock, Phone, Pencil, Trash2, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const EmployeeManagement: React.FC = () => {
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee'
  });

  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);
  const [editData, setEditData] = useState({ name: '', email: '', role: 'employee', password: '' });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { isSupabaseConfigured } = await import('@/lib/supabase');
      if (!isSupabaseConfigured) {
        setEmployees([
          { id: '1', name: 'Admin User', email: 'admin@connectpro.com', role: 'admin', is_active: true, created_at: new Date().toISOString() },
          { id: '2', name: 'Amit Kumar', email: 'amit@connectpro.com', role: 'employee', is_active: true, created_at: new Date().toISOString() },
          { id: '3', name: 'Rajesh M.', email: 'rajesh@connectpro.com', role: 'employee', is_active: true, created_at: new Date().toISOString() },
          { id: '4', name: 'Suresh', email: 'suresh@connectpro.com', role: 'field_boy', is_active: false, created_at: new Date().toISOString() },
        ] as any);
        return;
      }

      const res = await fetch('/api/admin/employees/list');
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Load failed');
      setEmployees(result.employees || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch employees');
      try {
        const { data } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
        setEmployees(data || []);
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmployee = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      toast.error('Naam, email aur password sab required hain');
      return;
    }
    try {
      const res = await fetch('/api/admin/employees/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      toast.success('Employee created successfully');
      setIsAddModalOpen(false);
      setFormData({ name: '', email: '', password: '', role: 'employee' });
      fetchEmployees();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      toast.success('Status updated');
      fetchEmployees();
    } catch (error: any) {
      toast.error('Update failed');
    }
  };

  const openEdit = (emp: UserProfile) => {
    setEditTarget(emp);
    setEditData({ name: emp.name, email: emp.email || '', role: emp.role, password: '' });
  };

  const handleUpdateEmployee = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/employees/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editTarget.id,
          name: editData.name,
          role: editData.role,
          email: editData.email,
          password: editData.password || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      toast.success('Employee updated successfully');
      setEditTarget(null);
      fetchEmployees();
    } catch (error: any) {
      toast.error(error.message || 'Update fail ho gaya');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/employees/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      toast.success('Employee deleted');
      setDeleteTarget(null);
      fetchEmployees();
    } catch (error: any) {
      toast.error(error.message || 'Delete fail ho gaya');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">User Management</h2>
          <p className="text-sm text-slate-500">Manage accounts, roles, and system access</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 shadow-sm">
          <UserPlus className="h-4 w-4 mr-2" /> Add Employee
        </Button>
      </div>

      <div className="border rounded-xl bg-white shadow-sm overflow-hidden border-slate-200">
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200 text-slate-500">
                <TableHead className="p-4 font-semibold uppercase text-[11px] tracking-wider">Employee Name</TableHead>
                <TableHead className="p-4 font-semibold uppercase text-[11px] tracking-wider">Email</TableHead>
                <TableHead className="p-4 font-semibold uppercase text-[11px] tracking-wider">Role</TableHead>
                <TableHead className="p-4 font-semibold uppercase text-[11px] tracking-wider">Status</TableHead>
                <TableHead className="p-4 font-semibold uppercase text-[11px] tracking-wider">Joined</TableHead>
                <TableHead className="p-4 font-semibold uppercase text-[11px] tracking-wider">Last Login</TableHead>
                <TableHead className="p-4 font-semibold uppercase text-[11px] tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-20 text-slate-400">Loading employees...</TableCell></TableRow>
              ) : employees.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-20 text-slate-400">Koi employee nahi mila</TableCell></TableRow>
              ) : employees.map((emp) => (
                <TableRow key={emp.id} className={cn("hover:bg-slate-50 transition-colors", !emp.is_active && 'opacity-60 grayscale')}>
                  <TableCell className="p-4 font-medium text-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold ring-2 ring-slate-100 shadow-inner shrink-0">
                          {emp.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold">{emp.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{emp.id.slice(0, 8)}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="p-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-700">
                      <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="font-mono">{emp.email || '—'}</span>
                    </div>
                    {emp.phone && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{emp.phone}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="p-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ring-1 ring-inset",
                      emp.role === 'admin' ? "bg-slate-900 text-white ring-slate-800" :
                      emp.role === 'field_boy' ? "bg-blue-50 text-blue-700 ring-blue-100" :
                      "bg-slate-100 text-slate-600 ring-slate-200"
                    )}>
                      {emp.role.replace('_', ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="p-4">
                    {emp.is_active ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                        Disabled
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="p-4 text-xs text-slate-500">
                    {format(new Date(emp.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="p-4 text-xs text-slate-500">
                    {emp.last_sign_in_at ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {format(new Date(emp.last_sign_in_at), 'dd MMM, hh:mm a')}
                      </span>
                    ) : (
                      <span className="text-slate-300">Never</span>
                    )}
                  </TableCell>
                  <TableCell className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        onClick={() => openEdit(emp)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 px-2.5 font-bold text-[11px] uppercase tracking-tight",
                          emp.is_active ? "text-red-500 hover:bg-red-50" : "text-green-600 hover:bg-green-50"
                        )}
                        onClick={() => toggleStatus(emp.id, emp.is_active)}
                      >
                        {emp.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                        onClick={() => setDeleteTarget(emp)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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
            <div className="p-8 text-center text-slate-400">Loading employees...</div>
          ) : employees.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Koi employee nahi mila</div>
          ) : employees.map((emp) => (
            <div key={emp.id} className={cn("p-4 flex flex-col gap-3", !emp.is_active && 'opacity-60 grayscale')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                    {emp.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{emp.name}</h4>
                    <p className="text-[9px] text-slate-400 lowercase font-mono">{emp.role.replace('_', ' ')}</p>
                  </div>
                </div>
                {emp.is_active ? (
                  <Badge className="bg-green-100 text-green-700 border-none text-[9px] h-4 shrink-0">Active</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[9px] h-4 shrink-0">Disabled</Badge>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                <span className="font-mono truncate">{emp.email || '—'}</span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>Joined {format(new Date(emp.created_at), 'dd MMM yyyy')}</span>
                <span>{emp.last_sign_in_at ? `Last: ${format(new Date(emp.last_sign_in_at), 'dd MMM')}` : 'Never logged in'}</span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[10px] font-bold uppercase flex-1"
                  onClick={() => openEdit(emp)}
                >
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 px-2 text-[9px] font-bold uppercase flex-1",
                    emp.is_active ? "text-red-500 border-red-100" : "text-green-600 border-green-100"
                  )}
                  onClick={() => toggleStatus(emp.id, emp.is_active)}
                >
                  {emp.is_active ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-500 border-red-100 shrink-0"
                  onClick={() => setDeleteTarget(emp)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>
              Create a new account and profile for staff.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="john@example.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Temporary Password</label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={formData.role} onValueChange={(v) => setFormData({...formData, role: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="field_boy">Field Boy</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateEmployee}>Create Account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
            <DialogDescription>
              Update details for {editTarget?.name}. Leave password blank to keep it unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={editData.name}
                onChange={(e) => setEditData({...editData, name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  type="email"
                  value={editData.email}
                  onChange={(e) => setEditData({...editData, email: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password (optional)</label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  type="password"
                  placeholder="Leave blank to keep current password"
                  value={editData.password}
                  onChange={(e) => setEditData({...editData, password: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={editData.role} onValueChange={(v) => setEditData({...editData, role: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="field_boy">Field Boy</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleUpdateEmployee} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Delete Employee
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email})?
              This will remove their login and profile completely. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteEmployee}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Yes, Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeManagement;
