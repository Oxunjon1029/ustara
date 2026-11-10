import { utcToTashkent, weekdayOf, type Locale } from '@ustara/shared';

// Formatted by hand: Intl support for Uzbek varies between Android builds.
const WD_SHORT: Record<Locale, string[]> = {
  uz: ['Ya', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sh'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
};
const WD_LONG: Record<Locale, string[]> = {
  uz: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'],
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
};
const MONTHS: Record<Locale, string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
const MONTHS_TITLE: Record<Locale, string[]> = {
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
};

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];

export const weekdayShort = (date: string, l: Locale) => WD_SHORT[l][weekdayOf(date)];
export const weekdayName = (weekday: number, l: Locale) => WD_LONG[l][weekday];

/** "9-noyabr" / "9 ноября" */
export function dayMonth(date: string, l: Locale) {
  const [, m, d] = parts(date);
  return l === 'ru' ? `${d} ${MONTHS[l][m - 1]}` : `${d}-${MONTHS[l][m - 1]}`;
}

/** "Dushanba, 9-noyabr" */
export const longDate = (date: string, l: Locale) => `${WD_LONG[l][weekdayOf(date)]}, ${dayMonth(date, l)}`;

/** "Noyabr 2026" */
export function monthYear(date: string, l: Locale) {
  const [y, m] = parts(date);
  return `${MONTHS_TITLE[l][m - 1]} ${y}`;
}

/** "Du, 9-noyabr · 14:30" for a UTC timestamp. */
export function whenLabel(iso: string, l: Locale) {
  const { date, time } = utcToTashkent(new Date(iso));
  return `${weekdayShort(date, l)}, ${dayMonth(date, l)} · ${time}`;
}

export const localTime = (iso: string | Date) => utcToTashkent(typeof iso === 'string' ? new Date(iso) : iso).time;
export const localDate = (iso: string | Date) => utcToTashkent(typeof iso === 'string' ? new Date(iso) : iso).date;
export const todayLocal = () => utcToTashkent(new Date()).date;
