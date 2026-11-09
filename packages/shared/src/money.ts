import type { Locale } from './types';

/** 50000 → "50 000 soʻm" (uz) / "50 000 сум" (ru). Integer UZS only. */
export function formatUzs(amount: number, locale: Locale = 'uz', withUnit = true): string {
  const sign = amount < 0 ? '-' : '';
  const digits = Math.abs(Math.trunc(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return withUnit ? `${sign}${digits} ${locale === 'ru' ? 'сум' : 'soʻm'}` : `${sign}${digits}`;
}

/** Payme sends amounts in tiyin. */
export const uzsToTiyin = (uzs: number) => uzs * 100;
