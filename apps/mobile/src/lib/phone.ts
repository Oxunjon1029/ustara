/**
 * Formats an Uzbek mobile number as the user types: "+998 95 555 55 55".
 * Typing without the country code works too ("955555555" → "+998 95 555 55 55"), and the prefix can be deleted.
 * The server strips spaces, so the formatted value can be sent as is.
 */
export function formatPhone(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if ('998'.startsWith(digits)) return digits ? `+${digits}` : '';
  const rest = (digits.startsWith('998') ? digits.slice(3) : digits).slice(0, 9);
  const parts = [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5, 7), rest.slice(7, 9)].filter(Boolean);
  return ['+998', ...parts].join(' ');
}
