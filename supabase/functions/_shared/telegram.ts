import { admin } from './util.ts';

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
export const BOT_USERNAME = Deno.env.get('TELEGRAM_BOT_USERNAME') ?? '';

/** Button labels are a single line, so this one is bilingual instead of going through t(). */
export const SHARE_BUTTON = '📱 Raqamni ulashish / Поделиться номером';

/** Telegram Mini App address (secret WEBAPP_URL); without it no 'open app' buttons are shown. */
export const WEBAPP_URL = (Deno.env.get('WEBAPP_URL') ?? '').replace(/\/+$/, '');

/** Inline 'open the app' button (optionally at an app path), for private chats. */
export const openAppButton = (path = '') =>
  WEBAPP_URL
    ? { reply_markup: { inline_keyboard: [[{ text: '✂️ Ilovani ochish / Открыть приложение', web_app: { url: WEBAPP_URL + path } }]] } }
    : {};

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!TOKEN) return null;
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) console.error('telegram', method, data.description);
  return data.ok ? (data.result as T) : null;
}

export const send = (chat_id: number, text: string, extra: Record<string, unknown> = {}) =>
  tg<{ message_id: number }>('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra });

type Locale = 'uz' | 'ru';

/** Bot copy. Users who haven't linked yet get Uzbek with a Russian line underneath. */
export const T = {
  askContact: {
    uz: 'Ustara hisobingizni tasdiqlash uchun pastdagi tugma orqali telefon raqamingizni ulashing.',
    ru: 'Чтобы подтвердить аккаунт Ustara, поделитесь номером телефона кнопкой ниже.',
  },
  confirmLogin: {
    uz: 'Ustara ilovasiga kirishni tasdiqlaysizmi?\n\nFaqat hozir ilovada «Telegram orqali kirish»ni bosgan boʻlsangiz tasdiqlang.',
    ru: 'Подтвердить вход в приложение Ustara?\n\nПодтверждайте, только если вы сейчас нажали «Войти через Telegram» в приложении.',
  },
  confirmReset: {
    uz: 'Ustara parolini tiklashni tasdiqlaysizmi? Keyin ilovada yangi parol kiritasiz.',
    ru: 'Подтвердить сброс пароля Ustara? Затем введите новый пароль в приложении.',
  },
  yes: { uz: '✅ Tasdiqlash', ru: '✅ Подтвердить' },
  no: { uz: 'Bekor qilish', ru: 'Отмена' },
  doneLogin: { uz: '✅ Tasdiqlandi. Ilovaga qayting.', ru: '✅ Подтверждено. Вернитесь в приложение.' },
  doneLink: { uz: '✅ Telegram hisobingizga ulandi. Ilovaga qayting.', ru: '✅ Telegram привязан к аккаунту. Вернитесь в приложение.' },
  cancelled: { uz: 'Bekor qilindi.', ru: 'Отменено.' },
  expired: { uz: 'Havola eskirgan. Ilovada qaytadan urinib koʻring.', ru: 'Ссылка устарела. Попробуйте снова в приложении.' },
  notLinked: {
    uz: 'Bu Telegram hech qaysi Ustara hisobiga ulanmagan. Parolni tiklash uchun administratorga murojaat qiling.',
    ru: 'Этот Telegram не привязан к аккаунту Ustara. Для сброса пароля обратитесь к администратору.',
  },
  notOwnContact: { uz: 'Iltimos, oʻzingizning raqamingizni ulashing.', ru: 'Пожалуйста, поделитесь своим номером.' },
  uzOnly: { uz: 'Faqat Oʻzbekiston raqamlari (+998) qabul qilinadi.', ru: 'Принимаются только номера Узбекистана (+998).' },
  phoneMismatch: {
    uz: 'Bu raqam hisobingizdagi raqamga mos kelmaydi.',
    ru: 'Этот номер не совпадает с номером в вашем аккаунте.',
  },
  takenTelegram: {
    uz: 'Bu Telegram boshqa Ustara hisobiga ulangan.',
    ru: 'Этот Telegram уже привязан к другому аккаунту Ustara.',
  },
  takenPhone: {
    uz: 'Bu raqamdagi hisob boshqa Telegramga ulangan.',
    ru: 'Аккаунт с этим номером привязан к другому Telegram.',
  },
  hello: {
    uz: 'Salom! Bu Ustara boti. Kirish uchun ilovada «Telegram orqali kirish»ni bosing.',
    ru: 'Здравствуйте! Это бот Ustara. Для входа нажмите «Войти через Telegram» в приложении.',
  },
  helloApp: {
    uz: 'Salom! Bu Ustara — sartaroshga onlayn navbat.\n\nNavbat olish, bronlaringizni koʻrish va bekor qilish uchun pastdagi «Ilovani ochish» tugmasini bosing. Eslatmalar shu chatga keladi.',
    ru: 'Здравствуйте! Это Ustara — онлайн-запись к барберу.\n\nЧтобы записаться, посмотреть или отменить записи, нажмите «Открыть приложение» ниже. Напоминания будут приходить в этот чат.',
  },
  locked: {
    uz: '⚠️ Hisobingizga 5 marta notoʻgʻri parol bilan kirishga urinildi. Hisob 15 daqiqaga bloklandi. Agar bu siz boʻlmasangiz, parolni tiklang.',
    ru: '⚠️ 5 неудачных попыток входа в ваш аккаунт. Аккаунт заблокирован на 15 минут. Если это были не вы, сбросьте пароль.',
  },
} satisfies Record<string, Record<Locale, string>>;

export const t = (key: keyof typeof T, locale: Locale | null) =>
  locale ? T[key][locale] : `${T[key].uz}\n\n${T[key].ru}`;

/** Telegram link + profile locale for a user, if linked. */
export async function linkFor(userId: string) {
  const { data } = await admin.from('telegram_links').select('chat_id, telegram_user_id').eq('user_id', userId).maybeSingle();
  if (!data) return null;
  const { data: p } = await admin.from('profiles').select('locale').eq('user_id', userId).single();
  return { ...data, locale: (p?.locale ?? 'uz') as Locale };
}
