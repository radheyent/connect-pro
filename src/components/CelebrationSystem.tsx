import React, { useEffect, useState, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { X, Star, Zap, Trophy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { showNativeNotification } from '@/lib/pushNotifications';

// ── Types ────────────────────────────────────────────────────────────────────
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

// ── Confetti burst helper ────────────────────────────────────────────────────
const fireCelebration = () => {
  const fire = (ratio: number, opts: confetti.Options) =>
    confetti({ origin: { y: 0.6 }, particleCount: Math.floor(200 * ratio), ...opts });
  fire(0.25, { spread: 26, startVelocity: 55, colors: ['#22c55e', '#3b82f6'] });
  fire(0.20, { spread: 60, colors: ['#f59e0b', '#ec4899'] });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ['#a855f7', '#22d3ee'] });
  fire(0.10, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.10, { spread: 120, startVelocity: 45, colors: ['#facc15', '#f97316'] });
};

// ── Celebration Overlay ──────────────────────────────────────────────────────
const CelebrationOverlay: React.FC<{ data: CelebrationData; onClose: () => void }> = ({ data, onClose }) => {
  useEffect(() => {
    fireCelebration();
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-sm"
      style={{ animation: 'fadeInOut 6s ease forwards' }}>
      <div className="bg-white rounded-3xl shadow-2xl border-2 border-yellow-300 p-8 max-w-sm w-full mx-4 text-center relative"
        style={{ animation: 'bounceIn 0.6s cubic-bezier(0.36,0.07,0.19,0.97) both' }}>
        <button onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors">
          <X className="h-5 w-5" />
        </button>
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
          just closed&nbsp;<span className="font-semibold text-slate-800">"{data.leadName}"</span>
        </p>
        <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl py-3 px-4 border border-green-100">
          <Zap className="h-4 w-4 text-green-500 shrink-0" />
          <span className="text-green-700 text-sm font-semibold">Keep the momentum going! 🚀</span>
        </div>
        <div className="mt-4 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full" style={{ animation: 'shrink 6s linear forwards' }} />
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

// ── Recent Activity Panel ─────────────────────────────────────────────────────
// Cached to avoid re-fetching on every bell open
let activityCache: ActivityItem[] = [];
let activityCacheTime = 0;
const CACHE_TTL = 30_000; // 30 seconds

// Tracks which lead IDs we've already fired a "Sale Closed" push for, so that
// unrelated edits to an already-Complete lead (notes, admin edits, etc.) don't
// keep re-triggering the notification and draining battery.
const notifiedSaleIds = new Set<string>();
const notifiedAnnouncementIds = new Set<string>();

export const RecentActivityPanel: React.FC = () => {
  const { user, profile } = useAuth();
  const [items, setItems]   = useState<ActivityItem[]>(activityCache);
  const [loading, setLoading] = useState(activityCache.length === 0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!user || !profile) { setLoading(false); return; }

    // Use cache if fresh
    const now = Date.now();
    if (activityCache.length > 0 && (now - activityCacheTime) < CACHE_TTL) {
      setItems(activityCache);
      setLoading(false);
      return;
    }

    const load = async () => {
      if (!mountedRef.current) return;
      try {
        const activityItems: ActivityItem[] = [];

        // Sales, announcements, and my last call — 3 parallel queries
        const [salesRes, annRes, callRes] = await Promise.all([
          supabase.from('leads').select('id,name,assigned_to,completed_date,last_call_date')
            .eq('status', 'Complete').order('last_call_date', { ascending: false }).limit(4),
          supabase.from('announcements').select('id,title,created_at')
            .order('created_at', { ascending: false }).limit(3),
          supabase.from('call_attempts').select('id,lead_id,created_at,duration_seconds')
            .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
        ]);

        // Enrich sales with employee names (single batch query)
        if (salesRes.data?.length) {
          const ids = [...new Set(salesRes.data.map((s: any) => s.assigned_to).filter(Boolean))];
          const empMap: Record<string, string> = {};
          if (ids.length) {
            const { data: emps } = await supabase.from('user_profiles').select('id,name').in('id', ids);
            (emps || []).forEach((e: any) => { empMap[e.id] = e.name; });
          }
          salesRes.data.forEach((s: any) => {
            const empName = empMap[s.assigned_to] || 'Someone';
            const isMine  = s.assigned_to === user.id;
            activityItems.push({
              id: `s-${s.id}`, type: 'sale',
              title: isMine
                ? `🏆 You closed a sale! Well Done ${profile.name}!`
                : `🏆 ${empName} closed a sale!`,
              subtitle: `Customer: ${s.name}`,
              time: s.completed_date || s.last_call_date || '',
            });
          });
        }

        (annRes.data || []).forEach((a: any) => {
          activityItems.push({
            id: `a-${a.id}`, type: 'announcement',
            title: `📢 Admin made an announcement`,
            subtitle: a.title, time: a.created_at,
          });
        });

        // Native notification for brand-new announcements (fires only once via seenAnnouncementIds below)

        // Last call
        if (callRes.data?.length) {
          const c = callRes.data[0];
          const { data: lead } = await supabase.from('leads').select('name,phone').eq('id', c.lead_id).single();
          if (lead) {
            activityItems.push({
              id: `c-${c.id}`, type: 'call',
              title: `📞 You last called ${lead.name}`,
              subtitle: `${lead.phone} • ${c.duration_seconds || 0}s`,
              time: c.created_at,
            });
          }
        }

        const sorted = activityItems
          .filter(i => i.time)
          .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
          .slice(0, 5);

        activityCache     = sorted;
        activityCacheTime = Date.now();

        if (mountedRef.current) { setItems(sorted); setLoading(false); }
      } catch (e) {
        console.error('Activity panel error:', e);
        if (mountedRef.current) setLoading(false);
      }
    };

    setLoading(true);
    load();

    // Realtime — invalidate cache on new events (no poll to save battery)
    const ch = supabase.channel(`ra-panel-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads', filter: 'status=eq.Complete' }, (p) => {
        if (p.new?.status === 'Complete' && p.old?.status !== 'Complete') {
          activityCacheTime = 0; load();
          if (p.new?.assigned_to === user.id && !notifiedSaleIds.has(p.new.id)) {
            notifiedSaleIds.add(p.new.id);
            const destUrl = profile.role === 'admin' ? '/admin/leads' : '/employee/leads';
            showNativeNotification('🏆 Sale Closed!', `Well done ${profile.name}! You closed "${p.new?.name || 'a lead'}"`, { url: destUrl, tag: `sale-${p.new?.id}` });
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, (p) => {
        activityCacheTime = 0; load();
        if (notifiedAnnouncementIds.has(p.new?.id)) return;
        notifiedAnnouncementIds.add(p.new?.id);
        const annTitle = p.new?.title || 'New Announcement';
        const annBody = p.new?.content || 'Tap to view the announcement';
        showNativeNotification(`📢 ${annTitle}`, annBody, { url: '/announcements', tag: `ann-${p.new?.id}` });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_attempts' }, () => { activityCacheTime = 0; load(); })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user?.id, profile?.id]); // eslint-disable-line

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
    </div>
  );

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {items.map(item => (
        <div key={item.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
          item.type === 'sale'         ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-100'
          : item.type === 'announcement' ? 'bg-gradient-to-r from-blue-50 to-sky-50 border-blue-100'
          : 'bg-gradient-to-r from-slate-50 to-gray-50 border-slate-100'
        }`}>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-bold ${
              item.type === 'sale'         ? 'text-green-800'
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

// ── Global Celebration Listener ──────────────────────────────────────────────
// Only runs for non-admin users. Uses realtime only (no polling) to save battery.
const CelebrationSystem: React.FC = () => {
  const { profile } = useAuth();
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const handleClose = useCallback(() => setCelebration(null), []);

  useEffect(() => {
    if (!profile || profile.role === 'admin') return;

    const channel = supabase.channel(`celebrate-${profile.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads', filter: 'status=eq.Complete' },
        async (payload) => {
          const newLead = payload.new as any;
          const oldLead = payload.old as any;
          if (newLead?.status !== 'Complete' || oldLead?.status === 'Complete') return;
          if (seenIds.current.has(newLead.id)) return;
          seenIds.current.add(newLead.id);

          let empName = 'Someone';
          if (newLead.assigned_to) {
            const { data } = await supabase
              .from('user_profiles').select('name').eq('id', newLead.assigned_to).single();
            if (data) empName = data.name;
          }
          setCelebration({ uid: newLead.id, employeeName: empName, leadName: newLead.name });
          if (newLead.assigned_to !== profile.id) {
            const destUrl = profile.role === 'admin' ? '/admin/leads' : '/employee/leads';
            showNativeNotification('🏆 Team Update', `${empName} closed a sale: "${newLead.name}"`, { url: destUrl, tag: `team-sale-${newLead.id}` });
          }
        }
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]); // eslint-disable-line

  if (!celebration) return null;
  return <CelebrationOverlay data={celebration} onClose={handleClose} />;
};

export default CelebrationSystem;
