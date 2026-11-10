import type { TFunction } from 'i18next';
import { utcToTashkent } from '@ustara/shared';

/** Turn an Edge Function error code into a translated message. */
export function errorText(t: TFunction, code: string | null | undefined, extra?: Record<string, unknown>): string | null {
  if (!code) return null;
  if (code === 'locked' && typeof extra?.until === 'string') {
    return t('auth.errors.locked', { time: utcToTashkent(new Date(extra.until)).time });
  }
  const key = `auth.errors.${code}`;
  const msg = t(key);
  return msg === key ? t('auth.errors.server_error') : msg;
}
