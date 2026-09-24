import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { CollectionKey } from './types';
import { canDelete, canManage, canWrite, isAdmin, type Role } from './lib/permissions';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
  last_seen_at: string | null;
}

interface Auth {
  mode: 'local' | 'cloud';
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** True after following a "reset password" email link. */
  recovery: boolean;
  role: Role;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
  finishRecovery(): void;
}

const Ctx = createContext<Auth | null>(null);

// Local mode has no accounts: whoever is using the browser can do everything.
const LOCAL_ROLE: Role = 'admin';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [recovery, setRecovery] = useState(false);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!supabase || !s) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (!cancelled) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
      // Defer: calling Supabase inside this callback can deadlock the auth lock.
      setTimeout(() => loadProfile(s), 0);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  // Record last sign-in, and pick up approval / role changes live.
  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    client.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId).then(() => undefined);
    const channel = client.channel(`profile-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) => {
        setProfile(payload.eventType === 'DELETE' ? null : (payload.new as Profile));
      })
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [userId]);

  const value = useMemo<Auth>(() => ({
    mode: supabase ? 'cloud' : 'local',
    loading,
    session,
    profile,
    recovery,
    role: supabase ? (profile?.active ? profile.role : 'pending') : LOCAL_ROLE,
    signOut: async () => { await supabase?.auth.signOut(); setProfile(null); },
    refreshProfile: () => loadProfile(session),
    finishRecovery: () => setRecovery(false),
  }), [loading, session, profile, recovery, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** What the current user is allowed to do, for showing or hiding controls. */
export function usePermissions() {
  const { role } = useAuth();
  return useMemo(() => ({
    role,
    canWrite: (c: CollectionKey) => canWrite(role, c),
    canDelete: canDelete(role),
    canManage: canManage(role),
    isAdmin: isAdmin(role),
  }), [role]);
}
