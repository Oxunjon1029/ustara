import { supabase } from './supabase';

export interface FnResult<T> {
  data?: T;
  /** Stable error code from the function (see auth.errors.* in i18n), or 'network'. */
  error?: string;
  extra?: Record<string, unknown>;
}

/**
 * Run Edge Functions in the database's region (e.g. ap-northeast-2): they make several DB/Auth calls,
 * so running next to the database is much faster than running near the phone.
 */
const REGION = process.env.EXPO_PUBLIC_SUPABASE_REGION;

/** Call an Edge Function and normalise errors to the `{ error: code }` shape the functions return. */
export async function callFn<T>(name: string, body: Record<string, unknown>): Promise<FnResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body, headers: REGION ? { 'x-region': REGION } : undefined });
  if (!error) return { data: data as T };
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const j = await ctx.json();
      return { error: typeof j.error === 'string' ? j.error : 'server_error', extra: j };
    } catch {
      return { error: 'server_error' };
    }
  }
  return { error: 'network' };
}

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
}
