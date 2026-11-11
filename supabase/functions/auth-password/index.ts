// Password sign-up and login with rate limiting and lockout.
// POST { action: 'login', login, password }
// POST { action: 'signup', full_name, phone, username, password, locale }
// Admin only (caller's JWT): { action: 'create_barber', full_name, username, password, phone? } → { user_id, barber_id }
//                            { action: 'set_password', user_id, password } → { ok: true }
// → { session: { access_token, refresh_token } } | { error: code }
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  SUPABASE_URL, admin, anonClient, clientIp, cors, countAttempts, fail, json, normalizePhone, pickSession, recordAttempt, syntheticEmail, userFromRequest,
} from '../_shared/util.ts';
import { linkFor, send, t } from '../_shared/telegram.ts';

const WINDOW_MIN = 15;
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const SIGNUPS_PER_HOUR = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const body = await req.json().catch(() => null);
  const ip = clientIp(req);
  try {
    if (body?.action === 'login') return await login(body, ip);
    if (body?.action === 'signup') return await signup(body, ip);
    if (body?.action === 'create_barber') return await createBarber(req, body);
    if (body?.action === 'set_password') return await setPassword(req, body);
    return fail('bad_request');
  } catch (e) {
    console.error(e);
    return fail('server_error', 500);
  }
});

async function login(body: { login?: unknown; password?: unknown }, ip: string) {
  const loginId = typeof body.login === 'string' ? body.login.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!loginId || !password) return fail('invalid_credentials', 401);

  // One round trip: account, its auth email, and the IP / account failure counts.
  const phone = normalizePhone(loginId);
  const { data: rows, error: lookupErr } = await admin.rpc('login_lookup', {
    p_login: phone ?? loginId, p_ip_key: `ip:${ip}`, p_window_min: WINDOW_MIN,
  });
  if (lookupErr) throw lookupErr;
  const acct = rows?.[0] as {
    user_id: string | null; email: string | null; locked_until: string | null; failed_logins: number; ip_fails: number; acct_fails: number;
  } | undefined;
  if (!acct || acct.ip_fails >= MAX_FAILS) return fail('too_many_attempts', 429);
  if (!acct.user_id) {
    await recordAttempt(`ip:${ip}`);
    return fail('invalid_credentials', 401);
  }
  if (acct.locked_until && new Date(acct.locked_until) > new Date()) {
    return fail('locked', 423, { until: acct.locked_until });
  }
  if (acct.acct_fails >= MAX_FAILS) return fail('too_many_attempts', 429);

  const email = acct.email;
  const { data, error } = email
    ? await anonClient().auth.signInWithPassword({ email, password })
    : { data: null, error: new Error('no_email') };

  if (error || !data?.session) {
    await recordAttempt(`ip:${ip}`, `acct:${acct.user_id}`);
    const fails = acct.failed_logins + 1;
    if (fails >= MAX_FAILS) {
      const until = new Date(Date.now() + LOCK_MIN * 60_000).toISOString();
      await admin.from('profiles').update({ failed_logins: 0, locked_until: until }).eq('user_id', acct.user_id);
      const link = await linkFor(acct.user_id);
      if (link) await send(link.chat_id, t('locked', link.locale));
      return fail('locked', 423, { until });
    }
    await admin.from('profiles').update({ failed_logins: fails }).eq('user_id', acct.user_id);
    return fail('invalid_credentials', 401);
  }

  // Only write when there is something to reset (saves a round trip on normal logins).
  if (acct.failed_logins > 0 || acct.locked_until) {
    await admin.from('profiles').update({ failed_logins: 0, locked_until: null }).eq('user_id', acct.user_id);
  }
  return json({ session: pickSession(data.session) });
}

async function signup(
  body: { full_name?: unknown; phone?: unknown; username?: unknown; password?: unknown; locale?: unknown },
  ip: string,
) {
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const phone = typeof body.phone === 'string' ? normalizePhone(body.phone) : null;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const locale = body.locale === 'ru' ? 'ru' : 'uz';

  if (fullName.length < 2 || fullName.length > 80) return fail('invalid_name');
  if (!phone) return fail('invalid_phone');
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) return fail('invalid_username');
  if (password.length < 8 || password.length > 72) return fail('password_too_short');

  if ((await countAttempts(`signup:${ip}`, 60)) >= SIGNUPS_PER_HOUR) return fail('too_many_attempts', 429);

  const { count: phoneTaken } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('phone', phone);
  if (phoneTaken) return fail('phone_taken', 409);
  const { data: sameName } = await admin.rpc('find_login', { p_login: username }); // case-insensitive username match
  if (sameName?.length) return fail('username_taken', 409);

  await recordAttempt(`signup:${ip}`);
  const email = syntheticEmail();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, username, locale },
    app_metadata: { role: 'client' },
  });
  if (error) {
    console.error('createUser', error);
    return fail('server_error', 500);
  }
  const { data, error: signInErr } = await anonClient().auth.signInWithPassword({ email, password });
  if (signInErr || !data.session) return fail('server_error', 500);
  return json({ session: pickSession(data.session) });
}

/** The caller, if their profile is an admin. */
async function requireAdmin(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return null;
  const { data } = await admin.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
  return data?.role === 'admin' ? user : null;
}

/** Admin creates a ready-to-use barber login (no sign-up or Telegram needed by the barber). */
async function createBarber(
  req: Request,
  body: { full_name?: unknown; phone?: unknown; username?: unknown; password?: unknown; locale?: unknown },
) {
  if (!(await requireAdmin(req))) return fail('forbidden', 403);
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const locale = body.locale === 'ru' ? 'ru' : 'uz';

  if (fullName.length < 2 || fullName.length > 80) return fail('invalid_name');
  if (rawPhone && !phone) return fail('invalid_phone');
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) return fail('invalid_username');
  if (password.length < 8 || password.length > 72) return fail('password_too_short');

  if (phone) {
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('phone', phone);
    if (count) return fail('phone_taken', 409);
  }
  const { data: sameName } = await admin.rpc('find_login', { p_login: username });
  if (sameName?.length) return fail('username_taken', 409);

  const { data: created, error } = await admin.auth.admin.createUser({
    email: syntheticEmail(),
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, username, locale },
    app_metadata: { role: 'barber' },
  });
  if (error || !created.user) {
    console.error('createUser', error);
    return fail('server_error', 500);
  }

  // Services + default hours via the same RPC the app uses, run as the calling admin.
  const asAdmin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
  });
  const { error: setupErr } = await asAdmin.rpc('admin_set_barber', { p_user: created.user.id, p_active: true });
  if (setupErr) {
    console.error('admin_set_barber', setupErr);
    await admin.auth.admin.deleteUser(created.user.id); // don't leave a half-made account behind
    return fail('server_error', 500);
  }
  const { data: b } = await admin.from('barbers').select('id').eq('user_id', created.user.id).single();
  return json({ user_id: created.user.id, barber_id: b?.id });
}

/** Admin sets a new password for a barber or client (e.g. forgotten, no Telegram linked). Also lifts a lockout. */
async function setPassword(req: Request, body: { user_id?: unknown; password?: unknown }) {
  if (!(await requireAdmin(req))) return fail('forbidden', 403);
  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 72) return fail('password_too_short');
  const { data: p } = await admin.from('profiles').select('role').eq('user_id', userId).maybeSingle();
  if (!p || p.role === 'admin') return fail('not_found', 404);
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    console.error('updateUserById', error);
    return fail('server_error', 500);
  }
  await admin.from('profiles').update({ failed_logins: 0, locked_until: null }).eq('user_id', userId);
  return json({ ok: true });
}
