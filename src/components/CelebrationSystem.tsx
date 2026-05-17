import React, { useEffect, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Trophy, Megaphone, X, Star, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────
interface ActivityItem {
  id: string;
  type: 'sale' | 'announcement';
  title: string;
  subtitle: string;
  time: string;
  emoji: string;
}

interface CelebrationToast {
  id: string;
  employeeName: string;
  leadName: string;
}

// ─── Big celebration overlay ──────────────────────────────────
const CelebrationOverlay: React.FC<{ item: CelebrationToast; onClose: () => void }> = ({ item, onClose }) => {
  useEffect(() => {
    // Confetti burst
    const fire = (particleRatio: number, opts: any) => {
      confetti({
        origin: { y: 0.7 },
        ...opts,
        particleCount: Math.floor(200 * particleRatio),
      });
    };
    fire(0.25, { spread: 26, startVelocity: 55, colors: ['#22c55e', '#3b82f6'] });
    fire(0.2,  { spread: 60, colors: ['#f59e0b', '#ec4899'] });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ['#a855f7', '#22d3ee'] });
    fire(0.1,  { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1,  { spread: 120, startVelocity: 45, colors: ['#facc15', '#f97316'] });

    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      style={{ animation: 'fadeInOut 5s ease-in-out forwards' }}
    >
      <div
        className="pointer-events-auto bg-white rounded-2xl shadow-2xl border-2 border-yellow-300 p-8 max-w-sm w-full mx-4 text-center relative"
        style={{ animation: 'bounceIn 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97)' }}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>

        {/* Stars */}
        <div className="flex justify-center gap-1 mb-3">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-5 w-5 text-yellow-400 fill-yellow-400" style={{ animation: `starPop 0.3s ${i * 0.1}s ease both` }} />
          ))}
        </div>

        <div className="text-5xl mb-3">🏆</div>
        <h2 className="text-2xl font-black text-slate-900 mb-1">SALE CLOSED!</h2>
        <p className="text-blue-600 font-bold text-lg mb-1">{item.employeeName}</p>
        <p className="text-slate-500 text-sm">just closed <span className="font-semibold text-slate-700">{item.leadName}</span></p>

        <div className="mt-4 flex items-center justify-center gap-2 bg-green-50 rounded-xl py-2 px-4">
          <Zap className="h-4 w-4 text-green-500" />
          <span className="text-green-700 text-sm font-semibold">Keep the momentum going! 🚀</span>
        </div>
      </div>

      <style>{`
        @keyframes bounceIn {
          0% { transform: scale(0.3) translateY(50px); opacity: 0; }
          50% { transform: scale(1.05); opacity: 1; }
          70% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        @keyframes fadeInOut {
          0% { opacity: 0; }
          10% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes starPop {
          0% { transform: scale(0) rotate(-30deg); opacity: 0; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

// ─── Recent Activity Panel ────────────────────────────────────
export const RecentActivityPanel: React.FC = () => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    try {
      // Last 5 completed leads
      const { data: sales } = await supabase
        .from('leads')
        .select('id, name, assigned_to, completed_date')
        .eq('status', 'Complete')
        .order('completed_date', { ascending: false })
        .limit(5);

      // Get employee names
      const assignedIds = [...new Set((sales || []).map((s: any) => s.assigned_to).filter(Boolean))];
      let empMap: Record<string, string> = {};
      if (assignedIds.length > 0) {
        const { data: emps } = await supabase.from('user_profiles').select('id,name').in('id', assignedIds);
        (emps || []).forEach((e: any) => { empMap[e.id] = e.name; });
      }

      // Last 5 announcements
      const { data: announcements } = await supabase
        .from('announcements')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      // Merge and sort
      const saleItems: ActivityItem[] = (sales || []).map((s: any) => ({
        id: `sale-${s.id}`,
        type: 'sale' as const,
        title: `${empMap[s.assigned_to] || 'Employee'} closed a sale!`,
        subtitle: s.name,
        time: s.completed_date || '',
        emoji: '🏆',
      }));

      const annItems: ActivityItem[] = (announcements || []).map((a: any) => ({
        id: `ann-${a.id}`,
        type: 'announcement' as const,
        title: 'New Announcement',
        subtitle: a.title,
        time: a.created_at,
        emoji: '📢',
      }));

      const merged = [...saleItems, ...annItems]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 5);

      setActivities(merged);
    } catch (e) {
      console.error('Activity fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();

    // Real-time: refresh when leads or announcements change
    const leadsChannel = supabase.channel('activity-leads')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, fetchActivity)
      .subscribe();
    const annChannel = supabase.channel('activity-ann')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, fetchActivity)
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(annChannel);
    };
  }, [fetchActivity]);

  if (loading) return (
    <div className="space-y-2 p-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );

  if (activities.length === 0) return (
    <div className="text-center py-6 text-slate-400 text-sm">No recent activity yet</div>
  );

  return (
    <div className="space-y-2">
      {activities.map((item) => (
        <div key={item.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
          item.type === 'sale'
            ? 'bg-green-50 border-green-100'
            : 'bg-blue-50 border-blue-100'
        }`}>
          <span className="text-xl leading-none mt-0.5">{item.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-bold truncate ${item.type === 'sale' ? 'text-green-800' : 'text-blue-800'}`}>
              {item.title}
            </p>
            <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
          </div>
          <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">
            {item.time ? format(new Date(item.time), 'HH:mm') : ''}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── Main system — mounts globally in DashboardLayout ─────────
const CelebrationSystem: React.FC = () => {
  const { profile } = useAuth();
  const [celebration, setCelebration] = useState<CelebrationToast | null>(null);

  useEffect(() => {
    if (!profile) return;

    // Listen for any lead status → Complete
    const channel = supabase.channel('global-sales')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads', filter: 'status=eq.Complete' },
        async (payload: any) => {
          const lead = payload.new;
          if (!lead || lead.status !== 'Complete') return;

          // Get employee name
          let empName = 'Someone';
          if (lead.assigned_to) {
            const { data } = await supabase
              .from('user_profiles').select('name').eq('id', lead.assigned_to).single();
            if (data) empName = data.name;
          }

          // Show celebration to everyone (except if they are the one who completed it — they already see confetti)
          setCelebration({ id: lead.id, employeeName: empName, leadName: lead.name });

          // Also show toast for admins quietly
          if (profile.role === 'admin') {
            toast.success(`🏆 ${empName} closed ${lead.name}!`, { duration: 4000 });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  if (!celebration) return null;

  return (
    <CelebrationOverlay
      item={celebration}
      onClose={() => setCelebration(null)}
    />
  );
};

export default CelebrationSystem;
