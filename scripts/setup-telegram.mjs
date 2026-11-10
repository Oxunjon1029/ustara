#!/usr/bin/env node
// One-time Telegram bot setup for the linked Supabase project.
//   node scripts/setup-telegram.mjs
// Asks for the BotFather token (never stored in the repo), saves it as a Supabase secret
// together with the bot username and a fresh webhook secret, then registers the webhook.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const refFile = new URL('../supabase/.temp/project-ref', import.meta.url);
let ref;
try {
  ref = readFileSync(refFile, 'utf8').trim();
} catch {
  console.error('No linked project. Run: npx supabase link --project-ref <ref>');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const token = (await rl.question('Bot token from @BotFather: ')).trim();
rl.close();

const api = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
};

const me = await api('getMe');
console.log(`Bot: @${me.username}`);

const webhookSecret = randomBytes(32).toString('hex');
const set = spawnSync(
  'npx',
  // --yes: running this script is the confirmation (the CLI can't prompt without a terminal on stdin)
  ['supabase', 'secrets', 'set', `--remote=${ref}`, '--yes',
    `TELEGRAM_BOT_TOKEN=${token}`, `TELEGRAM_BOT_USERNAME=${me.username}`, `TELEGRAM_WEBHOOK_SECRET=${webhookSecret}`],
  { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' },
);
if (set.status !== 0) process.exit(set.status ?? 1);

await api('setWebhook', {
  url: `https://${ref}.supabase.co/functions/v1/telegram-webhook`,
  secret_token: webhookSecret,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true,
});
await api('setMyCommands', { commands: [{ command: 'start', description: 'Ustara' }] });
console.log('Webhook registered. Done.');
