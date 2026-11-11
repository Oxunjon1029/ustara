// Telegram bot webhook: /start <token>, contact sharing, confirm/cancel buttons.
// Telegram must call this with the secret set via setWebhook(secret_token=TELEGRAM_WEBHOOK_SECRET).
import { admin, normalizePhone, randomToken, sha256, syntheticEmail } from '../_shared/util.ts';
import { SHARE_BUTTON, send, t, tg, openAppButton, WEBAPP_URL } from '../_shared/telegram.ts';

const SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
const CONFIRMED_GRACE_MIN = 10; // time to come back to the app after confirming

type Locale = 'uz' | 'ru';
interface TgUser { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string }
interface TgMessage { message_id: number; chat: { id: number }; from?: TgUser; text?: string; contact?: { phone_number: string; user_id?: number } }
interface TgCallback { id: string; from: TgUser; data?: string; message?: TgMessage }
interface TokenRow { id: string; purpose: 'login' | 'link' | 'reset'; status: string; user_id: string | null; expires_at: string; telegram_user_id: number | null }

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) return new Response('forbidden', { status: 401 });
  const update = await req.json().catch(() => null);
  try {
    if (update?.callback_query) await onCallback(update.callback_query);
    else if (update?.message?.contact) await onContact(update.message);
    else if (update?.message?.text) await onText(update.message);
  } catch (e) {
    console.error(e); // still 200, so Telegram doesn't retry forever
  }
  return new Response('ok');
});

const guessLocale = (u?: TgUser): Locale | null =>
  u?.language_code?.startsWith('ru') ? 'ru' : u?.language_code?.startsWith('uz') ? 'uz' : null;

async function linkByTelegram(tgId: number) {
  const { data } = await admin.from('telegram_links').select('user_id').eq('telegram_user_id', tgId).maybeSingle();
  if (!data) return null;
  const { data: p } = await admin.from('profiles').select('locale').eq('user_id', data.user_id).single();
  return { user_id: data.user_id as string, locale: (p?.locale ?? 'uz') as Locale };
}

const live = (row: TokenRow | null): row is TokenRow => !!row && row.status === 'pending' && new Date(row.expires_at) > new Date();
const expire = (id: string) => admin.from('auth_tokens').update({ status: 'expired' }).eq('id', id);

async function onText(msg: TgMessage) {
  const from = msg.from!;
  const [cmd, payload] = (msg.text ?? '').trim().split(/\s+/, 2);
  if (cmd !== '/start' || !payload) return void (await send(msg.chat.id, t(WEBAPP_URL ? 'helloApp' : 'hello', guessLocale(from)), openAppButton()));

  const { data } = await admin.from('auth_tokens').select('*').eq('token_hash', await sha256(payload)).maybeSingle();
  const row = data as TokenRow | null;
  if (!live(row)) return void (await send(msg.chat.id, t('expired', guessLocale(from))));

  await admin.from('auth_tokens').update({ telegram_user_id: from.id, bot_chat_id: msg.chat.id }).eq('id', row.id);
  const link = await linkByTelegram(from.id);
  const locale = link?.locale ?? guessLocale(from);

  if (row.purpose === 'link') {
    if (link && link.user_id !== row.user_id) {
      await expire(row.id);
      return void (await send(msg.chat.id, t('takenTelegram', locale)));
    }
    if (link) return confirm(row, link.user_id, msg.chat.id, t('doneLink', locale)); // already linked to this account
    return askContact(msg.chat.id, locale);
  }

  if (!link) {
    if (row.purpose === 'reset') {
      await expire(row.id);
      return void (await send(msg.chat.id, t('notLinked', locale)));
    }
    return askContact(msg.chat.id, locale); // first Telegram sign-in: prove the phone number
  }

  // Linked user: explicit confirmation protects against someone sending them a sign-in link.
  const sent = await send(msg.chat.id, t(row.purpose === 'reset' ? 'confirmReset' : 'confirmLogin', locale), {
    reply_markup: { inline_keyboard: [[{ text: t('yes', locale), callback_data: `c:${row.id}` }, { text: t('no', locale), callback_data: `x:${row.id}` }]] },
  });
  if (sent) await admin.from('auth_tokens').update({ bot_message_id: sent.message_id }).eq('id', row.id);
}

const askContact = async (chatId: number, locale: Locale | null) =>
  void (await send(chatId, t('askContact', locale), {
    reply_markup: { keyboard: [[{ text: SHARE_BUTTON, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
  }));

async function confirm(row: TokenRow, userId: string, chatId: number, text: string) {
  await admin.from('auth_tokens').update({
    status: 'confirmed',
    user_id: userId,
    expires_at: new Date(Date.now() + CONFIRMED_GRACE_MIN * 60_000).toISOString(),
  }).eq('id', row.id).eq('status', 'pending');
  await send(chatId, text, { reply_markup: { remove_keyboard: true } });
}

async function onContact(msg: TgMessage) {
  const from = msg.from!;
  const chatId = msg.chat.id;
  let locale = guessLocale(from);
  if (msg.contact!.user_id !== from.id) return void (await send(chatId, t('notOwnContact', locale)));
  const phone = normalizePhone(msg.contact!.phone_number);
  if (!phone) return void (await send(chatId, t('uzOnly', locale), { reply_markup: { remove_keyboard: true } }));

  const { data } = await admin
    .from('auth_tokens').select('*').eq('telegram_user_id', from.id).eq('status', 'pending')
    .in('purpose', ['login', 'link']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const row = data as TokenRow | null;
  if (!live(row)) return void (await send(chatId, t('expired', locale), { reply_markup: { remove_keyboard: true } }));

  const { data: byPhone } = await admin.from('profiles').select('user_id, locale').eq('phone', phone).maybeSingle();

  let userId: string;
  if (row.purpose === 'link') {
    const { data: me } = await admin.from('profiles').select('phone, locale').eq('user_id', row.user_id!).single();
    locale = (me?.locale ?? 'uz') as Locale;
    if (me?.phone && me.phone !== phone) return fin(row.id, chatId, t('phoneMismatch', locale));
    if (byPhone && byPhone.user_id !== row.user_id) return fin(row.id, chatId, t('takenPhone', locale));
    userId = row.user_id!;
  } else if (byPhone) {
    userId = byPhone.user_id;
    locale = byPhone.locale as Locale;
  } else {
    // First visit: create a client account owned by this verified phone number.
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || 'Mijoz';
    const { data: created, error } = await admin.auth.admin.createUser({
      email: syntheticEmail(),
      password: randomToken(24), // unknown to anyone; user can set one via reset later
      email_confirm: true,
      user_metadata: { full_name: name, phone, locale: locale ?? 'uz' },
      app_metadata: { role: 'client' },
    });
    if (error || !created.user) throw error ?? new Error('createUser failed');
    userId = created.user.id;
  }

  const { data: other } = await admin.from('telegram_links').select('telegram_user_id').eq('user_id', userId).maybeSingle();
  if (other && other.telegram_user_id !== from.id) return fin(row.id, chatId, t('takenPhone', locale));

  const { error: linkErr } = await admin.from('telegram_links').upsert(
    { user_id: userId, telegram_user_id: from.id, chat_id: chatId, tg_username: from.username ?? null, linked_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (linkErr) return fin(row.id, chatId, t('takenTelegram', locale));
  await admin.from('profiles').update({ phone, phone_verified: true }).eq('user_id', userId);

  await confirm(row, userId, chatId, t(row.purpose === 'link' ? 'doneLink' : 'doneLogin', locale));
}

/** End a token with a message and hide the share-contact keyboard. */
async function fin(tokenId: string, chatId: number, text: string) {
  await expire(tokenId);
  await send(chatId, text, { reply_markup: { remove_keyboard: true } });
}

async function onCallback(cb: TgCallback) {
  const [action, id] = (cb.data ?? '').split(':');
  const answer = () => tg('answerCallbackQuery', { callback_query_id: cb.id });
  const link = await linkByTelegram(cb.from.id);
  const locale = link?.locale ?? guessLocale(cb.from);

  const { data } = await admin.from('auth_tokens').select('*').eq('id', id).maybeSingle();
  const row = data as TokenRow | null;
  const edit = (text: string) =>
    cb.message && tg('editMessageText', { chat_id: cb.message.chat.id, message_id: cb.message.message_id, text });

  if (!live(row) || row.telegram_user_id !== cb.from.id || !link) {
    await answer();
    return void (await edit(t('expired', locale)));
  }
  if (action === 'c') {
    await admin.from('auth_tokens').update({
      status: 'confirmed',
      user_id: link.user_id,
      expires_at: new Date(Date.now() + CONFIRMED_GRACE_MIN * 60_000).toISOString(),
    }).eq('id', row.id).eq('status', 'pending');
    await answer();
    return void (await edit(t('doneLogin', locale)));
  }
  await expire(row.id);
  await answer();
  await edit(t('cancelled', locale));
}
