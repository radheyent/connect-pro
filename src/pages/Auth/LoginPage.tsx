/**
 * Connect Pro — Login Page
 * Path: src/pages/Auth/LoginPage.tsx
 *
 * No new dependencies. Uses React, react-router-dom, lucide-react, Tailwind and CSS keyframes only.
 *
 * ASSUMPTIONS (adjust if your project differs):
 *  1. `supabase` is a named export from src/lib/supabase.ts
 *  2. AuthContext listens to supabase auth state and App.tsx redirects by role.
 *     As a safety net this page navigates to "/" after success; "/" should route by role.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { supabase } from '../../lib/supabase';

/* ------------------------------------------------------------------ */
/* Static content for the hero panel                                   */
/* ------------------------------------------------------------------ */

const STAGES = ['Fresh', 'Connected', 'Interested', 'Visit', 'Complete'];

const FEED = [
  { tag: 'Lead', text: 'New lead assigned to telesales' },
  { tag: 'Call', text: 'Call logged and verified' },
  { tag: 'Follow-up', text: 'Follow-up scheduled for tomorrow' },
  { tag: 'Field', text: 'Field visit marked as interested' },
  { tag: 'Expense', text: 'Conveyance entry submitted for approval' },
  { tag: 'Sale', text: 'Sale closed and team notified' },
];

type Status = 'idle' | 'loading' | 'success';

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LoginPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const [tick, setTick] = useState(0);
  const [stage, setStage] = useState(0);

  /* Live "system activity" feed + pipeline progress */
  useEffect(() => {
    const feedTimer = window.setInterval(() => setTick((t) => t + 1), 2600);
    const stageTimer = window.setInterval(
      () => setStage((s) => (s + 1) % STAGES.length),
      1700
    );
    return () => {
      window.clearInterval(feedTimer);
      window.clearInterval(stageTimer);
    };
  }, []);

  /* Cursor spotlight — writes CSS variables directly, no re-renders */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--mx', `${e.clientX}px`);
        el.style.setProperty('--my', `${e.clientY}px`);
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        el.style.setProperty('--px', nx.toFixed(3));
        el.style.setProperty('--py', ny.toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  /* Cleanup for post-success redirect fallback */
  const redirectTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(redirectTimer.current), []);

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

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });

    if (authError) {
      setStatus('idle');
      setError(
        /invalid login credentials/i.test(authError.message)
          ? 'Incorrect email or password.'
          : 'Unable to sign in right now. Please try again.'
      );
      return;
    }

    setStatus('success');
    redirectTimer.current = window.setTimeout(
      () => navigate('/', { replace: true }),
      1400
    );
  };

  const hasError = Boolean(error);

  /* Feed window: newest first, keyed by absolute tick so new items animate in */
  const visibleFeed = [0, 1, 2, 3].map((i) => {
    const abs = tick - i;
    const idx = ((abs % FEED.length) + FEED.length) % FEED.length;
    return { abs, item: FEED[idx], depth: i };
  });

  return (
    <div
      ref={rootRef}
      className="cp-root relative min-h-screen w-full overflow-hidden bg-slate-950 text-slate-100"
    >
      <style>{CSS}</style>

      {/* Atmosphere */}
      <div className="cp-aurora cp-aurora-a" aria-hidden />
      <div className="cp-aurora cp-aurora-b" aria-hidden />
      <div className="cp-grid" aria-hidden />
      <div className="cp-spotlight" aria-hidden />
      <div className="cp-vignette" aria-hidden />

      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
        {/* ------------------------------ Hero ------------------------------ */}
        <section className="hidden flex-col justify-between px-12 py-14 lg:flex">
          <div className="cp-rise" style={{ animationDelay: '60ms' }}>
            <div className="flex items-center gap-3">
              <div className="cp-logo">
                <span>C</span>
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold tracking-wide text-white">
                  Connect Pro
                </p>
                <p className="text-xs text-slate-400">Lead &amp; Field Operations</p>
              </div>
            </div>
          </div>

          <div className="max-w-xl">
            <h1
              className="cp-rise text-5xl font-semibold leading-[1.08] tracking-tight text-white xl:text-6xl"
              style={{ animationDelay: '160ms' }}
            >
              Every lead.
              <br />
              <span className="cp-gradient-text">One clear pipeline.</span>
            </h1>
            <p
              className="cp-rise mt-6 max-w-md text-base leading-relaxed text-slate-400"
              style={{ animationDelay: '260ms' }}
            >
              From the first call to the closed sale, your team, field visits and
              expenses stay in sync in real time.
            </p>

            {/* Pipeline */}
            <div
              className="cp-rise mt-12 cp-panel p-6"
              style={{ animationDelay: '360ms' }}
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
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
                  {STAGES.map((s, i) => {
                    const reached = i <= stage;
                    const current = i === stage;
                    return (
                      <li key={s} className="flex flex-col items-center gap-3">
                        <span
                          className={`cp-node ${reached ? 'is-reached' : ''} ${
                            current ? 'is-current' : ''
                          }`}
                        />
                        <span
                          className={`text-[11px] transition-colors duration-500 ${
                            current ? 'text-white' : reached ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          {s}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>

            {/* Activity feed */}
            <div
              className="cp-rise mt-4 cp-panel p-5"
              style={{ animationDelay: '460ms' }}
            >
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                System activity
              </p>
              <ul className="relative h-[148px] overflow-hidden">
                {visibleFeed.map(({ abs, item, depth }) => (
                  <li
                    key={abs}
                    className="cp-feed-item flex items-center gap-3 py-[7px]"
                    style={{
                      opacity: 1 - depth * 0.28,
                      transform: `translateY(${depth * 0}px)`,
                    }}
                  >
                    <span className="cp-tag">{item.tag}</span>
                    <span className="truncate text-sm text-slate-300">{item.text}</span>
                  </li>
                ))}
              </ul>
              <div className="cp-feed-fade" aria-hidden />
            </div>
          </div>

          <p
            className="cp-rise text-xs text-slate-500"
            style={{ animationDelay: '560ms' }}
          >
            Role-based access for Admin, Employee and Field teams.
          </p>
        </section>

        {/* ------------------------------ Form ------------------------------ */}
        <section className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[420px]">
            {/* Mobile brand */}
            <div className="cp-rise mb-8 flex items-center gap-3 lg:hidden">
              <div className="cp-logo">
                <span>C</span>
              </div>
              <p className="text-sm font-semibold tracking-wide text-white">Connect Pro</p>
            </div>

            <div className="cp-card cp-rise" style={{ animationDelay: '200ms' }}>
              <div className="cp-card-sheen" aria-hidden />

              <div className="mb-7">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-slate-300">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                  Secure connection established
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  Welcome back
                </h2>
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
                  onChange={setEmail}
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
                  onChange={setPassword}
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
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                />

                {/* Messages: smooth height reveal, no shake */}
                <div
                  className={`cp-msg ${hasError || capsOn ? 'is-open' : ''}`}
                  aria-live="polite"
                >
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

            <p className="mt-6 text-center text-[11px] text-slate-600">
              Protected by role-based access control
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Floating-label field                                                */
/* ------------------------------------------------------------------ */

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
        className="cp-input peer"
        aria-invalid={invalid || undefined}
      />
      <label htmlFor={id} className="cp-label">
        {label}
      </label>
      {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
      <span className="cp-field-line" aria-hidden />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles (scoped by class prefix "cp-")                               */
/* ------------------------------------------------------------------ */

const CSS = `
.cp-root { --mx: 50vw; --my: 40vh; --px: 0; --py: 0; font-feature-settings: "cv11", "ss01"; }

/* Background */
.cp-aurora { position: absolute; border-radius: 9999px; filter: blur(110px); opacity: .55; pointer-events: none; will-change: transform; }
.cp-aurora-a { width: 640px; height: 640px; left: -140px; top: -180px;
  background: radial-gradient(circle at 30% 30%, #4f46e5, transparent 65%);
  transform: translate3d(calc(var(--px) * 26px), calc(var(--py) * 20px), 0);
  animation: cp-drift-a 26s ease-in-out infinite alternate; }
.cp-aurora-b { width: 560px; height: 560px; right: -160px; bottom: -200px;
  background: radial-gradient(circle at 60% 60%, #06b6d4, transparent 65%); opacity: .38;
  transform: translate3d(calc(var(--px) * -22px), calc(var(--py) * -18px), 0);
  animation: cp-drift-b 32s ease-in-out infinite alternate; }
.cp-grid { position: absolute; inset: 0; pointer-events: none;
  background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
  background-size: 56px 56px;
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 78%);
          mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 78%); }
.cp-spotlight { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(520px circle at var(--mx) var(--my), rgba(129,140,248,.13), transparent 60%); }
.cp-vignette { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(2,6,23,.65) 100%); }

@keyframes cp-drift-a { from { margin: 0 0 0 0; } to { margin: 60px 0 0 90px; } }
@keyframes cp-drift-b { from { margin: 0 0 0 0; } to { margin: 0 70px 50px 0; } }

/* Entrance */
.cp-rise { opacity: 0; transform: translateY(14px); animation: cp-rise .8s cubic-bezier(.2,.7,.2,1) forwards; }
@keyframes cp-rise { to { opacity: 1; transform: translateY(0); } }

/* Logo */
.cp-logo { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center;
  background: linear-gradient(135deg, #6366f1, #22d3ee); color: #fff; font-weight: 700; font-size: 17px;
  box-shadow: 0 0 0 1px rgba(255,255,255,.18) inset, 0 8px 28px -8px rgba(99,102,241,.7); }

/* Hero text */
.cp-gradient-text { background: linear-gradient(100deg, #a5b4fc 10%, #67e8f9 55%, #a5b4fc 95%);
  background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: cp-shimmer 9s linear infinite; }
@keyframes cp-shimmer { to { background-position: -200% 0; } }

/* Panels */
.cp-panel { position: relative; border-radius: 18px; border: 1px solid rgba(255,255,255,.08);
  background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.02));
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }

/* Pipeline */
.cp-progress { background: linear-gradient(90deg, #6366f1, #22d3ee); transition: width 1.1s cubic-bezier(.4,0,.2,1); box-shadow: 0 0 12px rgba(99,102,241,.6); }
.cp-node { width: 15px; height: 15px; border-radius: 9999px; background: #0f172a; border: 1px solid rgba(255,255,255,.18);
  transition: background .5s, border-color .5s, box-shadow .5s; position: relative; }
.cp-node.is-reached { background: #6366f1; border-color: #a5b4fc; }
.cp-node.is-current { box-shadow: 0 0 0 4px rgba(99,102,241,.22), 0 0 18px rgba(99,102,241,.7); }
.cp-node.is-current::after { content: ""; position: absolute; inset: -6px; border-radius: 9999px; border: 1px solid rgba(165,180,252,.5); animation: cp-ring 1.7s ease-out infinite; }
@keyframes cp-ring { from { transform: scale(.7); opacity: .9; } to { transform: scale(1.5); opacity: 0; } }
.cp-live-dot { width: 7px; height: 7px; border-radius: 9999px; background: #34d399; box-shadow: 0 0 0 0 rgba(52,211,153,.6); animation: cp-live 2s infinite; }
@keyframes cp-live { 70% { box-shadow: 0 0 0 7px rgba(52,211,153,0); } 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); } }

/* Feed */
.cp-feed-item { animation: cp-feed-in .6s cubic-bezier(.2,.7,.2,1) both; transition: opacity .6s; }
@keyframes cp-feed-in { from { opacity: 0; transform: translateY(-14px); } to { transform: translateY(0); } }
.cp-tag { flex: none; min-width: 74px; text-align: center; font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase;
  padding: 3px 8px; border-radius: 6px; color: #c7d2fe; background: rgba(99,102,241,.14); border: 1px solid rgba(129,140,248,.25); }
.cp-feed-fade { position: absolute; left: 0; right: 0; bottom: 0; height: 56px; border-radius: 0 0 18px 18px; pointer-events: none;
  background: linear-gradient(180deg, transparent, rgba(8,13,30,.85)); }

/* Card */
.cp-card { position: relative; overflow: hidden; border-radius: 22px; padding: 34px 30px 28px;
  border: 1px solid rgba(255,255,255,.1);
  background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03));
  -webkit-backdrop-filter: blur(22px) saturate(140%); backdrop-filter: blur(22px) saturate(140%);
  box-shadow: 0 30px 80px -30px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.03) inset; }
@media (max-width: 420px) { .cp-card { padding: 28px 20px 24px; } }
.cp-card-sheen { position: absolute; left: 0; right: 0; top: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(165,180,252,.9), rgba(103,232,249,.9), transparent);
  background-size: 200% 100%; animation: cp-sheen 6s linear infinite; opacity: .8; }
@keyframes cp-sheen { from { background-position: 200% 0; } to { background-position: -200% 0; } }

/* Fields */
.cp-field { position: relative; }
.cp-field-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #64748b; transition: color .25s; pointer-events: none; }
.cp-input { width: 100%; height: 54px; padding: 18px 44px 0 42px; border-radius: 13px; font-size: 14.5px; color: #f1f5f9;
  background: rgba(2,6,23,.45); border: 1px solid rgba(255,255,255,.1); outline: none;
  transition: border-color .25s, background .25s, box-shadow .25s; }
.cp-input:hover:not(:disabled) { border-color: rgba(255,255,255,.2); }
.cp-input:focus { border-color: rgba(129,140,248,.7); background: rgba(2,6,23,.6); box-shadow: 0 0 0 4px rgba(99,102,241,.14); }
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

/* Message reveal (height transition, no motion shake) */
.cp-msg { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .3s ease, opacity .3s ease; }
.cp-msg.is-open { grid-template-rows: 1fr; opacity: 1; }

/* Button */
.cp-btn { position: relative; width: 100%; height: 50px; border-radius: 13px; overflow: hidden; font-size: 14.5px; font-weight: 600; color: #fff;
  border: 0; cursor: pointer; transition: transform .2s, box-shadow .3s, filter .3s; margin-top: 6px;
  box-shadow: 0 12px 30px -12px rgba(99,102,241,.8), 0 0 0 1px rgba(255,255,255,.14) inset; }
.cp-btn-bg { position: absolute; inset: 0; background: linear-gradient(110deg, #4f46e5, #6366f1 45%, #0ea5e9);
  background-size: 160% 100%; transition: background-position .6s ease, filter .3s; }
.cp-btn:hover:not(:disabled) .cp-btn-bg { background-position: 100% 0; }
.cp-btn:hover:not(:disabled) { box-shadow: 0 16px 38px -12px rgba(99,102,241,.95), 0 0 0 1px rgba(255,255,255,.2) inset; }
.cp-btn:active:not(:disabled) { transform: scale(.985); }
.cp-btn:disabled { cursor: default; }
.cp-btn:focus-visible { outline: 2px solid #a5b4fc; outline-offset: 3px; }
.cp-arrow { transition: transform .25s; }
.cp-btn:hover .cp-arrow { transform: translateX(3px); }
.cp-btn-load { position: absolute; left: 0; bottom: 0; height: 2px; width: 40%; background: rgba(255,255,255,.85);
  animation: cp-load 1.1s ease-in-out infinite; }
@keyframes cp-load { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
.cp-btn.is-success .cp-btn-bg { background: linear-gradient(110deg, #059669, #10b981); }
.cp-check { animation: cp-pop .45s cubic-bezier(.2,.9,.3,1.3); }
@keyframes cp-pop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .cp-root *, .cp-root *::before, .cp-root *::after { animation: none !important; transition-duration: .01ms !important; }
  .cp-rise { opacity: 1; transform: none; }
  .cp-aurora-a, .cp-aurora-b { transform: none; }
}
`;
