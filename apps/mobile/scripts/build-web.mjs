#!/usr/bin/env node
// Build the web / Telegram Mini App bundle against a chosen Supabase project.
//   node scripts/build-web.mjs prod   → .env.production → dist-web-prod   (Cloudflare project "ustara")
//   node scripts/build-web.mjs dev    → .env            → dist-web-dev    (Cloudflare project "ustara-dev")
// Variables from the chosen file are put in the process environment, which Expo never overrides,
// so the other env file can't leak in. In CI there is no env file: the EXPO_PUBLIC_* variables come from the job.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const target = process.argv[2];
if (target !== 'prod' && target !== 'dev') {
  console.error('Usage: node scripts/build-web.mjs <prod|dev>');
  process.exit(1);
}
const file = target === 'prod' ? '.env.production' : '.env';

const vars = {};
const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
for (const line of lines) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) vars[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
// Job environment (CI) wins over nothing; a local env file wins over a stray shell variable.
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith('EXPO_PUBLIC_') && !(k in vars) && v) vars[k] = v;
}
if (!vars.EXPO_PUBLIC_SUPABASE_URL || !vars.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.error(`Missing EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY (from ${file} or the environment)`);
  process.exit(1);
}
console.log(`Building web (${target}) against ${vars.EXPO_PUBLIC_SUPABASE_URL}`);

const out = `dist-web-${target}`;
const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', out], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ...vars },
});
process.exit(r.status ?? 1);
