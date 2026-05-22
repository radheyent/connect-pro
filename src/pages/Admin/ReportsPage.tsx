import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Share2, CheckCircle2, Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface EmployeeStat {
  id: string;
  name: string;
  role: string;
  totalAssigned: number;
  dialed: number;
  genuineCalls: number;
  fakeCalls: number;
  interested: number;
  followUps: number;
  waShares: number;
  completions: number;
}

// ─── Reusable metrics table ───────────────────────────────────────────────────
const MetricsTable: React.FC<{
  rows: EmployeeStat[];
  loading: boolean;
  emptyMessage?: string;
}> = ({ rows, loading, emptyMessage = 'No data available.' }) => (
  <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50">
          <TableHead className="min-w-[140px] text-xs font-bold uppercase text-slate-500">Employee</TableHead>
          <TableHead className="text-xs font-bold uppercase text-slate-500">Assigned</TableHead>
          <TableHead className="text-xs font-bold uppercase text-orange-500">Dialed</TableHead>
          <TableHead className="text-xs font-bold uppercase text-blue-500">Genuine</TableHead>
          <TableHead className="text-xs font-bold uppercase text-red-500">Fake</TableHead>
          <TableHead className="text-xs font-bold uppercase text-purple-500">Interested</TableHead>
          <TableHead className="text-xs font-bold uppercase text-teal-500">Follow-up</TableHead>
          <TableHead className="text-xs font-bold uppercase text-slate-500">WhatsApp</TableHead>
          <TableHead className="text-xs font-bold uppercase text-emerald-500">Completions</TableHead>
          <TableHead className="text-right text-xs font-bold uppercase text-slate-500">Ratio</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={10} className="text-center py-10 text-slate-400">
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                Loading...
              </div>
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={10} className="text-center py-10 text-slate-400 italic">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : rows.map(row => (
          <TableRow key={row.id} className="hover:bg-slate-50/70 transition-colors">
            <TableCell className="font-semibold text-slate-800">
              {row.name}
              {row.role === 'field_boy' && (
                <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full uppercase font-bold">FB</span>
              )}
            </TableCell>
            <TableCell className="text-slate-600">{row.totalAssigned}</TableCell>
            <TableCell className="text-orange-600 font-bold">{row.dialed}</TableCell>
            <TableCell className="text-blue-600 font-semibold">{row.genuineCalls}</TableCell>
            <TableCell className="text-red-500">{row.fakeCalls}</TableCell>
            <TableCell className="text-purple-600 font-semibold">{row.interested}</TableCell>
            <TableCell className="text-teal-600 font-semibold">{row.followUps}</TableCell>
            <TableCell className="text-slate-600">{row.waShares}</TableCell>
            <TableCell>
              <span className={`font-bold ${row.completions > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                {row.completions}
                {row.completions > 0 && <span className="ml-1">🏆</span>}
              </span>
            </TableCell>
            <TableCell className="text-right font-mono text-xs text-slate-600">
              {row.totalAssigned > 0
                ? `${((row.completions / row.totalAssigned) * 100).toFixed(1)}%`
                : '0%'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
const ReportsPage: React.FC = () => {
  const [allTimeStats, setAllTimeStats]   = useState<EmployeeStat[]>([]);
  const [todayStats,   setTodayStats]     = useState<EmployeeStat[]>([]);
  const [loading,      setLoading]        = useState(true);
  const [search,       setSearch]         = useState('');

  const today = new Date().toISOString().split('T')[0]; // "2026-05-21"

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      // ── Fetch all data in parallel ──────────────────────────────────────────
      const [
        { data: users,   error: uErr },
        { data: leads,   error: lErr },
        { data: calls,   error: cErr },
        { data: wa,      error: wErr },
      ] = await Promise.all([
        supabase.from('user_profiles').select('id,name,role').eq('is_active', true),
        supabase.from('leads').select('id,status,assigned_to,created_date,completed_date,last_call_date'),
        supabase.from('call_attempts').select('id,fake_call,user_id,lead_id,created_at'),
        supabase.from('whatsapp_messages').select('id,user_id,created_at'),
      ]);

      if (uErr) throw uErr;
      if (lErr) throw lErr;

      const freshLeadIds = new Set((leads||[]).filter((l:any) => l.status === 'Fresh').map((l:any) => l.id));

      // Today's date prefix for filtering
      const todayLeadIds = new Set(
        (leads||[])
          .filter((l:any) => {
            const d = l.last_call_date || l.created_date || '';
            return d.startsWith(today);
          })
          .map((l:any) => l.id)
      );
      const todayCallIds = (calls||[]).filter((c:any) => c.created_at?.startsWith(today));
      const todayWAIds   = (wa||[]).filter((w:any) => w.created_at?.startsWith(today));

      // ── Build stats for each user ───────────────────────────────────────────
      const buildStats = (
        filterToday: boolean,
        leadsPool: any[],
        callsPool: any[],
        waPool: any[]
      ): EmployeeStat[] => {
        return (users||[]).map((u: any) => {
          const myLeads  = leadsPool.filter((l:any) => l.assigned_to === u.id);
          const myCalls  = callsPool.filter((c:any) => c.user_id === u.id);
          const myWA     = waPool.filter((w:any) => w.user_id === u.id);

          return {
            id:            u.id,
            name:          u.name,
            role:          u.role,
            totalAssigned: myLeads.length,
            dialed:        (calls||[]).filter((c:any) => c.user_id === u.id && !freshLeadIds.has(c.lead_id) && (!filterToday || c.created_at?.startsWith(today))).length,
            genuineCalls:  myCalls.filter((c:any) => !c.fake_call).length,
            fakeCalls:     myCalls.filter((c:any) => c.fake_call).length,
            interested:    myLeads.filter((l:any) => l.status === 'Interested').length,
            followUps:     myLeads.filter((l:any) => l.status === 'Follow-up').length,
            waShares:      myWA.length,
            completions:   myLeads.filter((l:any) => l.status === 'Complete').length,
          };
        });
      };

      // All-time: full pool
      const allTime = buildStats(false, leads||[], calls||[], wa||[]);

      // Today: filter each pool to today only
      const todayLeadsPool = (leads||[]).filter((l:any) => {
        const d = l.last_call_date || l.completed_date || l.created_date || '';
        return d.startsWith(today);
      });
      const todayData = buildStats(true, todayLeadsPool, todayCallIds, todayWAIds);

      // Only show employees who have any activity today
      const activeTodayStats = todayData.filter(r =>
        r.dialed > 0 || r.genuineCalls > 0 || r.fakeCalls > 0 ||
        r.completions > 0 || r.interested > 0 || r.waShares > 0
      );

      setAllTimeStats(allTime);
      setTodayStats(activeTodayStats);
    } catch (e: any) {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const filtered = (data: EmployeeStat[]) =>
    data.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  const totalShares      = allTimeStats.reduce((a, r) => a + r.waShares, 0);
  const totalCompletions = allTimeStats.reduce((a, r) => a + r.completions, 0);
  const todayCompletions = todayStats.reduce((a, r) => a + r.completions, 0);
  const todayDialed      = todayStats.reduce((a, r) => a + r.dialed, 0);

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <h1 className="text-2xl font-bold">Performance Reports</h1>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employee..."
              className="pl-9 w-full"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={fetchReports}>Refresh</Button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50/50 border-blue-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-blue-600">Total Shares</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalShares}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Share2 className="h-3 w-3" /> All-time WhatsApp shares
            </p>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50/50 border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-emerald-600">Total Completions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalCompletions}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <CheckCircle2 className="h-3 w-3" /> All-time closed sales
            </p>
          </CardContent>
        </Card>

        <Card className="bg-orange-50/50 border-orange-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-orange-600">Today's Calls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayDialed}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" /> Dialed today
            </p>
          </CardContent>
        </Card>

        <Card className="bg-purple-50/50 border-purple-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-purple-600">Today's Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayCompletions}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <CheckCircle2 className="h-3 w-3" /> Closed today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════════
          TODAY'S PERFORMANCE  (top)
      ══════════════════════════════════════════ */}
      <Card className="border-orange-200 shadow-sm">
        <CardHeader className="border-b border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-orange-800">
                <Clock className="h-5 w-5 text-orange-500" />
                Today's Performance
              </CardTitle>
              <CardDescription className="text-orange-600/70 mt-0.5">
                Detailed breakdown of call activity and conversion — Today
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-white border-orange-200 text-orange-700 font-semibold px-3 py-1">
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              {format(new Date(), 'dd MMM yyyy')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <MetricsTable
            rows={filtered(todayStats)}
            loading={loading}
            emptyMessage="No activity recorded today — check back after your team starts making calls."
          />
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════
          ALL-TIME / OVERALL  (bottom)
      ══════════════════════════════════════════ */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="flex items-center gap-2 text-slate-800">
            Employee Metrics
          </CardTitle>
          <CardDescription>
            Detailed breakdown of call activity and conversion — All time
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <MetricsTable
            rows={filtered(allTimeStats)}
            loading={loading}
            emptyMessage="No data available yet."
          />
        </CardContent>
      </Card>

    </div>
  );
};

export default ReportsPage;
