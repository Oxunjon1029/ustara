import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale, Role } from '@ustara/shared';
import { callFn, type SessionTokens } from '../../lib/api';
import { isDemo, supabase } from '../../lib/supabase';
import { unregisterPush } from '../notifications/push';
import i18n from '../../i18n';

export interface Profile {
  user_id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  username: string | null;
  phone_verified: boolean;
}

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; profile: Profile };

/** null = success, otherwise an error code (auth.errors.*). */
type Result = Promise<string | null>;

export interface SignUpInput {
  full_name: string;
  phone: string;
  username: string;
  password: string;
}

interface AuthApi {
  state: AuthState;
  signInWithPassword(login: string, password: string): Result;
  signUp(input: SignUpInput): Result;
  /** Store a session minted by an Edge Function (Telegram sign-in, password reset). */
  applySession(session: SessionTokens): Result;
  refreshProfile(): Promise<void>;
  signInDemo(role: Role): void;
  signOut(): Promise<void>;
}

const DEMO: Record<Role, Profile> = {
  client: { user_id: 'demo-client', role: 'client', full_name: 'Aziz', phone: '+998901234567', username: 'aziz', phone_verified: true },
  barber: { user_id: 'demo-barber', role: 'barber', full_name: 'Jasur', phone: '+998900000002', username: 'jasur', phone_verified: true },
  admin: { user_id: 'demo-admin', role: 'admin', full_name: 'Admin', phone: '+998900000001', username: 'admin', phone_verified: true },
};

const Ctx = createContext<AuthApi | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('user_id, role, full_name, phone, username, phone_verified')
    .eq('user_id', userId)
    .single();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(isDemo ? { status: 'signedOut' } : { status: 'loading' });

  const apply = useCallback(async (userId: string | undefined) => {
    const profile = userId ? await loadProfile(userId) : null;
    setState(profile ? { status: 'signedIn', profile } : { status: 'signedOut' });
  }, []);

  useEffect(() => {
    if (isDemo) return;
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user.id));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer: calling Supabase inside this callback can deadlock the auth lock.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(() => apply(session?.user.id), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [apply]);

  const applySession = useCallback(async (session: SessionTokens) => {
    const { data, error } = await supabase.auth.setSession(session);
    if (error || !data.user) return 'server_error';
    await apply(data.user.id);
    return null;
  }, [apply]);

  const signInWithPassword = useCallback(async (login: string, password: string) => {
    const res = await callFn<{ session: SessionTokens }>('auth-password', { action: 'login', login, password });
    return res.data ? applySession(res.data.session) : (res.error ?? 'server_error');
  }, [applySession]);

  const signUp = useCallback(async (input: SignUpInput) => {
    const res = await callFn<{ session: SessionTokens }>('auth-password', {
      action: 'signup',
      ...input,
      locale: (i18n.language === 'ru' ? 'ru' : 'uz') satisfies Locale,
    });
    return res.data ? applySession(res.data.session) : (res.error ?? 'server_error');
  }, [applySession]);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) await apply(data.user.id);
  }, [apply]);

  const signInDemo = useCallback((role: Role) => setState({ status: 'signedIn', profile: DEMO[role] }), []);

  const signOut = useCallback(async () => {
    if (!isDemo) {
      await unregisterPush().catch(() => {});
      await supabase.auth.signOut();
    }
    setState({ status: 'signedOut' });
  }, []);

  const api = useMemo(
    () => ({ state, signInWithPassword, signUp, applySession, refreshProfile, signInDemo, signOut }),
    [state, signInWithPassword, signUp, applySession, refreshProfile, signInDemo, signOut],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
