import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  Download, 
  Search, 
  Share2, 
  PhoneCall, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';
import { toast } from 'sonner';

const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { isSupabaseConfigured } = await import('@/lib/supabase');
      if (!isSupabaseConfigured) {
        setReports([
          { id: '1', name: 'Amit Kumar', role: 'employee', totalAssigned: 45, genuineCalls: 40, fakeCalls: 2, completions: 15, waShares: 10 },
          { id: '2', name: 'Rajesh M.', role: 'employee', totalAssigned: 60, genuineCalls: 55, fakeCalls: 0, completions: 22, waShares: 20 },
          { id: '3', name: 'Suresh', role: 'field_boy', totalAssigned: 30, genuineCalls: 25, fakeCalls: 1, completions: 10, waShares: 5 },
        ]);
        return;
      }

      const { data: users, error: usersError } = await supabase
        .from('user_profiles').select('id,name,role').eq('is_active', true);
      if (usersError) throw usersError;

      const { data: allLeads } = await supabase.from('leads').select('id,status,assigned_to');
      const { data: allCalls } = await supabase.from('call_attempts').select('id,fake_call,user_id');
      const { data: allWA } = await supabase.from('whatsapp_messages').select('id,user_id');

      const stats = (users||[]).map((u: any) => ({
        id: u.id, name: u.name, role: u.role,
        totalAssigned: (allLeads||[]).filter((l:any)=>l.assigned_to===u.id).length,
        genuineCalls: (allCalls||[]).filter((c:any)=>c.user_id===u.id&&!c.fake_call).length,
        fakeCalls: (allCalls||[]).filter((c:any)=>c.user_id===u.id&&c.fake_call).length,
        completions: (allLeads||[]).filter((l:any)=>l.assigned_to===u.id&&l.status==='Complete').length,
        waShares: (allWA||[]).filter((w:any)=>w.user_id===u.id).length
      }));

      setReports(stats);
    } catch (error: any) {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = reports.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <h1 className="text-2xl font-bold">Performance Reports</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search employee..." 
              className="pl-9 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={fetchReports} className="w-full sm:w-auto">
             Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-blue-600">Total Shares</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-3xl font-bold">{reports.reduce((acc, r) => acc + r.waShares, 0)}</div>
             <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Share2 className="h-3 w-3" /> WhatsApp Lead Form shares
             </p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-emerald-600">Total completions</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-3xl font-bold">{reports.reduce((acc, r) => acc + r.completions, 0)}</div>
             <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <CheckCircle2 className="h-3 w-3" /> Successfully closed sales
             </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employee Metrics</CardTitle>
          <CardDescription>Detailed breakdown of call activity and conversion</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Employee</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Genuine</TableHead>
                  <TableHead>Fake</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Completions</TableHead>
                  <TableHead className="text-right">Ratio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10">Loading metrics...</TableCell></TableRow>
                ) : filteredReports.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.totalAssigned}</TableCell>
                    <TableCell className="text-blue-600 font-semibold">{row.genuineCalls}</TableCell>
                    <TableCell className="text-red-500">{row.fakeCalls}</TableCell>
                    <TableCell>{row.waShares}</TableCell>
                    <TableCell className="text-emerald-600 font-bold">{row.completions}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {row.totalAssigned > 0 
                        ? ((row.completions / row.totalAssigned) * 100).toFixed(1)
                        : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsPage;
