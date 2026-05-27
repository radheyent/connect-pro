import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase, UserProfile } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user,    setUser]    = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Prevent double fetchProfile calls
  const fetchingRef  = useRef(false);
  const mountedRef   = useRef(true);

  const fetchProfile = async (userId: string) => {
    if (fetchingRef.current) return;   // already in flight
    fetchingRef.current = true;
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!mountedRef.current) return;
      if (error) { console.error('fetchProfile:', error); setProfile(null); }
      else        { setProfile(data); }
    } catch (e) {
      if (mountedRef.current) setProfile(null);
    } finally {
      if (mountedRef.current) setLoading(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    // Use onAuthStateChange ONLY — it fires INITIAL_SESSION on mount
    // (handles existing session) AND SIGNED_IN on login.
    // Do NOT call getSession() separately — causes double fetchProfile race.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          setLoading(false);
          fetchingRef.current = false;
          return;
        }

        if (session?.user) {
          // Keep loading=true while we fetch profile
          setLoading(true);
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else {
          // No session on initial load
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    fetchingRef.current = false;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
