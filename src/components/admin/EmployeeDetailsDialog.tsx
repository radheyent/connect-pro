import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Save, Upload, ExternalLink, Trash2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ═════════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════════
export interface DetailsEmployee {
  id: string;
  name: string;
  email?: string | null;
  role: string;
  is_active: boolean;
  created_at?: string;
  last_sign_in_at?: string | null;
}

interface FormState {
  name: string;
  email: string;
  role: string;
  employee_code: string;
  designation: string;
  joining_date: string;
  mobile_number: string;
  personal_email: string;
}

interface DocRow {
  id: string;
  doc_type: string;
  file_name: string;
  file_url: string | null;
  storage_path: string | null;
  created_at: string;
}

interface MonthSummary {
  present_days: number;
  half_days: number;
  leave_days: number;
  absent_days: number;
  payable_days: number | string;
  days_in_month: number;
  unmarked_days: number;
}

type Section = 'profile' | 'salary' | 'documents';

const BUCKET = 'employee-docs';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DOC_TYPES: Array<{ id: string; label: string }> = [
  { id: 'offerLetter', label: 'Offer Letter' },
  { id: 'employeeId', label: 'Employee ID Card' },
  { id: 'govtId', label: 'Government ID' },
  { id: 'otherFile', label: 'Other (increment letter etc.)' },
];
const ROLES = ['employee', 'field_boy', 'admin'];

const INPUT_CLS =
  'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900';

const EMPTY_FORM: FormState = {
  name: '', email: '', role: 'employee', employee_code: '', designation: '',
  joining_date: '', mobile_number: '', personal_email: '',
};

const istMonth = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);

const fmtDate = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtDateTime = (iso?: string | null): string =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
    : 'Never';

const safeFileName = (name: string): string => name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'file';

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
  </label>
);

// ═════════════════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════════════════
const EmployeeDetailsDialog: React.FC<{
  employee: DetailsEmployee | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ employee, onClose, onSaved }) => {
  const { user } = useAuth();
  const empId = employee?.id ?? null;

  const [section, setSection] = useState<Section>('profile');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [original, setOriginal] = useState<FormState>(EMPTY_FORM);
  const [salary, setSalary] = useState('');
  const [salaryOriginal, setSalaryOriginal] = useState('');
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);
  const [uploadType, setUploadType] = useState('offerLetter');
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const req = useRef(0);

  const loadAll = useCallback(async () => {
    if (!employee) return;
    const id = ++req.current;
    setLoading(true);
    try {
      const [profRes, detRes, payRes, docRes, sumRes] = await Promise.all([
        supabase.from('user_profiles').select('employee_code, designation, joining_date').eq('id', employee.id).maybeSingle(),
        supabase.from('employee_details').select('mobile_number, personal_email').eq('emp_id', employee.id).maybeSingle(),
        supabase.from('employee_payroll').select('salary').eq('emp_id', employee.id).maybeSingle(),
        supabase
          .from('employee_documents')
          .select('id, doc_type, file_name, file_url, storage_path, created_at')
          .eq('emp_id', employee.id)
          .order('created_at', { ascending: false }),
        employee.role === 'employee'
          ? supabase.rpc('attendance_month_summary', { p_month: istMonth(), p_emp: employee.id })
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (id !== req.current) return;

      const prof: any = profRes.data ?? {};
      const det: any = detRes.data ?? {};
      const next: FormState = {
        name: employee.name ?? '',
        email: employee.email ?? '',
        role: employee.role,
        employee_code: prof.employee_code ?? '',
        designation: prof.designation ?? '',
        joining_date: prof.joining_date ?? '',
        mobile_number: det.mobile_number ?? '',
        personal_email: det.personal_email ?? '',
      };
      setForm(next);
      setOriginal(next);

      const sal = (payRes.data as any)?.salary;
      const salText = sal === undefined || sal === null ? '' : String(sal);
      setSalary(salText);
      setSalaryOriginal(salText);

      setDocs((docRes.data as DocRow[]) ?? []);
      setSummary(((sumRes.data as MonthSummary[] | null) ?? [])[0] ?? null);
    } catch (e) {
      if (id === req.current) toast.error((e as Error).message || 'Could not load employee details');
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [employee]);

  // Load fresh data every time a different employee is opened
  useEffect(() => {
    if (!empId) return;
    setSection('profile');
    setNewPassword('');
    loadAll();
  }, [empId, loadAll]);

  const set = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }));
  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  // ── Save profile ──────────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!employee || !user) return;
    const name = form.name.trim();
    const email = form.email.trim();
    const personal = form.personal_email.trim();
    if (!name) { toast.error('Name is required'); return; }
    if (!email) { toast.error('Login email is required'); return; }
    if (personal && !/^\S+@\S+\.\S+$/.test(personal)) { toast.error('Personal email looks invalid'); return; }

    setSaving(true);
    try {
      // 1. Name / role / login email go through the secured server endpoint
      const authPatch: Record<string, string> = {};
      if (name !== original.name) authPatch.name = name;
      if (form.role !== original.role) authPatch.role = form.role;
      if (email !== original.email) authPatch.email = email;
      if (Object.keys(authPatch).length) {
        const res = await adminFetch('/api/admin/employees/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: employee.id, ...authPatch }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || 'Could not update account');
      }

      // 2. Work details live on the profile row
      const profilePatch = {
        employee_code: form.employee_code.trim().toUpperCase() || null,
        designation: form.designation.trim() || null,
        joining_date: form.joining_date || null,
      };
      const { error: profErr } = await supabase.from('user_profiles').update(profilePatch).eq('id', employee.id);
      if (profErr) {
        if ((profErr as { code?: string }).code === '23505') {
          throw new Error('This employee code is already used by another employee.');
        }
        throw new Error(profErr.message);
      }

      // 3. Private contact details
      const { error: detErr } = await supabase.from('employee_details').upsert(
        {
          emp_id: employee.id,
          mobile_number: form.mobile_number.trim() || null,
          personal_email: personal || null,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: 'emp_id' }
      );
      if (detErr) throw new Error(detErr.message);

      toast.success('Employee details saved');
      setOriginal({ ...form, name, email, personal_email: personal, employee_code: profilePatch.employee_code ?? '' });
      setForm(prev => ({ ...prev, name, email, personal_email: personal, employee_code: profilePatch.employee_code ?? '' }));
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  // ── Reset password ────────────────────────────────────────────────────────
  const resetPassword = async () => {
    if (!employee) return;
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (!window.confirm(`Set a new password for ${employee.name}?`)) return;
    setSettingPassword(true);
    try {
      const res = await adminFetch('/api/admin/employees/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: employee.id, password: newPassword }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Could not set password');
      toast.success('Password updated');
      setNewPassword('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSettingPassword(false);
    }
  };

  // ── Salary ────────────────────────────────────────────────────────────────
  const saveSalary = async () => {
    if (!employee || !user) return;
    const value = parseFloat(salary);
    if (!Number.isFinite(value) || value < 0) { toast.error('Enter a valid salary amount'); return; }
    setSavingSalary(true);
    const { error } = await supabase.from('employee_payroll').upsert(
      { emp_id: employee.id, salary: value, updated_at: new Date().toISOString(), updated_by: user.id },
      { onConflict: 'emp_id' }
    );
    setSavingSalary(false);
    if (error) { toast.error(error.message || 'Could not save salary'); return; }
    toast.success('Salary saved');
    setSalaryOriginal(String(value));
    setSalary(String(value));
  };

  // ── Documents ─────────────────────────────────────────────────────────────
  const reloadDocs = async () => {
    if (!employee) return;
    const { data } = await supabase
      .from('employee_documents')
      .select('id, doc_type, file_name, file_url, storage_path, created_at')
      .eq('emp_id', employee.id)
      .order('created_at', { ascending: false });
    setDocs((data as DocRow[]) ?? []);
  };

  const upload = async () => {
    if (!employee || !user) return;
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error('Choose a file first'); return; }
    if (file.size > MAX_FILE_BYTES) { toast.error('File is too large (max 10 MB)'); return; }

    setUploading(true);
    const path = `${employee.id}/${uploadType}/${Date.now()}_${safeFileName(file.name)}`;
    try {
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw new Error(upErr.message);

      const { error: rowErr } = await supabase.from('employee_documents').insert({
        emp_id: employee.id,
        doc_type: uploadType,
        file_name: file.name,
        storage_path: path,
        uploaded_by: user.id,
      });
      if (rowErr) {
        await supabase.storage.from(BUCKET).remove([path]); // do not leave an orphan file behind
        throw new Error(rowErr.message);
      }
      toast.success('Document uploaded');
      if (fileRef.current) fileRef.current.value = '';
      await reloadDocs();
    } catch (e) {
      toast.error((e as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const openDoc = async (d: DocRow) => {
    if (openingId) return;
    setOpeningId(d.id);
    const w = window.open('', '_blank'); // open inside the click so mobile browsers allow it
    try {
      let url: string | null = d.file_url;
      if (d.storage_path) {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 120);
        if (error) throw new Error(error.message);
        url = data?.signedUrl ?? null;
      }
      if (!url) throw new Error('No link available for this file');
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e) {
      if (w) w.close();
      toast.error((e as Error).message || 'Could not open the document');
    } finally {
      setOpeningId(null);
    }
  };

  const removeDoc = async (d: DocRow) => {
    if (!window.confirm(`Delete "${d.file_name}"? This cannot be undone.`)) return;
    try {
      if (d.storage_path) {
        const { error: stErr } = await supabase.storage.from(BUCKET).remove([d.storage_path]);
        if (stErr) throw new Error(stErr.message);
      }
      const { error } = await supabase.from('employee_documents').delete().eq('id', d.id);
      if (error) throw new Error(error.message);
      toast.success('Document deleted');
      await reloadDocs();
    } catch (e) {
      toast.error((e as Error).message || 'Could not delete');
    }
  };

  const salaryDirty = salary !== salaryOriginal;

  return (
    <Dialog open={!!employee} onOpenChange={v => { if (!v && !saving && !uploading) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{employee?.name ?? 'Employee'}</DialogTitle>
          <DialogDescription>
            {employee?.is_active ? 'Active' : 'Disabled'} · Account created {fmtDate(employee?.created_at)} · Last login {fmtDateTime(employee?.last_sign_in_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b dark:border-slate-800">
          {([
            ['profile', 'Profile'],
            ['salary', 'Salary & Attendance'],
            ['documents', `Documents (${docs.length})`],
          ] as Array<[Section, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn(
                'border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
                section === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3 py-2">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : section === 'profile' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Employee code" hint="Same code as the old attendance sheet, e.g. EMP5554. Used to link old attendance records.">
                <input className={INPUT_CLS} value={form.employee_code} onChange={e => set({ employee_code: e.target.value })} placeholder="EMP0000" />
              </Field>
              <Field label="Full name">
                <input className={INPUT_CLS} value={form.name} onChange={e => set({ name: e.target.value })} />
              </Field>
              <Field label="Login email">
                <input type="email" className={INPUT_CLS} value={form.email} onChange={e => set({ email: e.target.value })} />
              </Field>
              <Field label="Role">
                <select className={INPUT_CLS} value={form.role} onChange={e => set({ role: e.target.value })}>
                  {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </Field>
              <Field label="Designation">
                <input className={INPUT_CLS} value={form.designation} onChange={e => set({ designation: e.target.value })} />
              </Field>
              <Field label="Joining date">
                <input type="date" className={INPUT_CLS} value={form.joining_date} onChange={e => set({ joining_date: e.target.value })} />
              </Field>
              <Field label="Mobile number">
                <input className={INPUT_CLS} inputMode="tel" value={form.mobile_number} onChange={e => set({ mobile_number: e.target.value })} />
              </Field>
              <Field label="Personal email">
                <input type="email" className={INPUT_CLS} value={form.personal_email} onChange={e => set({ personal_email: e.target.value })} />
              </Field>
            </div>

            <Button className="w-full gap-2 sm:w-auto" onClick={saveProfile} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>

            <div className="rounded-xl border p-3 dark:border-slate-800">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><KeyRound className="h-4 w-4" /> Reset password</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="password" autoComplete="new-password" className={INPUT_CLS}
                  placeholder="New password (min 6 characters)" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
                <Button variant="outline" onClick={resetPassword} disabled={settingPassword || newPassword.length < 6} className="gap-2">
                  {settingPassword && <Loader2 className="h-4 w-4 animate-spin" />} Set password
                </Button>
              </div>
            </div>
          </div>
        ) : section === 'salary' ? (
          <div className="space-y-4">
            <Field label="Monthly fixed salary (₹)" hint="Visible only to admins and this employee. Existing salary slips are not changed when you edit this.">
              <div className="flex gap-2">
                <input type="number" min="0" step="0.01" className={INPUT_CLS} value={salary} placeholder="Not set" onChange={e => setSalary(e.target.value)} />
                <Button onClick={saveSalary} disabled={savingSalary || !salaryDirty} className="gap-2">
                  {savingSalary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </Button>
              </div>
            </Field>

            {form.role === 'employee' ? (
              <div className="rounded-xl border p-3 dark:border-slate-800">
                <p className="mb-2 text-sm font-semibold">This month's attendance</p>
                {summary ? (
                  <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
                    {([
                      ['Present', summary.present_days],
                      ['Half Day', summary.half_days],
                      ['Leave', summary.leave_days],
                      ['Absent', summary.absent_days],
                      ['Not marked', summary.unmarked_days],
                      [`Payable / ${summary.days_in_month}`, Number(summary.payable_days) % 1 === 0 ? Number(summary.payable_days) : Number(summary.payable_days).toFixed(1)],
                    ] as Array<[string, number | string]>).map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                        <p className="text-slate-500">{label}</p>
                        <p className="text-base font-bold">{value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No attendance data yet.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Attendance and payroll apply to the "employee" role only.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border p-3 dark:border-slate-800">
              <p className="mb-2 text-sm font-semibold">Upload a document</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr_auto]">
                <select className={INPUT_CLS} value={uploadType} onChange={e => setUploadType(e.target.value)}>
                  {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm dark:file:bg-slate-800" />
                <Button onClick={upload} disabled={uploading} className="gap-2">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">PDF, JPG, PNG or Word. Maximum 10 MB. Offer Letter and ID Card are visible to the employee; Government ID and Other files are admin-only.</p>
            </div>

            {DOC_TYPES.map(t => {
              const list = docs.filter(d => d.doc_type === t.id);
              return (
                <div key={t.id}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.label}</p>
                  {list.length === 0 ? (
                    <p className="mb-2 text-sm text-slate-400">Nothing uploaded.</p>
                  ) : (
                    <div className="mb-2 space-y-1.5">
                      {list.map(d => (
                        <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 dark:border-slate-800">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{d.file_name}</p>
                            <p className="text-[11px] text-slate-500">
                              {fmtDate(d.created_at)}{d.storage_path ? '' : ' · old Drive link'}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button size="sm" variant="outline" className="gap-1" disabled={openingId === d.id} onClick={() => openDoc(d)}>
                              {openingId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />} Open
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => removeDoc(d)} aria-label="Delete document">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeDetailsDialog;
