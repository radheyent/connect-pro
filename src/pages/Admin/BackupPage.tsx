import React, { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Download, RotateCcw, AlertTriangle, Loader2,
  CheckCircle2, Database, FileSpreadsheet, Trash2,
  ShieldAlert, Info, Clock
} from 'lucide-react';
import { toast } from 'sonner';

// Tables to clear on monthly reset (all operational data)
const RESET_TABLES: Array<{ name: string; label: string }> = [
  { name: 'leads',             label: 'Leads' },
  { name: 'call_attempts',     label: 'Call Attempts' },
  { name: 'whatsapp_messages', label: 'WhatsApp Messages' },
  { name: 'field_expenses',    label: 'Field Expenses' },
  { name: 'office_expenses',   label: 'Office Expenses' },
  { name: 'employee_expenses', label: 'Employee Expenses' },
  { name: 'admin_credits',     label: 'Admin Credits' },
  { name: 'expense_budgets',   label: 'Expense Budgets' },
  { name: 'archived_leads',    label: 'Archived Leads' },
];

// Tables always preserved
const PRESERVE_LABELS = [
  'User Profiles (employees, admins, field boys)',
  'App Settings (km rate, etc.)',
  'Announcements',
];

const LAST_BACKUP_KEY = 'connectpro_last_backup';
const LAST_RESET_KEY  = 'connectpro_last_reset';

async function fetchTable(table: string): Promise<any[]> {
  const { data, error } = await supabase.from(table).select('*');
  if (error) { console.warn(`Fetch ${table}:`, error.message); return []; }
  return data || [];
}

function addSheet(wb: XLSX.WorkBook, rows: any[], name: string) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: 'No data' }]);
  if (rows.length) {
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 14) }));
  }
  XLSX.utils.book_append_sheet(wb, ws, name);
}

const BackupPage: React.FC = () => {
  const [exporting,    setExporting]    = useState(false);
  const [resetting,    setResetting]    = useState(false);
  const [resetOpen,    setResetOpen]    = useState(false);
  const [confirmText,  setConfirmText]  = useState('');
  const [progress,     setProgress]     = useState<string[]>([]);
  const [lastBackup,   setLastBackup]   = useState<string | null>(null);
  const [lastReset,    setLastReset]    = useState<string | null>(null);
  const [dataCounts,   setDataCounts]   = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [backupDoneThisSession, setBackupDoneThisSession] = useState(false);

  useEffect(() => {
    setLastBackup(localStorage.getItem(LAST_BACKUP_KEY));
    setLastReset(localStorage.getItem(LAST_RESET_KEY));
    loadCounts();
  }, []);

  const loadCounts = async () => {
    setLoadingCounts(true);
    const counts: Record<string, number> = {};
    await Promise.all(RESET_TABLES.map(async ({ name }) => {
      const { count } = await supabase.from(name).select('*', { count: 'exact', head: true });
      counts[name] = count || 0;
    }));
    setDataCounts(counts);
    setLoadingCounts(false);
  };

  const totalRows = Object.values(dataCounts).reduce((s: number, v: number) => s + v, 0);
  const addLog = (msg: string) => setProgress(p => [...p, msg]);

  // ── BACKUP ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setExporting(true);
    setProgress([]);
    try {
      const wb = XLSX.utils.book_new();

      addLog('Fetching leads…');
      const leads = await fetchTable('leads');
      addSheet(wb, leads, 'Leads');

      addLog('Fetching call attempts…');
      const calls = await fetchTable('call_attempts');
      addSheet(wb, calls, 'Call Attempts');

      addLog('Fetching WhatsApp messages…');
      const wa = await fetchTable('whatsapp_messages');
      addSheet(wb, wa, 'WhatsApp');

      addLog('Fetching field expenses…');
      const fe = await fetchTable('field_expenses');
      addSheet(wb, fe, 'Field Expenses');

      addLog('Fetching office expenses…');
      const oe = await fetchTable('office_expenses');
      addSheet(wb, oe, 'Office Expenses');

      addLog('Fetching employee expenses…');
      const ee = await fetchTable('employee_expenses');
      addSheet(wb, ee, 'Employee Expenses');

      addLog('Fetching admin credits…');
      const ac = await fetchTable('admin_credits');
      addSheet(wb, ac, 'Admin Credits');

      addLog('Fetching archived leads…');
      const al = await fetchTable('archived_leads');
      addSheet(wb, al, 'Archived Leads');

      addLog('Building ledger…');
      // All ledger rows: expense always negative value, credit always positive
      const ledgerRows = [
        ...fe.filter(e => e.status === 'approved').map(e => ({
          Date:   e.expense_date,
          Source: 'Field Expense',
          Person: e.field_boy_id,
          Desc:   e.description || 'Conveyance',
          KM:     e.kilometres || 0,
          'Expense ₹': -(Number(e.conveyance_amount) || 0),
          'Credit ₹':  +(Number(e.credit_total) || 0),
        })),
        ...oe.map(e => ({
          Date:   e.expense_date,
          Source: 'Office Expense',
          Person: e.category,
          Desc:   e.description,
          KM: 0,
          'Expense ₹': -(Number(e.amount) || 0),
          'Credit ₹':  0,
        })),
        ...ee.filter(e => e.status === 'approved').map(e => ({
          Date:   e.expense_date,
          Source: 'Employee Expense',
          Person: e.user_id,
          Desc:   e.description,
          KM: 0,
          'Expense ₹': -(Number(e.amount) || 0),
          'Credit ₹':  0,
        })),
        ...ac.map(e => ({
          Date:   e.credit_date,
          Source: 'Admin Credit',
          Person: e.category,
          Desc:   e.description,
          KM: 0,
          'Expense ₹': 0,
          'Credit ₹':  +(Number(e.amount) || 0),
        })),
      ].sort((a, b) => (a.Date < b.Date ? -1 : 1)); // oldest first for correct running balance

      let running = 0;
      const ledgerWithBalance = ledgerRows.map(r => {
        const net = r['Credit ₹'] + r['Expense ₹'];
        running += net;
        return {
          ...r,
          'Net ₹': net >= 0 ? `+${net.toFixed(0)}` : `${net.toFixed(0)}`,
          'Running Balance ₹': running >= 0 ? `+${running.toFixed(0)}` : `${running.toFixed(0)}`,
        };
      });
      addSheet(wb, ledgerWithBalance, 'Ledger');

      // Summary sheet
      const totalExp = Math.abs(ledgerRows.reduce((s, r) => s + r['Expense ₹'], 0));
      const totalCr  = ledgerRows.reduce((s, r) => s + r['Credit ₹'], 0);
      addSheet(wb, [
        { Metric: 'Total Leads',          Value: leads.length },
        { Metric: 'Total Call Attempts',  Value: calls.length },
        { Metric: 'Total Expense ₹',      Value: -totalExp },
        { Metric: 'Total Credit ₹',       Value: totalCr },
        { Metric: 'Net P&L ₹',            Value: totalCr - totalExp },
        { Metric: 'Field Expenses',        Value: fe.length },
        { Metric: 'Office Expenses',       Value: oe.length },
        { Metric: 'Employee Expenses',     Value: ee.length },
        { Metric: 'Admin Credits',         Value: ac.length },
        { Metric: 'Backup Generated At',   Value: new Date().toLocaleString('en-IN') },
      ], 'Summary');

      addLog('Writing Excel file…');
      const date = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `ConnectPro_Backup_${date}.xlsx`);

      const now = new Date().toLocaleString('en-IN');
      localStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackup(now);
      setBackupDoneThisSession(true);
      addLog(`✅ Backup complete! (${leads.length} leads, ${fe.length + oe.length + ee.length} expenses)`);
      toast.success('Backup downloaded successfully');
    } catch (e: any) {
      toast.error('Backup failed: ' + e.message);
      addLog('❌ Error: ' + e.message);
    } finally {
      setExporting(false);
    }
  }, []);

  // ── RESET ─────────────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (confirmText !== 'RESET') { toast.error('Type RESET to confirm'); return; }
    setResetting(true);
    setProgress([]);
    let hasError = false;

    try {
      addLog('🔴 Starting monthly reset…');
      addLog('');

      for (const { name, label } of RESET_TABLES) {
        try {
          // Count rows first
          const { count } = await supabase.from(name).select('*', { count: 'exact', head: true });
          addLog(`Clearing ${label} (${count || 0} rows)…`);

          // Use created_at >= epoch as universal "all rows" filter
          // This works even when PK is not 'id'
          const { error } = await supabase
            .from(name)
            .delete()
            .gte('created_at', '1970-01-01T00:00:00Z');

          if (error) {
            if (error.code === '42P01') {
              addLog(`  ⚠️ ${label} — table not found, skipping`);
            } else if (error.message?.includes('created_at')) {
              // Fallback: try neq on id for tables without created_at
              const { error: e2 } = await supabase
                .from(name)
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');
              if (e2) {
                addLog(`  ❌ ${label} — ${e2.message}`);
                hasError = true;
              } else {
                addLog(`  ✅ ${label} cleared`);
              }
            } else {
              addLog(`  ❌ ${label} — ${error.message}`);
              hasError = true;
            }
          } else {
            addLog(`  ✅ ${label} cleared (${count || 0} rows deleted)`);
          }
        } catch (e: any) {
          addLog(`  ❌ ${label} — ${e.message}`);
          hasError = true;
        }
      }

      addLog('');
      addLog('🟢 Preserved: Users, Settings, Announcements');
      addLog('');

      const now = new Date().toLocaleString('en-IN');
      localStorage.setItem(LAST_RESET_KEY, now);
      setLastReset(now);
      setBackupDoneThisSession(false);
      await loadCounts();

      if (hasError) {
        addLog('⚠️ Reset finished with some errors — check above');
        toast.warning('Reset done with some errors');
      } else {
        addLog('✅ Monthly reset complete! Fresh start ready.');
        toast.success('Monthly reset complete!');
      }

      setResetOpen(false);
      setConfirmText('');
    } catch (e: any) {
      toast.error('Reset failed: ' + e.message);
      addLog('❌ Fatal: ' + e.message);
    } finally {
      setResetting(false);
    }
  }, [confirmText]);

  const daysSinceBackup = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000) : null;
  const backupWarning = daysSinceBackup !== null && daysSinceBackup >= 7;

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-10">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Backup & Monthly Reset</h2>
        <p className="text-sm text-slate-500 mt-0.5">Download full data backup, then reset Supabase for a fresh month.</p>
      </div>

      {/* Last backup + reset status */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${backupWarning ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
          <Clock className={`h-4 w-4 mt-0.5 shrink-0 ${backupWarning ? 'text-amber-500' : 'text-slate-400'}`} />
          <div>
            <p className={`font-bold ${backupWarning ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
              {backupWarning ? '⚠️ Backup Overdue' : 'Last Backup'}
            </p>
            <p className="text-slate-500 dark:text-slate-400 mt-0.5">
              {lastBackup || 'Never backed up'}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-xl border text-xs bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700">
          <RotateCcw className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
          <div>
            <p className="font-bold text-slate-600 dark:text-slate-300">Last Reset</p>
            <p className="text-slate-500 dark:text-slate-400 mt-0.5">{lastReset || 'Never reset'}</p>
          </div>
        </div>
      </div>

      {/* Supabase data counts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-500" />
            Current Supabase Data
            <span className="ml-auto text-xs font-normal text-slate-400">
              {loadingCounts ? 'Loading…' : `${totalRows.toLocaleString()} total rows`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {RESET_TABLES.map(({ name, label }) => (
              <div key={name} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                <span className="text-xs text-slate-500 truncate">{label}</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 ml-1 shrink-0">
                  {loadingCounts ? '…' : (dataCounts[name] || 0).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recommended workflow */}
      <div className="flex gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
        <div>
          <p className="font-bold mb-1 text-sm">Recommended monthly workflow:</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Click <strong>Download Full Backup</strong> — save the Excel file</li>
            <li>Verify it opened correctly</li>
            <li>Click <strong>Monthly Reset</strong> — all data cleared from Supabase</li>
            <li>Fresh month begins — employees and settings intact</li>
          </ol>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ── Backup Card ── */}
        <Card className="border-blue-200 dark:border-blue-900">
          <CardHeader>
            <div className="p-2 w-fit bg-blue-100 dark:bg-blue-900/30 rounded-xl mb-2">
              <FileSpreadsheet className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-base">Download Full Backup</CardTitle>
            <CardDescription className="text-xs">Single Excel file — 9 sheets covering all data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {[
              ['📋', 'Leads'],
              ['📞', 'Call Attempts'],
              ['💬', 'WhatsApp Messages'],
              ['🚗', 'Field Expenses'],
              ['🏢', 'Office Expenses'],
              ['👔', 'Employee Expenses'],
              ['💰', 'Admin Credits'],
              ['📊', 'Ledger (computed P&L + running balance)'],
              ['📈', 'Summary (totals)'],
            ].map(([icon, label]) => (
              <div key={label} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <span>{icon}</span><span>{label}</span>
              </div>
            ))}
          </CardContent>
          <CardFooter>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleExport} disabled={exporting}>
              {exporting
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Exporting…</>
                : <><Download className="mr-2 h-4 w-4" />Download Full Backup</>}
            </Button>
          </CardFooter>
        </Card>

        {/* ── Reset Card ── */}
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <div className="p-2 w-fit bg-red-100 dark:bg-red-900/30 rounded-xl mb-2">
              <RotateCcw className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-base text-red-700 dark:text-red-400">Monthly Reset</CardTitle>
            <CardDescription className="text-xs">Permanently deletes all operational data from Supabase.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <p className="text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5 mb-1.5">
                <Trash2 className="h-3.5 w-3.5" />Clears:
              </p>
              {RESET_TABLES.map(({ label }) => (
                <p key={label} className="text-xs text-red-600 dark:text-red-400 ml-4">• {label}</p>
              ))}
            </div>
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <p className="text-xs font-bold text-green-700 dark:text-green-400 flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />Kept safe:
              </p>
              {PRESERVE_LABELS.map(t => (
                <p key={t} className="text-xs text-green-700 dark:text-green-400 ml-4">• {t}</p>
              ))}
            </div>
            {!backupDoneThisSession && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Download backup first before resetting!
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              variant="destructive" className="w-full"
              onClick={() => { setResetOpen(true); setConfirmText(''); setProgress([]); }}
            >
              <ShieldAlert className="mr-2 h-4 w-4" />Monthly Reset
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Progress log */}
      {progress.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4" />Operation Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900 dark:bg-black rounded-lg p-3 font-mono text-xs space-y-0.5 max-h-52 overflow-y-auto">
              {progress.map((line, i) => (
                <p key={i} className={
                  line.includes('✅') ? 'text-green-400' :
                  line.includes('❌') ? 'text-red-400' :
                  line.includes('⚠️') ? 'text-yellow-400' :
                  line.includes('🔴') ? 'text-red-300 font-bold' :
                  line.includes('🟢') ? 'text-green-300' :
                  'text-slate-400'
                }>{line || '\u00A0'}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Reset Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />Confirm Monthly Reset
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 space-y-1.5">
              <p className="font-bold text-sm">⚠️ This is PERMANENT and cannot be undone.</p>
              <p>All leads, expenses, credits, call logs, and WhatsApp messages will be deleted from Supabase.</p>
              <p>Employee accounts, settings, and announcements will be preserved.</p>
              {!backupDoneThisSession && (
                <p className="font-bold text-amber-700 dark:text-amber-400">⚠️ You have not downloaded a backup this session!</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Type <span className="font-mono font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">RESET</span> to confirm:
              </p>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Type RESET here"
                className="font-mono border-red-300 focus:border-red-500"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetting}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset} disabled={confirmText !== 'RESET' || resetting}>
              {resetting
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resetting…</>
                : <><Trash2 className="mr-2 h-4 w-4" />Yes, Delete All Data</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BackupPage;
