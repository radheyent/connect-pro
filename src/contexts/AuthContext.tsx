import React, {
  createContext, useContext, useEffect,
  useState, useRef, useCallback, useMemo
} from 'react';
import { supabase, UserProfile } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user:    User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Module-level caches (survive re-renders, reset on signout) ──────────────
const profileCache  = new Map<string, UserProfile>();
let   cachedUserId  = '';   // last resolved user id — to skip duplicate setUser calls

// ─── Stable shallow-equal for User object ────────────────────────────────────
// Supabase returns a NEW User object on every TOKEN_REFRESHED even when
// the underlying user hasn't changed.  Comparing just the id + updated_at
// prevents unnecessary context re-renders.
function isSameUser(a: User | null, b: User | null): boolean {
  if (a === b)       return true;
  if (!a || !b)      return false;
  return a.id === b.id && a.updated_at === b.updated_at;
}

// ─── Stable shallow-equal for UserProfile ────────────────────────────────────
function isSameProfile(a: UserProfile | null, b: UserProfile | null): boolean {
  if (a === b)  return true;
  if (!a || !b) return false;
  return (
    a.id        === b.id        &&
    a.name      === b.name      &&
    a.role      === b.role      &&
    a.is_active === b.is_active
  );
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user,    _setUser]    = useState<User | null>(null);
  const [profile, _setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading]  = useState(true);

  const mountedRef    = useRef(true);
  const fetchingRef   = useRef(false);
  const initializedRef = useRef(false); // has getSession() completed?

  // ── Stable setters — only trigger re-render when value actually changes ────
  const setUser = useCallback((next: User | null) => {
    _setUser(prev => isSameUser(prev, next) ? prev : next);
  }, []);

  const setProfile = useCallback((next: UserProfile | null) => {
    _setProfile(prev => isSameProfile(prev, next) ? prev : next);
  }, []);

  // ── Profile fetch — with cache & de-dup guard ─────────────────────────────
  const fetchProfile = useCallback(async (userId: string) => {
    // De-dup: if already fetching for this user, skip
    if (fetchingRef.current && cachedUserId === userId) return;

    // Cache hit — resolve instantly, no DB call, no loading flash
    if (profileCache.has(userId)) {
      if (mountedRef.current) {
        setProfile(profileCache.get(userId)!);
        setLoading(false);
      }
      return;
    }

    fetchingRef.current = true;
    cachedUserId        = userId;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!mountedRef.current) return;

      if (!error && data) {
        profileCache.set(userId, data);
        setProfile(data);
      } else {
        setProfile(null);
      }
    } catch {
      if (mountedRef.current) setProfile(null);
    } finally {
      if (mountedRef.current) setLoading(false);
      fetchingRef.current = false;
    }
  }, [setProfile]);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    // ── STEP 1: Read existing session once on mount ───────────────────────
    // This is the ONLY place we set loading=true → loading=false on cold start.
    // Using getSession() (not onAuthStateChange INITIAL_SESSION) prevents the
    // double-fire that causes the "Loading..." flash when returning to the app.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mountedRef.current) return;
      initializedRef.current = true;

      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // ── STEP 2: Auth state listener — ONLY for genuine state transitions ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mountedRef.current) return;

        // INITIAL_SESSION fires right after getSession() — ignore to prevent
        // double fetch and the resulting "Loading..." flash.
        if (event === 'INITIAL_SESSION') return;

        if (event === 'SIGNED_IN' && session?.user) {
          // Only update if user actually changed (e.g. different account login)
          setUser(session.user);
          if (!profileCache.has(session.user.id)) {
            // Fresh login — show loading only if not yet initialized
            if (initializedRef.current) setLoading(true);
            fetchingRef.current = false;
          }
          fetchProfile(session.user.id);

        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          setLoading(false);
          fetchingRef.current = false;
          profileCache.clear();
          cachedUserId = '';

        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // ── KEY FIX ──────────────────────────────────────────────────────
          // TOKEN_REFRESHED fires every ~55 min (Supabase default).
          // We ONLY call setUser if the underlying user actually changed.
          // Our stable setUser already does isSameUser check, but calling
          // setUser at all can still cause children to schedule re-renders.
          // So we guard with an explicit id check BEFORE calling setUser.
          if (session.user.id !== cachedUserId || !isSameUser(session.user, user)) {
            setUser(session.user);
          }
          // Never re-fetch profile or change loading on token refresh.

        } else if (event === 'USER_UPDATED' && session?.user) {
          // User metadata changed — clear cache and re-fetch
          profileCache.delete(session.user.id);
          setUser(session.user);
          fetchingRef.current = false;
          fetchProfile(session.user.id);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← Empty deps: this effect must run exactly ONCE on mount.
          //   fetchProfile & setUser are stable (useCallback), so safe.

  const signOut = useCallback(async () => {
    fetchingRef.current = false;
    cachedUserId        = '';
    profileCache.clear();
    // Don't set loading=true here — causes a flash before redirect
    await supabase.auth.signOut();
  }, []);

  // ── Memoize context value — prevents ALL consumers from re-rendering
  //    unless user, profile, or loading actually changed ───────────────────
  const value = useMemo(
    () => ({ user, profile, loading, signOut }),
    [user, profile, loading, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
