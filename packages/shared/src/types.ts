export type Role = 'client' | 'barber' | 'admin';
export type Locale = 'uz' | 'ru';
export type BookingStatus = 'held' | 'confirmed' | 'completed' | 'no_show' | 'cancelled' | 'expired';
export type BookingSource = 'app' | 'walkin';
export type PaymentMode = 'in_shop' | 'online';
export type FeePayer = 'client' | 'barber';

/** Statuses that occupy a barber's time (mirrors the DB exclusion constraint). */
export const BLOCKING_STATUSES: readonly BookingStatus[] = ['held', 'confirmed'];

/** Uzbekistan has no DST: Asia/Tashkent is always UTC+5. */
export const TASHKENT_OFFSET_MIN = 5 * 60;
