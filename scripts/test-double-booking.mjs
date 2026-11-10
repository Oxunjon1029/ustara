#!/usr/bin/env node
// Milestone 3 acceptance check: two phones booking the same slot at once → exactly one booking.
//   node scripts/test-double-booking.mjs [login] [password]
// Uses apps/mobile/.env (URL + anon key) and a demo client (default aziz / password12).
// Signs in twice (two independent sessions), fires create_booking for the same barber, service
// and time concurrently, checks the result, then cancels the booking it created.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../apps/mobile/.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const [login = 'aziz', password = 'password12'] = process.argv.slice(2);

const call = async (path, body, token = KEY, method = 'POST') => {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const signIn = async () => {
  const r = await call('/functions/v1/auth-password', { action: 'login', login, password });
  if (!r.body?.session) throw new Error(`login failed: ${JSON.stringify(r.body)}`);
  return r.body.session.access_token;
};

const [phoneA, phoneB] = await Promise.all([signIn(), signIn()]);

const barber = (await call('/rest/v1/barbers?select=id&is_active=eq.true&limit=1', null, phoneA, 'GET')).body[0].id;
const service = (await call('/rest/v1/services?select=id,duration_min&is_active=eq.true&order=sort&limit=1', null, phoneA, 'GET')).body[0];

// Next Mon–Sat, 2 days out, 16:30 Tashkent (UTC+5) — inside seeded working hours.
const d = new Date(Date.now() + 2 * 86_400_000);
if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
const startsAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 16 - 5, 30)).toISOString();

const args = { p_barber: barber, p_service: service.id, p_starts_at: startsAt };
const results = await Promise.all([
  call('/rest/v1/rpc/create_booking', args, phoneA),
  call('/rest/v1/rpc/create_booking', args, phoneB),
]);

const ok = results.filter((r) => r.status === 200);
const taken = results.filter((r) => r.body?.message === 'slot_taken');
console.log('slot:', startsAt);
results.forEach((r, i) => console.log(`phone ${i ? 'B' : 'A'}:`, r.status, r.status === 200 ? `booking ${r.body}` : r.body?.message));

for (const r of ok) await call('/rest/v1/rpc/cancel_booking', { p_booking: r.body }, phoneA); // clean up

if (ok.length === 1 && taken.length === 1) {
  console.log('PASS: exactly one booking');
} else {
  console.log('FAIL');
  process.exit(1);
}
