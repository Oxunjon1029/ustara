import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Locale } from '@ustara/shared';
import uz from './uz.json';
import ru from './ru.json';

const KEY = 'ustara.locale';
const deviceLocale: Locale = getLocales()[0]?.languageCode === 'ru' ? 'ru' : 'uz';

i18n.use(initReactI18next).init({
  resources: { uz: { translation: uz }, ru: { translation: ru } },
  lng: deviceLocale,
  fallbackLng: 'uz',
  interpolation: { escapeValue: false },
});

AsyncStorage.getItem(KEY).then((saved) => {
  if (saved === 'uz' || saved === 'ru') i18n.changeLanguage(saved);
});

export function setLocale(locale: Locale) {
  AsyncStorage.setItem(KEY, locale);
  syncProfileLocale(locale);
  return i18n.changeLanguage(locale);
}

/** Store the language on the profile so notifications arrive in it. No-op when signed out. */
export async function syncProfileLocale(locale: Locale = currentLocale()) {
  const { supabase, isDemo } = await import('../lib/supabase');
  if (isDemo) return;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (uid) await supabase.from('profiles').update({ locale }).eq('user_id', uid);
}

export const currentLocale = (): Locale => (i18n.language === 'ru' ? 'ru' : 'uz');
export default i18n;
