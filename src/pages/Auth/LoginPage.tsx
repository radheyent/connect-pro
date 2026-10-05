/**
 * Connect Pro — Login Page (v2: "Living Network")
 * Path: src/pages/Auth/LoginPage.tsx
 *
 * No new npm dependencies. React + react-router-dom + lucide-react + Tailwind + Canvas 2D + CSS.
 * Fonts (Syne + Manrope) are loaded from Google Fonts via CSS @import — nothing to install.
 *
 * What is interactive:
 *  - Full-screen live network (canvas): nodes drift, connect, and pass glowing data packets.
 *  - Your cursor / finger becomes a node: nearby nodes link to it and are gently pulled toward it.
 *  - Tap / click anywhere → signal ripple.
 *  - Typing in the form raises the network's "energy" (more packets, faster flow).
 *  - Sign in → ripples pulse out of the card; success → full-screen burst, then redirect.
 *  - Card tilts in 3D and gets a light-following border on desktop.
 */
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

/* ================================================================== */
/* Network engine (canvas)                                             */
/* ================================================================== */

interface Signal {
  energy: number; // 0..1.4 — how "alive" the network is
  mode: 'idle' | 'loading' | 'success';
  burst: number; // increment to trigger a success burst
  ox: number; // origin (card center) in viewport px
  oy: number;
  pulse: number; // increment to trigger a single ripple from origin
}

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  z: number;
  glow: number;
};
type Packet = { a: number; b: number; t: number; s: number };
type Ripple = { x: number; y: number; r: number; max: number; a: number; delay: number };

function startNetwork(canvas: HTMLCanvasElement, sigRef: RefObject<Signal>): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 0;
  let h = 0;
  let linkD = 130;
  let ps: Particle[] = [];
  let packets: Packet[] = [];
  let ripples: Ripple[] = [];
  let raf = 0;
  let lastBurst = 0;
  let lastPulse = 0;
  let frameCount = 0;

  const ptr = { x: -9999, y: -9999, active: false, nx: 0, ny: 0, tx: 0, ty: 0 };
  let touchTimer = 0;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const small = w < 640;
    linkD = small ? 105 : 142;
    const count = Math.max(24, Math.min(small ? 48 : 100, Math.floor((w * h) / 15500)));
    ps = Array.from({ length: count }, () => {
      const z = Math.random();
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: 0.8 + z * 1.9,
        z,
        glow: 0,
      };
    });
    packets = [];
  };

  const neighbours = (i: number, pos: { x: number; y: number }[]) => {
    const out: number[] = [];
    const a = pos[i];
    for (let j = 0; j < pos.length; j++) {
      if (j === i) continue;
      const dx = a.x - pos[j].x;
      const dy = a.y - pos[j].y;
      if (dx * dx + dy * dy < linkD * linkD) out.push(j);
    }
    return out;
  };

  const spawnRipple = (x: number, y: number, max = 240, delay = 0) => {
    if (ripples.length < 14) ripples.push({ x, y, r: 6, max, a: 1, delay });
  };

  const frame = () => {
    if (!reduce) raf = requestAnimationFrame(frame);
    frameCount++;
    const s = sigRef.current;
    if (!s) return;

    /* energy eases toward a base level for the current mode */
    const base = s.mode === 'idle' ? 0.22 : s.mode === 'loading' ? 0.85 : 1.0;
    s.energy += (base - s.energy) * 0.03;

    /* triggers */
    if (s.burst !== lastBurst) {
      lastBurst = s.burst;
      spawnRipple(s.ox, s.oy, Math.max(w, h) * 0.9, 0);
      spawnRipple(s.ox, s.oy, Math.max(w, h) * 0.7, 10);
      spawnRipple(s.ox, s.oy, Math.max(w, h) * 0.5, 20);
      ps.forEach((p) => (p.glow = 1));
      s.energy = 1.4;
    }
    if (s.pulse !== lastPulse) {
      lastPulse = s.pulse;
      spawnRipple(s.ox, s.oy, 260, 0);
    }
    if (s.mode === 'loading' && frameCount % 38 === 0) spawnRipple(s.ox, s.oy, 300, 0);

    ptr.nx += (ptr.tx - ptr.nx) * 0.06;
    ptr.ny += (ptr.ty - ptr.ny) * 0.06;

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    const speedK = 0.55 + s.energy * 1.3;

    /* update + project particles (parallax by depth) */
    const pos: { x: number; y: number }[] = new Array(ps.length);
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];

      if (ptr.active) {
        const dx = ptr.x - p.x;
        const dy = ptr.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 190 && d > 1) {
          const f = (1 - d / 190) * 0.05;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }

      const sp = Math.hypot(p.vx, p.vy);
      const maxSp = 0.85;
      if (sp > maxSp) {
        p.vx = (p.vx / sp) * maxSp;
        p.vy = (p.vy / sp) * maxSp;
      }
      p.vx *= 0.998;
      p.vy *= 0.998;
      if (sp < 0.06) {
        p.vx += (Math.random() - 0.5) * 0.02;
        p.vy += (Math.random() - 0.5) * 0.02;
      }

      p.x += p.vx * speedK;
      p.y += p.vy * speedK;
      if (p.x < -30) p.x = w + 30;
      else if (p.x > w + 30) p.x = -30;
      if (p.y < -30) p.y = h + 30;
      else if (p.y > h + 30) p.y = -30;

      p.glow *= 0.94;
      pos[i] = { x: p.x + ptr.nx * p.z * 16, y: p.y + ptr.ny * p.z * 16 };
    }

    /* links */
    ctx.lineWidth = 0.8;
    const linkAlpha = 0.26 + s.energy * 0.22;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkD * linkD) {
          const a = (1 - Math.sqrt(d2) / linkD) * linkAlpha;
          ctx.strokeStyle = `rgba(129,140,248,${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(pos[i].x, pos[i].y);
          ctx.lineTo(pos[j].x, pos[j].y);
          ctx.stroke();
        }
      }
    }

    /* pointer node + links */
    if (ptr.active) {
      const g = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, 130);
      g.addColorStop(0, 'rgba(99,102,241,0.22)');
      g.addColorStop(1, 'rgba(99,102,241,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ptr.x, ptr.y, 130, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 1;
      for (let i = 0; i < pos.length; i++) {
        const d = Math.hypot(pos[i].x - ptr.x, pos[i].y - ptr.y);
        if (d < 190) {
          ctx.strokeStyle = `rgba(103,232,249,${((1 - d / 190) * 0.55).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(ptr.x, ptr.y);
          ctx.lineTo(pos[i].x, pos[i].y);
          ctx.stroke();
          if (d < 90) ps[i].glow = Math.max(ps[i].glow, 0.6);
        }
      }
      ctx.fillStyle = 'rgba(207,250,254,0.95)';
      ctx.beginPath();
      ctx.arc(ptr.x, ptr.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    /* data packets travel along links and hop to the next node */
    if (!reduce && packets.length < 46 && Math.random() < 0.02 + s.energy * 0.14) {
      const i = Math.floor(Math.random() * pos.length);
      const nb = neighbours(i, pos);
      if (nb.length) {
        packets.push({
          a: i,
          b: nb[Math.floor(Math.random() * nb.length)],
          t: 0,
          s: 0.012 + Math.random() * 0.012,
        });
      }
    }
    for (let k = packets.length - 1; k >= 0; k--) {
      const pk = packets[k];
      pk.t += pk.s * (0.7 + s.energy * 1.1);
      const A = pos[pk.a];
      const B = pos[pk.b];
      if (!A || !B) {
        packets.splice(k, 1);
        continue;
      }
      if (Math.hypot(A.x - B.x, A.y - B.y) > linkD * 1.1) {
        packets.splice(k, 1);
        continue;
      }
      if (pk.t >= 1) {
        ps[pk.b].glow = 1;
        const nb = neighbours(pk.b, pos).filter((n) => n !== pk.a);
        if (nb.length && Math.random() < 0.62) {
          packets[k] = {
            a: pk.b,
            b: nb[Math.floor(Math.random() * nb.length)],
            t: 0,
            s: pk.s,
          };
        } else {
          packets.splice(k, 1);
        }
        continue;
      }
      const x = A.x + (B.x - A.x) * pk.t;
      const y = A.y + (B.y - A.y) * pk.t;
      const tx = A.x + (B.x - A.x) * Math.max(0, pk.t - 0.14);
      const ty = A.y + (B.y - A.y) * Math.max(0, pk.t - 0.14);
      const tg = ctx.createLinearGradient(tx, ty, x, y);
      tg.addColorStop(0, 'rgba(34,211,238,0)');
      tg.addColorStop(1, 'rgba(165,243,252,0.95)');
      ctx.strokeStyle = tg;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(34,211,238,0.22)';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(236,254,255,1)';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    /* nodes */
    for (let i = 0; i < pos.length; i++) {
      const p = ps[i];
      if (p.glow > 0.03) {
        ctx.fillStyle = `rgba(34,211,238,${(p.glow * 0.3).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pos[i].x, pos[i].y, p.r * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(199,210,254,${(0.5 + p.z * 0.45).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(pos[i].x, pos[i].y, p.r + p.glow * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ripples */
    for (let k = ripples.length - 1; k >= 0; k--) {
      const r = ripples[k];
      if (r.delay > 0) {
        r.delay--;
        continue;
      }
      r.r += (r.max - r.r) * 0.04 + 0.7;
      r.a *= 0.966;
      if (r.a < 0.02) {
        ripples.splice(k, 1);
        continue;
      }
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `rgba(165,180,252,${(r.a * 0.6).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(103,232,249,${(r.a * 0.28).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
  };

  /* events */
  const onMove = (e: PointerEvent) => {
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.active = true;
    ptr.tx = (e.clientX / w - 0.5) * 2;
    ptr.ty = (e.clientY / h - 0.5) * 2;
    window.clearTimeout(touchTimer);
    if (e.pointerType !== 'mouse') {
      touchTimer = window.setTimeout(() => {
        ptr.active = false;
      }, 900);
    }
  };
  const onDown = (e: PointerEvent) => {
    onMove(e);
    spawnRipple(e.clientX, e.clientY, 230, 0);
  };
  const onLeave = () => {
    ptr.active = false;
    ptr.tx = 0;
    ptr.ty = 0;
  };
  const onVis = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !reduce) raf = requestAnimationFrame(frame);
  };

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  document.addEventListener('visibilitychange', onVis);

  frame();

  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(touchTimer);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    document.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('visibilitychange', onVis);
  };
}

/* ================================================================== */
/* Content                                                             */
/* ================================================================== */

const STAGES = ['Fresh', 'Connected', 'Interested', 'Visit', 'Complete'];

const FEED = [
  { tag: 'Lead', text: 'New lead assigned to telesales' },
  { tag: 'Call', text: 'Call logged and verified' },
  { tag: 'Follow-up', text: 'Follow-up scheduled for tomorrow' },
  { tag: 'Field', text: 'Field visit marked as interested' },
  { tag: 'Expense', text: 'Conveyance entry sent for approval' },
  { tag: 'Sale', text: 'Sale closed and team notified' },
];

const WORDS = ['Leads', 'Calls', 'Field Visits', 'Expenses', 'Sales'];

type Status = 'idle' | 'loading' | 'success';

/* ================================================================== */
/* Page                                                                */
/* ================================================================== */

export default function LoginPage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const sig = useRef<Signal>({ energy: 0.22, mode: 'idle', burst: 0, ox: 0, oy: 0, pulse: 0 });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const [tick, setTick] = useState(0);
  const [stage, setStage] = useState(0);

  /* start the living network */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    return startNetwork(c, sig);
  }, []);

  /* hero timers */
  useEffect(() => {
    const a = window.setInterval(() => setTick((t) => t + 1), 2600);
    const b = window.setInterval(() => setStage((s) => (s + 1) % STAGES.length), 1700);
    return () => {
      window.clearInterval(a);
      window.clearInterval(b);
    };
  }, []);

  const redirectTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(redirectTimer.current), []);

  const updateOrigin = () => {
    const r = cardRef.current?.getBoundingClientRect();
    if (r) {
      sig.current.ox = r.left + r.width / 2;
      sig.current.oy = r.top + r.height / 2;
    }
  };

  const bump = () => {
    sig.current.energy = Math.min(1.2, sig.current.energy + 0.22);
  };

  /* 3D tilt + light-following border (mouse only) */
  const onCardMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const el = tiltRef.current;
    const card = cardRef.current;
    if (!el || !card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${((0.5 - y) * 6).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((x - 0.5) * 8).toFixed(2)}deg`);
    card.style.setProperty('--cx', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--cy', `${(y * 100).toFixed(1)}%`);
  };
  const onCardLeave = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status !== 'idle') return;

    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError('Enter your email and password to continue.');
      return;
    }

    setError('');
    setStatus('loading');
    updateOrigin();
    sig.current.mode = 'loading';

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });

    if (authError) {
      sig.current.mode = 'idle';
      setStatus('idle');
      setError(
        /invalid login credentials/i.test(authError.message)
          ? 'Incorrect email or password.'
          : 'Unable to sign in right now. Please try again.'
      );
      return;
    }

    sig.current.mode = 'success';
    sig.current.burst += 1;
    setStatus('success');
    redirectTimer.current = window.setTimeout(() => navigate('/', { replace: true }), 1700);
  };

  const hasError = Boolean(error);

  const visibleFeed = [0, 1, 2, 3].map((i) => {
    const abs = tick - i;
    const idx = ((abs % FEED.length) + FEED.length) % FEED.length;
    return { abs, item: FEED[idx], depth: i };
  });

  return (
    <div className="cp-root relative min-h-screen w-full overflow-hidden bg-[#050816] text-slate-100">
      <style>{CSS}</style>

      <div className="cp-aurora cp-aurora-a" aria-hidden />
      <div className="cp-aurora cp-aurora-b" aria-hidden />
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden />
      <div className="cp-vignette" aria-hidden />

      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
        {/* ------------------------------ Hero (desktop) ------------------------------ */}
        <section className="hidden flex-col justify-center gap-10 px-12 py-14 lg:flex">
          <Brand align="left" />

          <div className="max-w-xl space-y-4">
            <div className="cp-rise cp-panel p-6" style={{ animationDelay: '900ms' }}>
              <div className="mb-5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Pipeline
                </span>
                <span className="flex items-center gap-2 text-xs text-emerald-300/90">
                  <span className="cp-live-dot" />
                  Live
                </span>
              </div>
              <div className="relative">
                <div className="absolute left-0 right-0 top-[7px] h-px bg-white/10" />
                <div
                  className="cp-progress absolute left-0 top-[7px] h-px"
                  style={{ width: `${(stage / (STAGES.length - 1)) * 100}%` }}
                />
                <ol className="relative flex justify-between">
                  {STAGES.map((s, i) => (
                    <li key={s} className="flex flex-col items-center gap-3">
                      <span
                        className={`cp-node ${i <= stage ? 'is-reached' : ''} ${
                          i === stage ? 'is-current' : ''
                        }`}
                      />
                      <span
                        className={`text-[11px] transition-colors duration-500 ${
                          i === stage ? 'text-white' : i < stage ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {s}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="cp-rise cp-panel relative p-5" style={{ animationDelay: '1050ms' }}>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                System activity
              </p>
              <ul className="relative h-[136px] overflow-hidden">
                {visibleFeed.map(({ abs, item, depth }) => (
                  <li
                    key={abs}
                    className="cp-feed-item flex items-center gap-3 py-[6px]"
                    style={{ opacity: 1 - depth * 0.28 }}
                  >
                    <span className="cp-tag">{item.tag}</span>
                    <span className="truncate text-sm text-slate-300">{item.text}</span>
                  </li>
                ))}
              </ul>
              <div className="cp-feed-fade" aria-hidden />
            </div>
          </div>
        </section>

        {/* ------------------------------ Form ------------------------------ */}
        <section className="flex flex-col items-center justify-center px-5 py-10 sm:px-8">
          <div className="mb-8 w-full max-w-[420px] lg:hidden">
            <Brand align="center" compact />
          </div>

          <div className="w-full max-w-[420px] cp-rise" style={{ animationDelay: '700ms' }}>
            <div
              ref={tiltRef}
              className="cp-tilt"
              onPointerMove={onCardMove}
              onPointerLeave={onCardLeave}
            >
              <div ref={cardRef} className="cp-card">
                <div className="cp-card-glow" aria-hidden />
                <div className="cp-card-sheen" aria-hidden />

                <div className="mb-7">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-slate-300">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                    Secure connection established
                  </div>
                  <h2 className="cp-heading text-[26px] text-white">Welcome back</h2>
                  <p className="mt-1.5 text-sm text-slate-400">
                    Sign in to continue to your workspace.
                  </p>
                </div>

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  <Field
                    id="email"
                    label="Email address"
                    type="email"
                    value={email}
                    onChange={(v) => {
                      setEmail(v);
                      bump();
                    }}
                    autoComplete="email"
                    invalid={hasError}
                    disabled={status !== 'idle'}
                    icon={<Mail className="h-4 w-4" />}
                  />

                  <Field
                    id="password"
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(v) => {
                      setPassword(v);
                      bump();
                    }}
                    autoComplete="current-password"
                    invalid={hasError}
                    disabled={status !== 'idle'}
                    icon={<Lock className="h-4 w-4" />}
                    onKeyEvent={(e) => setCapsOn(e.getModifierState('CapsLock'))}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />

                  <div className={`cp-msg ${hasError || capsOn ? 'is-open' : ''}`} aria-live="polite">
                    <div className="overflow-hidden">
                      {hasError ? (
                        <p className="flex items-start gap-2 pt-1 text-[13px] text-rose-300">
                          <AlertCircle className="mt-[1px] h-4 w-4 shrink-0" />
                          {error}
                        </p>
                      ) : capsOn ? (
                        <p className="pt-1 text-[13px] text-amber-300/90">Caps Lock is on.</p>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={status !== 'idle'}
                    className={`cp-btn ${status === 'success' ? 'is-success' : ''}`}
                  >
                    <span className="cp-btn-bg" aria-hidden />
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {status === 'idle' && (
                        <>
                          Sign in
                          <ArrowRight className="cp-arrow h-4 w-4" />
                        </>
                      )}
                      {status === 'loading' && (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Authenticating
                        </>
                      )}
                      {status === 'success' && (
                        <>
                          <Check className="cp-check h-4 w-4" />
                          Access granted
                        </>
                      )}
                    </span>
                    {status === 'loading' && <span className="cp-btn-load" aria-hidden />}
                  </button>
                </form>

                <p className="mt-6 text-center text-xs text-slate-500">
                  Trouble signing in? Contact your administrator.
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-[11px] text-slate-600">
              Protected by role-based access control
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Brand block                                                         */
/* ================================================================== */

function Brand({ align, compact }: { align: 'left' | 'center'; compact?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % WORDS.length), 2200);
    return () => window.clearInterval(t);
  }, []);

  const center = align === 'center';
  const size = compact ? 'clamp(3rem, 15vw, 4.4rem)' : 'clamp(4rem, 6.6vw, 6.4rem)';

  return (
    <div className={center ? 'text-center' : ''}>
      <div className={`cp-rise flex items-center gap-4 ${center ? 'justify-center' : ''}`}>
        <div className="cp-logo">
          <span className="cp-logo-ring" />
          <span className="cp-logo-ring" style={{ animationDelay: '1.1s' }} />
          <span className="relative z-10">C</span>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
          Lead &amp; Field Operations
        </span>
      </div>

      <h1
        className="cp-brand mt-6"
        style={{ fontSize: size }}
        aria-label="Connect Pro"
      >
        <span className="cp-word-wrap" aria-hidden>
          {'Connect'.split('').map((c, k) => (
            <span key={k} className="cp-letter" style={{ animationDelay: `${250 + k * 60}ms` }}>
              {c}
            </span>
          ))}
        </span>{' '}
        <span className="cp-pro cp-letter" style={{ animationDelay: '720ms' }} aria-hidden>
          Pro
        </span>
      </h1>

      <svg
        className={`cp-wave ${center ? 'mx-auto' : ''}`}
        viewBox="0 0 240 24"
        width={compact ? 180 : 240}
        height={compact ? 18 : 24}
        fill="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="cpWave" x1="0" x2="1">
            <stop offset="0" stopColor="#818cf8" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path
          d="M2 12 Q 12 0 22 12 T 42 12 T 62 12 T 82 12 T 102 12 T 122 12 T 142 12 T 162 12 T 182 12 T 202 12 T 222 12 T 238 12"
          stroke="url(#cpWave)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      <p
        className="cp-rise mt-4 text-[15px] text-slate-300 sm:text-base"
        style={{ animationDelay: '1000ms' }}
      >
        One place for your{' '}
        <span key={i} className="cp-word">
          {WORDS[i]}
        </span>
      </p>
    </div>
  );
}

/* ================================================================== */
/* Floating-label field                                                */
/* ================================================================== */

interface FieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  autoComplete?: string;
  invalid?: boolean;
  disabled?: boolean;
  onKeyEvent?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  icon,
  trailing,
  autoComplete,
  invalid,
  disabled,
  onKeyEvent,
}: FieldProps) {
  return (
    <div className={`cp-field ${invalid ? 'is-invalid' : ''}`}>
      <span className="cp-field-icon">{icon}</span>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyEvent}
        onKeyUp={onKeyEvent}
        autoComplete={autoComplete}
        disabled={disabled}
        placeholder=" "
        className="cp-input"
        aria-invalid={invalid || undefined}
      />
      <label htmlFor={id} className="cp-label">
        {label}
      </label>
      {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
    </div>
  );
}

/* ================================================================== */
/* Styles (scoped by "cp-" prefix)                                     */
/* ================================================================== */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap');

.cp-root { font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif; }

/* Atmosphere */
.cp-aurora { position: absolute; border-radius: 9999px; filter: blur(120px); pointer-events: none; z-index: 0; }
.cp-aurora-a { width: 680px; height: 680px; left: -180px; top: -200px; opacity: .55;
  background: radial-gradient(circle at 30% 30%, #4f46e5, transparent 65%);
  animation: cp-drift-a 22s ease-in-out infinite alternate; }
.cp-aurora-b { width: 620px; height: 620px; right: -180px; bottom: -220px; opacity: .4;
  background: radial-gradient(circle at 60% 60%, #06b6d4, transparent 65%);
  animation: cp-drift-b 28s ease-in-out infinite alternate; }
.cp-vignette { position: absolute; inset: 0; pointer-events: none; z-index: 1;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(2,4,14,.7) 100%); }
@keyframes cp-drift-a { from { transform: translate(0,0); } to { transform: translate(90px, 70px); } }
@keyframes cp-drift-b { from { transform: translate(0,0); } to { transform: translate(-80px, -60px); } }

/* Entrance */
.cp-rise { opacity: 0; transform: translateY(16px); animation: cp-rise .9s cubic-bezier(.2,.7,.2,1) forwards; }
@keyframes cp-rise { to { opacity: 1; transform: translateY(0); } }

/* Logo with signal rings */
.cp-logo { position: relative; width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center;
  background: linear-gradient(135deg, #6366f1, #22d3ee); color: #fff; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 20px;
  box-shadow: 0 0 0 1px rgba(255,255,255,.2) inset, 0 10px 34px -8px rgba(99,102,241,.8); }
.cp-logo-ring { position: absolute; inset: 0; border-radius: 13px; border: 1px solid rgba(129,140,248,.7);
  animation: cp-logo-ring 2.2s ease-out infinite; }
@keyframes cp-logo-ring { from { transform: scale(1); opacity: .8; } to { transform: scale(2.1); opacity: 0; } }

/* Brand wordmark */
.cp-brand { font-family: 'Syne', sans-serif; font-weight: 800; letter-spacing: -0.035em; line-height: .98; color: #fff;
  text-shadow: 0 0 60px rgba(99,102,241,.35); perspective: 800px; }
.cp-word-wrap { display: inline-block; }
.cp-letter { display: inline-block; opacity: 0; transform-origin: 50% 100%;
  animation: cp-letter .95s cubic-bezier(.2,.8,.2,1) forwards; }
@keyframes cp-letter { from { opacity: 0; transform: translateY(46px) rotateX(-75deg); filter: blur(12px); }
  to { opacity: 1; transform: none; filter: blur(0); } }
.cp-pro { background: linear-gradient(100deg, #a5b4fc 5%, #22d3ee 50%, #a5b4fc 95%); background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none;
  animation: cp-letter .95s cubic-bezier(.2,.8,.2,1) forwards, cp-shimmer 7s linear 1.2s infinite; }
@keyframes cp-shimmer { to { background-position: -220% 0; } }

.cp-wave { display: block; margin-top: 14px; overflow: visible; filter: drop-shadow(0 0 8px rgba(34,211,238,.55));
  stroke-dasharray: 520; stroke-dashoffset: 520; animation: cp-wave-draw 1.8s ease .9s forwards; }
.cp-wave path { stroke-dasharray: 520; stroke-dashoffset: 520; animation: cp-wave-draw 1.8s ease .9s forwards; }
@keyframes cp-wave-draw { to { stroke-dashoffset: 0; } }

.cp-word { display: inline-block; font-weight: 700; color: #a5f3fc; animation: cp-word-in .6s cubic-bezier(.2,.8,.2,1) both; }
@keyframes cp-word-in { from { opacity: 0; transform: translateY(10px); filter: blur(4px); } to { opacity: 1; transform: none; filter: blur(0); } }

/* Hero panels */
.cp-panel { position: relative; border-radius: 18px; border: 1px solid rgba(255,255,255,.09);
  background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
.cp-progress { background: linear-gradient(90deg, #6366f1, #22d3ee); transition: width 1.1s cubic-bezier(.4,0,.2,1); box-shadow: 0 0 12px rgba(99,102,241,.6); }
.cp-node { width: 15px; height: 15px; border-radius: 9999px; background: #0f172a; border: 1px solid rgba(255,255,255,.18);
  transition: background .5s, border-color .5s, box-shadow .5s; position: relative; }
.cp-node.is-reached { background: #6366f1; border-color: #a5b4fc; }
.cp-node.is-current { box-shadow: 0 0 0 4px rgba(99,102,241,.22), 0 0 18px rgba(99,102,241,.7); }
.cp-node.is-current::after { content: ""; position: absolute; inset: -6px; border-radius: 9999px; border: 1px solid rgba(165,180,252,.5); animation: cp-ring 1.7s ease-out infinite; }
@keyframes cp-ring { from { transform: scale(.7); opacity: .9; } to { transform: scale(1.5); opacity: 0; } }
.cp-live-dot { width: 7px; height: 7px; border-radius: 9999px; background: #34d399; box-shadow: 0 0 0 0 rgba(52,211,153,.6); animation: cp-live 2s infinite; }
@keyframes cp-live { 70% { box-shadow: 0 0 0 7px rgba(52,211,153,0); } 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); } }
.cp-feed-item { animation: cp-feed-in .6s cubic-bezier(.2,.7,.2,1) both; transition: opacity .6s; }
@keyframes cp-feed-in { from { opacity: 0; transform: translateY(-14px); } to { transform: translateY(0); } }
.cp-tag { flex: none; min-width: 76px; text-align: center; font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase;
  padding: 3px 8px; border-radius: 6px; color: #c7d2fe; background: rgba(99,102,241,.14); border: 1px solid rgba(129,140,248,.25); }
.cp-feed-fade { position: absolute; left: 0; right: 0; bottom: 0; height: 56px; border-radius: 0 0 18px 18px; pointer-events: none;
  background: linear-gradient(180deg, transparent, rgba(5,8,22,.85)); }

/* Card */
.cp-tilt { transform: perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .25s ease-out; will-change: transform; }
.cp-card { position: relative; overflow: hidden; border-radius: 22px; padding: 34px 30px 28px;
  border: 1px solid rgba(255,255,255,.1);
  background: linear-gradient(180deg, rgba(14,18,40,.72), rgba(10,14,32,.62));
  -webkit-backdrop-filter: blur(22px) saturate(140%); backdrop-filter: blur(22px) saturate(140%);
  box-shadow: 0 30px 80px -30px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.03) inset; }
@media (max-width: 420px) { .cp-card { padding: 28px 20px 24px; } }
.cp-heading { font-family: 'Syne', sans-serif; font-weight: 700; letter-spacing: -0.02em; }
.cp-card-sheen { position: absolute; left: 0; right: 0; top: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(165,180,252,.9), rgba(103,232,249,.9), transparent);
  background-size: 200% 100%; animation: cp-sheen 6s linear infinite; opacity: .85; }
@keyframes cp-sheen { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.cp-card-glow { position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none; opacity: 0; transition: opacity .3s;
  background: radial-gradient(240px circle at var(--cx, 50%) var(--cy, 0%), rgba(129,140,248,.95), rgba(34,211,238,.45) 45%, transparent 72%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude; }
.cp-card:hover .cp-card-glow, .cp-card:focus-within .cp-card-glow { opacity: 1; }

/* Fields */
.cp-field { position: relative; }
.cp-field-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #64748b; transition: color .25s; pointer-events: none; }
.cp-input { width: 100%; height: 54px; padding: 18px 44px 0 42px; border-radius: 13px; font-size: 16px; color: #f1f5f9;
  background: rgba(2,6,23,.5); border: 1px solid rgba(255,255,255,.1); outline: none;
  transition: border-color .25s, background .25s, box-shadow .25s; }
.cp-input:hover:not(:disabled) { border-color: rgba(255,255,255,.2); }
.cp-input:focus { border-color: rgba(129,140,248,.75); background: rgba(2,6,23,.65); box-shadow: 0 0 0 4px rgba(99,102,241,.16); }
.cp-input:disabled { opacity: .6; cursor: not-allowed; }
.cp-field:focus-within .cp-field-icon { color: #a5b4fc; }
.cp-label { position: absolute; left: 42px; top: 50%; transform: translateY(-50%); font-size: 14px; color: #64748b; pointer-events: none;
  transform-origin: left center; transition: transform .22s cubic-bezier(.2,.7,.2,1), color .22s; }
.cp-input:focus ~ .cp-label,
.cp-input:not(:placeholder-shown) ~ .cp-label { transform: translateY(-165%) scale(.78); color: #a5b4fc; }
.cp-input:-webkit-autofill ~ .cp-label { transform: translateY(-165%) scale(.78); }
.cp-input:-webkit-autofill { -webkit-text-fill-color: #f1f5f9; -webkit-box-shadow: 0 0 0 40px #0b1226 inset; caret-color: #f1f5f9; }
.cp-field.is-invalid .cp-input { border-color: rgba(251,113,133,.55); }
.cp-field.is-invalid .cp-input:focus { box-shadow: 0 0 0 4px rgba(244,63,94,.14); }
.cp-field.is-invalid .cp-label { color: #fda4af; }

.cp-msg { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .3s ease, opacity .3s ease; }
.cp-msg.is-open { grid-template-rows: 1fr; opacity: 1; }

/* Button */
.cp-btn { position: relative; width: 100%; height: 50px; border-radius: 13px; overflow: hidden; font-size: 14.5px; font-weight: 700; color: #fff;
  border: 0; cursor: pointer; transition: transform .2s, box-shadow .3s; margin-top: 6px;
  box-shadow: 0 12px 30px -12px rgba(99,102,241,.8), 0 0 0 1px rgba(255,255,255,.14) inset; }
.cp-btn-bg { position: absolute; inset: 0; background: linear-gradient(110deg, #4f46e5, #6366f1 45%, #0ea5e9);
  background-size: 160% 100%; transition: background-position .6s ease; }
.cp-btn:hover:not(:disabled) .cp-btn-bg { background-position: 100% 0; }
.cp-btn:hover:not(:disabled) { box-shadow: 0 16px 38px -12px rgba(99,102,241,.95), 0 0 0 1px rgba(255,255,255,.2) inset; }
.cp-btn:active:not(:disabled) { transform: scale(.985); }
.cp-btn:disabled { cursor: default; }
.cp-btn:focus-visible { outline: 2px solid #a5b4fc; outline-offset: 3px; }
.cp-arrow { transition: transform .25s; }
.cp-btn:hover .cp-arrow { transform: translateX(3px); }
.cp-btn-load { position: absolute; left: 0; bottom: 0; height: 2px; width: 40%; background: rgba(255,255,255,.85); animation: cp-load 1.1s ease-in-out infinite; }
@keyframes cp-load { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
.cp-btn.is-success .cp-btn-bg { background: linear-gradient(110deg, #059669, #10b981); }
.cp-check { animation: cp-pop .45s cubic-bezier(.2,.9,.3,1.3); }
@keyframes cp-pop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .cp-root *, .cp-root *::before, .cp-root *::after { animation: none !important; transition-duration: .01ms !important; }
  .cp-rise, .cp-letter { opacity: 1; transform: none; filter: none; }
  .cp-wave, .cp-wave path { stroke-dashoffset: 0; }
}
`;
