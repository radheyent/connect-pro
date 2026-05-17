import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Users, 
  UserPlus, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  ArrowUpRight,
  PhoneCall,
  Clock
} from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalLeads: 0,
    completedLeads: 0,
    activeEmployees: 0,
    totalCalls: 0,
    fakeCalls: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [employeePerformance, setEmployeePerformance] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Basic counts
      const { count: leadsCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
      const { count: completedCount } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'Complete');
      const { count: employeesCount } = await supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('role', 'employee').eq('is_active', true);
      const { count: callsCount } = await supabase.from('call_attempts').select('*', { count: 'exact', head: true });
      const { count: fakeCallsCount } = await supabase.from('call_attempts').select('*', { count: 'exact', head: true }).eq('fake_call', true);

      setStats({
        totalLeads: leadsCount || 0,
        completedLeads: completedCount || 0,
        activeEmployees: employeesCount || 0,
        totalCalls: callsCount || 0,
        fakeCalls: fakeCallsCount || 0
      });

      // Employee performance - separate queries (no reverse joins)
      const { data: emps } = await supabase.from('user_profiles').select('id,name').eq('role','employee');
      const { data: allL } = await supabase.from('leads').select('id,status,assigned_to');
      const { data: allC } = await supabase.from('call_attempts').select('id,fake_call,user_id');
      if (emps) {
        const perf = emps.map((emp:any) => {
          const eL = (allL||[]).filter((l:any)=>l.assigned_to===emp.id);
          const eC = (allC||[]).filter((c:any)=>c.user_id===emp.id);
          return { name: emp.name, leads: eL.length, completed: eL.filter((l:any)=>l.status==='Complete').length, genuine: eC.filter((c:any)=>!c.fake_call).length, fake: eC.filter((c:any)=>c.fake_call).length };
        });
        setEmployeePerformance(perf);
      }

      // Sample Chart Data
      // Real chart data: last 7 days from actual DB
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const today = new Date();
      const last7: any[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const start = new Date(d); start.setHours(0,0,0,0);
        const end   = new Date(d); end.setHours(23,59,59,999);
        last7.push({ label: days[d.getDay()], start: start.toISOString(), end: end.toISOString() });
      }

      const { data: allCalls7 } = await supabase
        .from('call_attempts').select('created_at, fake_call')
        .gte('created_at', last7[0].start).lte('created_at', last7[6].end);

      const { data: allComplete7 } = await supabase
        .from('leads').select('completed_date')
        .eq('status','Complete')
        .not('completed_date','is',null)
        .gte('completed_date', last7[0].start).lte('completed_date', last7[6].end);

      const chart = last7.map(day => ({
        name: day.label,
        calls: (allCalls7||[]).filter((c:any) => c.created_at >= day.start && c.created_at <= day.end && !c.fake_call).length,
        completions: (allComplete7||[]).filter((c:any) => c.completed_date >= day.start && c.completed_date <= day.end).length,
      }));
      setChartData(chart);

    } catch (error) {
      console.error('Stats error:', error);
    }
  };

  const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'];

  const pieData = [
    { name: 'Complete', value: stats.completedLeads },
    { name: 'Pending', value: stats.totalLeads - stats.completedLeads },
  ];

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Leads</p>
            <ArrowUpRight className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.totalLeads.toLocaleString()}</p>
          <p className="text-[10px] text-green-600 font-medium mt-1 uppercase tracking-tight">+12% from last month</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Genuine Calls</p>
            <PhoneCall className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{(stats.totalCalls - stats.fakeCalls).toLocaleString()}</p>
          <p className="text-[10px] text-blue-600 font-medium mt-1 uppercase tracking-tight">Verified engagement</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">Fake Calls (Alert)</p>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-600">{stats.fakeCalls.toLocaleString()}</p>
          <p className="text-[10px] text-red-400 font-medium mt-1 uppercase tracking-tight">Detected &lt; 5s duration</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Successful Closures</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.completedLeads.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-tight">Goal: 1,500</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Call Activity Chart */}
        <Card className="col-span-4 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/30 border-b border-slate-100 mb-6">
            <CardTitle className="text-slate-800">Call Activity vs Completions</CardTitle>
            <CardDescription className="text-slate-500">Performance trend for the current week</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }} 
                />
                <Legend iconType="circle" />
                <Bar dataKey="calls" name="Total Calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completions" name="Completions" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Lead Distribution */}
        <Card className="col-span-3 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/30 border-b border-slate-100 mb-6">
            <CardTitle className="text-slate-800">Lead Status</CardTitle>
            <CardDescription className="text-slate-500">Overview of lead completion</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f1f5f9" />
                </Pie>
                <RechartsTooltip />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Employee Performance Table */}
      <Card className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-700">Employee Performance</h3>
            <p className="text-xs text-slate-500">Real-time metrics per employee</p>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <th className="p-4 uppercase tracking-wider text-[10px]">Employee</th>
                  <th className="p-4 uppercase tracking-wider text-[10px]">Assigned</th>
                  <th className="p-4 uppercase tracking-wider text-[10px]">Genuine Calls</th>
                  <th className="p-4 uppercase tracking-wider text-[10px]">Fake Calls</th>
                  <th className="p-4 uppercase tracking-wider text-[10px]">Completions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employeePerformance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-400">No performance data yet.</td>
                  </tr>
                ) : (
                  employeePerformance.map((emp, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-medium text-slate-900">{emp.name}</td>
                      <td className="p-4 text-slate-600">{emp.leads}</td>
                      <td className="p-4 text-emerald-600 font-bold">{emp.genuine}</td>
                      <td className="p-4 text-red-500 italic font-medium">{emp.fake}</td>
                      <td className="p-4 text-slate-900 font-medium">{emp.completed}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
