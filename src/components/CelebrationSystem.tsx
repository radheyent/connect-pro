import React, { useEffect, useState, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { X, Star, Zap, Trophy, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ActivityItem {
  id: string;
  type: 'sale' | 'announcement' | 'call';
  title: string;
  subtitle: string;
  time: string;
}
interface CelebrationData {
  uid: string;
  employeeName: string;
  leadName: string;
}

// ─── Confetti burst helper ────────────────────────────────────────────────────
const fireCelebration = () => {
  const fire = (ratio: number, opts: confetti.Options) =>
    confetti({ origin: { y: 0.6 }, particleCount: Math.floor(200 * ratio), ...opts });
  fire(0.25, { spread: 26, startVelocity: 55, colors: ['#22c55e', '#3b82f6'] });
  fire(0.20, { spread: 60, colors: ['#f59e0b', '#ec4899'] });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ['#a855f7', '#22d3ee'] });
  fire(0.10, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.10, { spread: 120, startVelocity: 45, colors: ['#facc15', '#f97316'] });
};

// ─── Celebration Overlay ──────────────────────────────────────────────────────
const CelebrationOverlay: React.FC<{ data: CelebrationData; onClose: () => void }> = ({ data, onClose }) => {
  useEffect(() => {
    fireCelebration();
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-sm"
      style={{ animation: 'fadeInOut 6s ease forwards' }}>
      <div className="bg-white rounded-3xl shadow-2xl border-2 border-yellow-300 p-8 max-w-sm w-full mx-4 text-center relative"
        style={{ animation: 'bounceIn 0.6s cubic-bezier(0.36,0.07,0.19,0.97) both' }}>
        <button onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors">
          <X className="h-5 w-5" />
        </button>

        {/* Animated stars */}
        <div className="flex justify-center gap-1 mb-3">
          {[0,1,2,3,4].map(i => (
            <Star key={i} className="h-5 w-5 text-yellow-400 fill-yellow-400"
              style={{ animation: `starPop 0.4s ${i * 0.08}s ease both` }} />
          ))}
        </div>

        <div className="text-6xl mb-3" style={{ animation: 'pulse 1s infinite' }}>🏆</div>

        <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-1">SALE CLOSED!</h2>

        <p className="text-blue-600 font-bold text-xl mb-1">{data.employeeName}</p>
        <p className="text-slate-500 text-sm mb-4">
          just closed&nbsp;
          <span className="font-semibold text-slate-800">"{data.leadName}"</span>
        </p>

        <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl py-3 px-4 border border-green-100">
          <Zap className="h-4 w-4 text-green-500 shrink-0" />
          <span className="text-green-700 text-sm font-semibold">Keep the momentum going! 🚀</span>
        </div>

        {/* Progress bar auto-close */}
        <div className="mt-4 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full"
            style={{ animation: 'shrink 6s linear forwards' }} />
        </div>
      </div>

      <style>{`
        @keyframes bounceIn {
          0%   { transform: scale(0.3) translateY(60px); opacity: 0; }
          50%  { transform: scale(1.08); opacity: 1; }
          70%  { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
        @keyframes fadeInOut {
          0%   { opacity: 0; }
          8%   { opacity: 1; }
          82%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes starPop {
          0%   { transform: scale(0) rotate(-40deg); opacity: 0; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
};

// ─── Recent Activity Panel ────────────────────────────────────────────────────
export const RecentActivityPanel: React.FC = () => {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !profile) { setLoading(false); return; }
    setLoading(true);

    const load = async () => {
      try {
        const activityItems: ActivityItem[] = [];

        // TYPE 1: Last 4 completed sales
        const { data: sales } = await supabase
          .from('leads')
          .select('id, name, assigned_to, completed_date, last_call_date')
          .eq('status', 'Complete')
          .order('last_call_date', { ascending: false })
          .limit(4);

        if (sales && sales.length > 0) {
          const ids = [...new Set(sales.map((s: any) => s.assigned_to).filter(Boolean))];
          const empMap: Record<string, string> = {};
          if (ids.length) {
            const { data: emps } = await supabase.from('user_profiles').select('id,name').in('id', ids);
            (emps || []).forEach((e: any) => { empMap[e.id] = e.name; });
          }
          sales.forEach((s: any) => {
            const empName = empMap[s.assigned_to] || 'Someone';
            const isMine = s.assigned_to === user.id;
            activityItems.push({
              id: `s-${s.id}`, type: 'sale',
              title: isMine
                ? `🏆 You closed a sale! Well Done ${profile.name}!`
                : `🏆 ${empName} closed a sale! Well Done ${empName}!`,
              subtitle: `Customer: ${s.name}`,
              time: s.completed_date || s.last_call_date || s.id,
            });
          });
        }

        // TYPE 2: Last 4 announcements
        const { data: anns } = await supabase
          .from('announcements').select('id, title, created_at')
          .order('created_at', { ascending: false }).limit(4);
        (anns || []).forEach((a: any) => {
          activityItems.push({
            id: `a-${a.id}`, type: 'announcement',
            title: `📢 Admin made an announcement`,
            subtitle: a.title,
            time: a.created_at,
          });
        });

        // TYPE 3: Your most recent call (always 1, always shown)
        const { data: myCall } = await supabase
          .from('call_attempts').select('id, lead_id, created_at, duration_seconds')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }).limit(1);
        if (myCall && myCall.length > 0) {
          const c = myCall[0];
          const { data: lead } = await supabase.from('leads').select('name, phone').eq('id', c.lead_id).single();
          if (lead) {
            activityItems.push({
              id: `c-${c.id}`, type: 'call',
              title: `📞 You last called ${lead.name}`,
              subtitle: `${lead.phone} • ${c.duration_seconds || 0}s`,
              time: c.created_at,
            });
          }
        }

        // Sort by time, keep 5 (last call always in because it has its own slot)
        const sorted = activityItems
          .filter(i => i.time)
          .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
          .slice(0, 5);

        setItems(sorted);
      } catch (e) {
        console.error('Activity:', e);
      } finally {
        setLoading(false);
      }
    };

    load();

    // Single combined realtime channel + 60s poll (saves battery/memory)
    const uid = user.id;
    const ch = supabase.channel(`ra-${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' },
        (p) => { if (p.new?.status === 'Complete') load(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_attempts' }, load)
      .subscribe();
    const poll = setInterval(load, 60000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [user?.id, profile?.id]);

  if (loading) return (
    <div className="space-y-2 p-1">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
      ))}
    </div>
  );

  if (!items.length) return (
    <div className="text-center py-8">
      <Trophy className="h-8 w-8 text-slate-300 mx-auto mb-2" />
      <p className="text-slate-400 text-sm">No recent activity yet</p>
      <p className="text-slate-300 text-xs mt-1">Start making calls to see activity here</p>
    </div>
  );

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {items.map(item => (
        <div key={item.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
          item.type === 'sale' ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-100'
          : item.type === 'announcement' ? 'bg-gradient-to-r from-blue-50 to-sky-50 border-blue-100'
          : 'bg-gradient-to-r from-slate-50 to-gray-50 border-slate-100'
        }`}>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-bold ${
              item.type === 'sale' ? 'text-green-800'
              : item.type === 'announcement' ? 'text-blue-800'
              : 'text-slate-700'
            }`}>{item.title}</p>
            <p className="text-xs text-slate-500 truncate mt-0.5">{item.subtitle}</p>
          </div>
          <span className="text-[10px] text-slate-400 shrink-0 mt-0.5 whitespace-nowrap">
            {item.time ? formatDistanceToNow(new Date(item.time), { addSuffix: true }) : ''}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── Global Celebration Listener ─────────────────────────────────────────────
const CelebrationSystem: React.FC = () => {
  const { profile } = useAuth();
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const lastChecked = useRef<string>(new Date().toISOString());

  const checkNewSales = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('leads')
        .select('id, name, assigned_to, completed_date')
        .eq('status', 'Complete')
        .gte('last_call_date', lastChecked.current)
        .order('completed_date', { ascending: false })
        .limit(5);

      lastChecked.current = new Date().toISOString();

      if (!data || data.length === 0) return;

      for (const lead of data) {
        if (seenIds.current.has(lead.id)) continue;
        seenIds.current.add(lead.id);

        // Get employee name
        let empName = 'Someone';
        if (lead.assigned_to) {
          const { data: emp } = await supabase
            .from('user_profiles').select('name').eq('id', lead.assigned_to).single();
          if (emp) empName = emp.name;
        }

        setCelebration({ uid: lead.id, employeeName: empName, leadName: lead.name });
        break; // one at a time
      }
    } catch (e) {
      console.error('Sale check error:', e);
    }
  }, []);

  useEffect(() => {
    if (!profile || profile.role === 'admin') return;

    // Realtime — primary method
    const channel = supabase.channel(`celebrate-${profile.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        async (payload) => {
          const newLead = payload.new as any;
          const oldLead = payload.old as any;
          // Only trigger when status CHANGES to Complete
          if (newLead?.status === 'Complete' && oldLead?.status !== 'Complete') {
            if (seenIds.current.has(newLead.id)) return;
            seenIds.current.add(newLead.id);

            let empName = 'Someone';
            if (newLead.assigned_to) {
              const { data } = await supabase
                .from('user_profiles').select('name').eq('id', newLead.assigned_to).single();
              if (data) empName = data.name;
            }
            setCelebration({ uid: newLead.id, employeeName: empName, leadName: newLead.name });
          }
        }
      ).subscribe();

    // Polling fallback every 20s (in case realtime misses)
    const poll = setInterval(checkNewSales, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [profile, checkNewSales]);

  if (!celebration) return null;

  return (
    <CelebrationOverlay
      data={celebration}
      onClose={() => setCelebration(null)}
    />
  );
};

export default CelebrationSystem;
