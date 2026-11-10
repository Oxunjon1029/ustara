// Password sign-up and login with rate limiting and lockout.
// POST { action: 'login', login, password }
// POST { action: 'signup', full_name, phone, username, password, locale }
// → { session: { access_token, refresh_token } } | { error: code }
import {
  admin, anonClient, clientIp, cors, countAttempts, fail, json, normalizePhone, pickSession, recordAttempt, syntheticEmail,
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

  if ((await countAttempts(`ip:${ip}`, WINDOW_MIN)) >= MAX_FAILS) return fail('too_many_attempts', 429);

  const phone = normalizePhone(loginId);
  const { data: rows } = await admin.rpc('find_login', { p_login: phone ?? loginId });
  const acct = rows?.[0] as { user_id: string; locked_until: string | null; failed_logins: number } | undefined;
  if (!acct) {
    await recordAttempt(`ip:${ip}`);
    return fail('invalid_credentials', 401);
  }
  if (acct.locked_until && new Date(acct.locked_until) > new Date()) {
    return fail('locked', 423, { until: acct.locked_until });
  }
  if ((await countAttempts(`acct:${acct.user_id}`, WINDOW_MIN)) >= MAX_FAILS) return fail('too_many_attempts', 429);

  const { data: u } = await admin.auth.admin.getUserById(acct.user_id);
  const email = u.user?.email;
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

  await admin.from('profiles').update({ failed_logins: 0, locked_until: null }).eq('user_id', acct.user_id);
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
