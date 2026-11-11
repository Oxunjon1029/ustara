import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
/** Service-role client: bypasses RLS. Never return its data unfiltered. */
export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, noSession);
/** Fresh anon client per call, used to mint user sessions. */
export const anonClient = () => createClient(SUPABASE_URL, ANON_KEY, noSession);

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Error responses carry a stable `code` that the app maps to a translated message. */
export const fail = (code: string, status = 400, extra: Record<string, unknown> = {}) => json({ error: code, ...extra }, status);

export const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** URL-safe random token; 32 bytes → 43 chars (fits Telegram's 64-char /start payload). */
export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Same rule as packages/shared phoneSchema: +998 and 9 digits. Returns null if invalid. */
export function normalizePhone(raw: string): string | null {
  let p = raw.replace(/[\s()-]/g, '');
  if (/^998\d{9}$/.test(p)) p = '+' + p; // Telegram contacts often omit the '+'
  return /^\+998\d{9}$/.test(p) ? p : null;
}

/** Synthetic, never-mailed email: Supabase Auth needs one, users never see it. */
export const syntheticEmail = () => `u_${crypto.randomUUID()}@users.ustara.local`;

// Rate limiting ------------------------------------------------------------
export async function countAttempts(key: string, windowMin: number): Promise<number> {
  const since = new Date(Date.now() - windowMin * 60_000).toISOString();
  const { count } = await admin.from('auth_attempts').select('id', { count: 'exact', head: true }).eq('key', key).gte('at', since);
  return count ?? 0;
}
export const recordAttempt = (...keys: string[]) => admin.from('auth_attempts').insert(keys.map((key) => ({ key })));

/** Mint a session for a user without their password (after Telegram confirmed who they are). */
export async function sessionFor(userId: string) {
  const { data: u, error } = await admin.auth.admin.getUserById(userId);
  if (error || !u.user?.email) throw new Error('user_not_found');
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
  if (linkErr) throw linkErr;
  const { data, error: otpErr } = await anonClient().auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (otpErr || !data.session) throw otpErr ?? new Error('no_session');
  return pickSession(data.session);
}

export const pickSession = (s: { access_token: string; refresh_token: string }) => ({
  access_token: s.access_token,
  refresh_token: s.refresh_token,
});

/** The signed-in user from the request's JWT, or null. */
export async function userFromRequest(req: Request) {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data.user ?? null;
}
