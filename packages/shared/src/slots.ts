import { TASHKENT_OFFSET_MIN } from './types';

export interface WorkingHours {
  /** 0 = Sunday … 6 = Saturday (matches JS getDay and Postgres dow) */
  weekday: number;
  /** Local Tashkent clock, "HH:MM" */
  start_local: string;
  end_local: string;
}

export interface Interval {
  starts_at: string | Date;
  ends_at: string | Date;
}

export interface Slot {
  starts_at: Date;
  /** End of the service itself (what the client sees) */
  service_ends_at: Date;
  /** End including buffer (what the booking row stores) */
  ends_at: Date;
  available: boolean;
}

export interface SlotInput {
  /** Local Tashkent date, "YYYY-MM-DD" */
  date: string;
  workingHours: readonly WorkingHours[];
  timeOff?: readonly Interval[];
  bookings?: readonly Interval[];
  durationMin: number;
  bufferMin?: number;
  /** Grid step; defaults to duration + buffer */
  stepMin?: number;
  /** Slots starting before now + leadMin are unavailable */
  now?: Date;
  leadMin?: number;
}

const MIN = 60_000;
const toMs = (d: string | Date) => (typeof d === 'string' ? Date.parse(d) : d.getTime());

/** Local Tashkent "YYYY-MM-DD" + "HH:MM" → UTC Date. */
export function tashkentToUtc(date: string, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - TASHKENT_OFFSET_MIN * MIN);
}

/** UTC Date → local Tashkent parts. */
export function utcToTashkent(d: Date): { date: string; time: string; weekday: number } {
  const local = new Date(d.getTime() + TASHKENT_OFFSET_MIN * MIN);
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), weekday: local.getUTCDay() };
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

export function generateSlots(input: SlotInput): Slot[] {
  const buffer = input.bufferMin ?? 0;
  const step = input.stepMin ?? input.durationMin + buffer;
  if (input.durationMin <= 0 || step <= 0) throw new Error('duration and step must be positive');

  const weekday = weekdayOf(input.date);
  const busy = [...(input.timeOff ?? []), ...(input.bookings ?? [])].map((i) => [toMs(i.starts_at), toMs(i.ends_at)] as const);
  const earliest = input.now ? input.now.getTime() + (input.leadMin ?? 0) * MIN : -Infinity;

  const slots: Slot[] = [];
  for (const wh of input.workingHours.filter((w) => w.weekday === weekday)) {
    const dayStart = tashkentToUtc(input.date, wh.start_local).getTime();
    const dayEnd = tashkentToUtc(input.date, wh.end_local).getTime();
    for (let s = dayStart; s + input.durationMin * MIN <= dayEnd; s += step * MIN) {
      const serviceEnd = s + input.durationMin * MIN;
      const end = serviceEnd + buffer * MIN;
      const available = s >= earliest && !busy.some(([bs, be]) => overlaps(s, end, bs, be));
      slots.push({ starts_at: new Date(s), service_ends_at: new Date(serviceEnd), ends_at: new Date(end), available });
    }
  }
  return slots.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
}

/** Next N local dates starting from `from` (for the 14-day date strip). */
export function dateStrip(from: Date, days = 14): string[] {
  const start = utcToTashkent(from).date;
  const [y, m, d] = start.split('-').map(Number);
  return Array.from({ length: days }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}
