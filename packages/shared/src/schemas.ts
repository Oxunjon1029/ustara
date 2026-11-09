import { z } from 'zod';

/** Uzbek mobile: +998 followed by 9 digits. Accepts spaces/dashes. */
export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s()-]/g, ''))
  .refine((s) => /^\+998\d{9}$/.test(s), 'invalid_phone');

export const usernameSchema = z.string().regex(/^[a-z0-9_]{3,32}$/i, 'invalid_username');
export const passwordSchema = z.string().min(8, 'password_too_short').max(72);

export const signUpSchema = z.object({
  full_name: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  username: usernameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  login: z.string().trim().min(3),
  password: z.string().min(1),
});

export const createBookingSchema = z.object({
  barber_id: z.string().uuid(),
  service_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
});

export const walkInSchema = createBookingSchema.extend({
  walkin_name: z.string().trim().max(80).optional(),
  walkin_phone: phoneSchema.optional(),
  paid_cash: z.boolean().default(true),
});

/** Luhn + 16 digits + known UZ prefix (Uzcard 8600, Humo 9860) or Visa/MC. */
export function cardBrand(num: string): 'uzcard' | 'humo' | 'visa' | 'mastercard' | null {
  const n = num.replace(/\D/g, '');
  if (n.length !== 16) return null;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let d = Number(n[15 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  if (sum % 10 !== 0) return null;
  if (n.startsWith('8600')) return 'uzcard';
  if (n.startsWith('9860')) return 'humo';
  if (n.startsWith('4')) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'mastercard';
  return null;
}

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type WalkInInput = z.infer<typeof walkInSchema>;
