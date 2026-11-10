// One-time Telegram deep-link tokens.
// POST { action: 'create', purpose: 'login'|'link'|'reset' }  → { token, url, expires_at }   ('link' needs a signed-in user)
// POST { action: 'poll', token }                             → { status, session? }
// POST { action: 'reset_password', token, password }         → { session }
import {
  admin, anonClient, clientIp, cors, countAttempts, fail, json, pickSession, randomToken, recordAttempt, sessionFor, sha256,
  userFromRequest,
} from '../_shared/util.ts';
import { BOT_USERNAME } from '../_shared/telegram.ts';

const TOKENS_PER_15_MIN = 10;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const body = await req.json().catch(() => null);
  try {
    switch (body?.action) {
      case 'create': return await create(req, body.purpose);
      case 'poll': return await poll(body.token);
      case 'reset_password': return await resetPassword(body.token, body.password);
      default: return fail('bad_request');
    }
  } catch (e) {
    console.error(e);
    return fail('server_error', 500);
  }
});

async function create(req: Request, purpose: unknown) {
  if (purpose !== 'login' && purpose !== 'link' && purpose !== 'reset') return fail('bad_request');
  if (!BOT_USERNAME) return fail('telegram_not_configured', 503);

  const ip = clientIp(req);
  if ((await countAttempts(`tg:${ip}`, 15)) >= TOKENS_PER_15_MIN) return fail('too_many_attempts', 429);

  let userId: string | null = null;
  if (purpose === 'link') {
    const user = await userFromRequest(req);
    if (!user) return fail('unauthorized', 401);
    const { count } = await admin.from('telegram_links').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
    if (count) return fail('already_linked', 409);
    userId = user.id;
  }

  await recordAttempt(`tg:${ip}`);
  const token = randomToken();
  const { data, error } = await admin
    .from('auth_tokens')
    .insert({ token_hash: await sha256(token), purpose, user_id: userId })
    .select('expires_at')
    .single();
  if (error) throw error;
  return json({ token, url: `https://t.me/${BOT_USERNAME}?start=${token}`, expires_at: data.expires_at });
}

async function findToken(token: unknown) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const { data } = await admin.from('auth_tokens').select('*').eq('token_hash', await sha256(token)).maybeSingle();
  if (data && data.status !== 'used' && data.status !== 'expired' && new Date(data.expires_at) < new Date()) {
    await admin.from('auth_tokens').update({ status: 'expired' }).eq('id', data.id);
    data.status = 'expired';
  }
  return data;
}

async function poll(token: unknown) {
  const row = await findToken(token);
  if (!row) return fail('not_found', 404);
  if (row.status !== 'confirmed') return json({ status: row.status });

  if (row.purpose === 'reset') return json({ status: 'confirmed' }); // consumed by reset_password

  // Claim the token atomically so two polls can never both get a session.
  const { data: claimed } = await admin
    .from('auth_tokens').update({ status: 'used' }).eq('id', row.id).eq('status', 'confirmed').select('id');
  if (!claimed?.length) return json({ status: 'used' });

  if (row.purpose === 'login') return json({ status: 'confirmed', session: await sessionFor(row.user_id) });
  return json({ status: 'confirmed' });
}

async function resetPassword(token: unknown, password: unknown) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) return fail('password_too_short');
  const row = await findToken(token);
  if (!row || row.purpose !== 'reset') return fail('not_found', 404);
  if (row.status !== 'confirmed') return fail('expired', 410);

  const { data: claimed } = await admin
    .from('auth_tokens').update({ status: 'used' }).eq('id', row.id).eq('status', 'confirmed').select('id');
  if (!claimed?.length) return fail('expired', 410);

  const { data: u, error } = await admin.auth.admin.updateUserById(row.user_id, { password });
  if (error || !u.user?.email) throw error ?? new Error('no_email');
  await admin.from('profiles').update({ failed_logins: 0, locked_until: null }).eq('user_id', row.user_id);

  const { data, error: signInErr } = await anonClient().auth.signInWithPassword({ email: u.user.email, password });
  if (signInErr || !data.session) throw signInErr ?? new Error('no_session');
  return json({ session: pickSession(data.session) });
}
