#!/usr/bin/env node
// Create an admin account on a Supabase project (e.g. a fresh production project).
//   node scripts/create-admin.mjs --ref=<project-ref>
// Asks for name, username, phone and password in this terminal. The project's service key is fetched
// with the Supabase CLI and used only for this request; nothing is printed or saved.
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const ref = process.argv.find((a) => a.startsWith('--ref='))?.slice(6);
if (!ref) {
  console.error('Usage: node scripts/create-admin.mjs --ref=<project-ref>');
  process.exit(1);
}

const keys = spawnSync('npx', ['supabase', 'projects', 'api-keys', `--remote=${ref}`, '-o', 'json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
let serviceKey;
try {
  serviceKey = JSON.parse(keys.stdout).find((k) => k.name === 'service_role')?.api_key;
} catch {}
if (!serviceKey) {
  console.error('Could not read the project keys. Are you logged in (npx supabase login)?');
  process.exit(1);
}

console.log(`Project: ${ref}`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const fullName = (await rl.question('Full name: ')).trim();
const username = (await rl.question('Username (letters, digits, _): ')).trim();
const rawPhone = (await rl.question('Phone (+998..., optional): ')).replace(/[\s()-]/g, '');
const password = await rl.question('Password (min 8 chars): ');
rl.close();

if (fullName.length < 2) throw new Error('Name is too short');
if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) throw new Error('Invalid username');
if (rawPhone && !/^\+998\d{9}$/.test(rawPhone)) throw new Error('Phone must look like +998901234567');
if (password.length < 8) throw new Error('Password must be at least 8 characters');

const res = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: `u_${randomUUID()}@users.ustara.local`, // synthetic; users sign in with username or phone
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, username, phone: rawPhone || null, locale: 'uz' },
    app_metadata: { role: 'admin' },
  }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Failed:', res.status, body.msg ?? body.message ?? body.error_description ?? body);
  process.exit(1);
}
// The profile row is created before Auth stores app_metadata, so set the role explicitly.
const promote = await fetch(`https://${ref}.supabase.co/rest/v1/profiles?user_id=eq.${body.id}`, {
  method: 'PATCH',
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ role: 'admin' }),
});
if (!promote.ok) {
  console.error('Account created but could not make it admin:', promote.status, await promote.text());
  process.exit(1);
}
console.log(`Admin created: ${username}. Sign in with this username and password.`);
