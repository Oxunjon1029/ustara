import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '@ustara/shared';
import { isDemo, supabase, usernameToEmail } from '../../lib/supabase';

export interface Profile {
  user_id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  username: string | null;
}

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; profile: Profile };

interface AuthApi {
  state: AuthState;
  signInWithPassword(login: string, password: string): Promise<boolean>;
  signInDemo(role: Role): void;
  signOut(): Promise<void>;
}

const DEMO: Record<Role, Profile> = {
  client: { user_id: 'demo-client', role: 'client', full_name: 'Aziz', phone: '+998901234567', username: 'aziz' },
  barber: { user_id: 'demo-barber', role: 'barber', full_name: 'Jasur', phone: '+998900000002', username: 'jasur' },
  admin: { user_id: 'demo-admin', role: 'admin', full_name: 'Admin', phone: '+998900000001', username: 'admin' },
};

const Ctx = createContext<AuthApi | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('user_id, role, full_name, phone, username')
    .eq('user_id', userId)
    .single();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(isDemo ? { status: 'signedOut' } : { status: 'loading' });

  useEffect(() => {
    if (isDemo) return;
    const apply = async (userId: string | undefined) => {
      const profile = userId ? await loadProfile(userId) : null;
      setState(profile ? { status: 'signedIn', profile } : { status: 'signedOut' });
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user.id));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      apply(session?.user.id);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithPassword = useCallback(async (login: string, password: string) => {
    // Milestone 1: username login against seeded accounts. Milestone 2 swaps in the
    // auth-password Edge Function (phone or username, rate limit, lockout).
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(login), password });
    return !error;
  }, []);

  const signInDemo = useCallback((role: Role) => setState({ status: 'signedIn', profile: DEMO[role] }), []);

  const signOut = useCallback(async () => {
    if (!isDemo) await supabase.auth.signOut();
    setState({ status: 'signedOut' });
  }, []);

  const api = useMemo(() => ({ state, signInWithPassword, signInDemo, signOut }), [state, signInWithPassword, signInDemo, signOut]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
