import React, { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { IdCard, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ProfileData {
  name: string;
  role: string;
  employee_code: string;
  designation: string;
  joining_date: string;
  mobile_number: string;
  personal_email: string;
  salary: number | null;
}

const EMPTY: ProfileData = {
  name: '', role: '', employee_code: '', designation: '', joining_date: '',
  mobile_number: '', personal_email: '', salary: null,
};

const INPUT_CLS =
  'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900';

const fmtDate = (d: string): string =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b py-2 text-sm last:border-b-0 dark:border-slate-800">
    <span className="text-slate-500 dark:text-slate-400">{label}</span>
    <span className="break-all text-right font-medium">{value || '—'}</span>
  </div>
);

const MyProfilePage: React.FC = () => {
  const { user, profile } = useAuth();
  const userId = user?.id;

  const [data, setData] = useState<ProfileData>({ ...EMPTY, name: profile?.name ?? '', role: profile?.role ?? '' });
  const [loading, setLoading] = useState(true);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [profRes, detRes, payRes] = await Promise.all([
      supabase.from('user_profiles').select('name, role, employee_code, designation, joining_date').eq('id', userId).maybeSingle(),
      supabase.from('employee_details').select('mobile_number, personal_email').eq('emp_id', userId).maybeSingle(),
      supabase.from('employee_payroll').select('salary').eq('emp_id', userId).maybeSingle(),
    ]);
    const p: any = profRes.data ?? {};
    const d: any = detRes.data ?? {};
    const s: any = payRes.data ?? {};
    setData({
      name: p.name ?? '',
      role: p.role ?? '',
      employee_code: p.employee_code ?? '',
      designation: p.designation ?? '',
      joining_date: p.joining_date ?? '',
      mobile_number: d.mobile_number ?? '',
      personal_email: d.personal_email ?? '',
      salary: s.salary === undefined || s.salary === null ? null : Number(s.salary),
    });
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) { toast.error('Your account has no email address'); return; }
    if (next.length < 6) { toast.error('The new password must be at least 6 characters'); return; }
    if (next !== confirm) { toast.error('The new passwords do not match'); return; }
    if (next === current) { toast.error('The new password must be different from the current one'); return; }

    setSaving(true);
    try {
      // Check the current password with a throw-away client, so the real session is never touched
      const env = (import.meta as any).env;
      const verifier = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'password-check' },
      });
      const { error: verifyError } = await verifier.auth.signInWithPassword({ email: user.email, password: current });
      if (verifyError) throw new Error('The current password is incorrect');

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw new Error(error.message);

      toast.success('Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast.error((err as Error).message || 'Could not change the password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <IdCard className="h-5 w-5 text-blue-600" /> My Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div>
              <Row label="Name" value={data.name} />
              <Row label="Employee code" value={data.employee_code} />
              <Row label="Login email" value={user?.email ?? ''} />
              <Row label="Role" value={data.role.replace('_', ' ')} />
              <Row label="Designation" value={data.designation} />
              <Row label="Joining date" value={fmtDate(data.joining_date)} />
              <Row label="Mobile number" value={data.mobile_number} />
              <Row label="Personal email" value={data.personal_email} />
              <Row
                label="Monthly salary"
                value={data.salary === null ? '' : '₹' + data.salary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              />
              <p className="mt-3 text-xs text-slate-500">To correct any of these details, please contact your administrator.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-blue-600" /> Change password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Current password</span>
              <input type="password" autoComplete="current-password" className={INPUT_CLS} value={current} onChange={e => setCurrent(e.target.value)} required />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">New password</span>
              <input type="password" autoComplete="new-password" className={INPUT_CLS} value={next} onChange={e => setNext(e.target.value)} required />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Confirm new password</span>
              <input type="password" autoComplete="new-password" className={INPUT_CLS} value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </label>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default MyProfilePage;
