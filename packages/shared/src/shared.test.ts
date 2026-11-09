import { describe, expect, it } from 'vitest';
import {
  cardBrand,
  computeFee,
  dateStrip,
  DEFAULT_FEE_TIERS,
  formatUzs,
  generateSlots,
  phoneSchema,
  tashkentToUtc,
  utcToTashkent,
  validateTiers,
} from './index';

describe('fee', () => {
  it.each([
    [25000, 1000, 24000],
    [30000, 1000, 29000],
    [30001, 2000, 28001],
    [50000, 2000, 48000],
    [60000, 2000, 58000],
    [80000, 3000, 77000],
  ])('price %i → fee %i, net %i', (price, fee, net) => {
    const r = computeFee(price, DEFAULT_FEE_TIERS);
    expect(r.fee_uzs).toBe(fee);
    expect(r.barber_net_uzs).toBe(net);
    expect(r.client_total_uzs).toBe(price);
  });

  it('never exceeds the price', () => {
    expect(computeFee(500, DEFAULT_FEE_TIERS).barber_net_uzs).toBe(0);
  });

  it('rejects non-integer prices', () => {
    expect(() => computeFee(10.5, DEFAULT_FEE_TIERS)).toThrow();
  });

  it('validates tiers', () => {
    expect(validateTiers(DEFAULT_FEE_TIERS)).toBeNull();
    expect(validateTiers([...DEFAULT_FEE_TIERS, { id: 'x', min_price_uzs: 50000, max_price_uzs: 55000, fee_uzs: 1 }])).toBe('Tiers overlap');
  });
});

describe('time', () => {
  it('converts Tashkent ↔ UTC', () => {
    const d = tashkentToUtc('2026-11-09', '14:30');
    expect(d.toISOString()).toBe('2026-11-09T09:30:00.000Z');
    expect(utcToTashkent(d)).toEqual({ date: '2026-11-09', time: '14:30', weekday: 1 });
  });

  it('builds a 14-day strip in local time', () => {
    const strip = dateStrip(new Date('2026-11-08T20:00:00Z')); // 01:00 on the 9th in Tashkent
    expect(strip).toHaveLength(14);
    expect(strip[0]).toBe('2026-11-09');
    expect(strip[13]).toBe('2026-11-22');
  });
});

describe('slots', () => {
  const hours = [{ weekday: 1, start_local: '10:00', end_local: '19:00' }];

  it('generates a 45-minute grid like the UI', () => {
    const slots = generateSlots({ date: '2026-11-09', workingHours: hours, durationMin: 45 });
    expect(slots.map((s) => utcToTashkent(s.starts_at).time)).toEqual([
      '10:00', '10:45', '11:30', '12:15', '13:00', '13:45', '14:30', '15:15', '16:00', '16:45', '17:30', '18:15',
    ]);
  });

  it('marks bookings and breaks as unavailable', () => {
    const slots = generateSlots({
      date: '2026-11-09',
      workingHours: hours,
      durationMin: 45,
      timeOff: [{ starts_at: tashkentToUtc('2026-11-09', '13:00'), ends_at: tashkentToUtc('2026-11-09', '13:45') }],
      bookings: [{ starts_at: tashkentToUtc('2026-11-09', '10:00'), ends_at: tashkentToUtc('2026-11-09', '10:45') }],
    });
    const free = (t: string) => slots.find((s) => utcToTashkent(s.starts_at).time === t)!.available;
    expect(free('10:00')).toBe(false);
    expect(free('10:45')).toBe(true); // touching edges do not overlap
    expect(free('13:00')).toBe(false);
    expect(free('13:45')).toBe(true);
  });

  it('includes buffer in the blocked range', () => {
    const slots = generateSlots({
      date: '2026-11-09',
      workingHours: hours,
      durationMin: 30,
      bufferMin: 15,
      stepMin: 15,
      bookings: [{ starts_at: tashkentToUtc('2026-11-09', '11:00'), ends_at: tashkentToUtc('2026-11-09', '11:45') }],
    });
    const free = (t: string) => slots.find((s) => utcToTashkent(s.starts_at).time === t)!.available;
    expect(free('10:15')).toBe(true); // 10:15–11:00 incl. buffer
    expect(free('10:30')).toBe(false); // buffer runs into 11:00
  });

  it('hides past slots and returns nothing on days off', () => {
    const now = tashkentToUtc('2026-11-09', '12:00');
    const slots = generateSlots({ date: '2026-11-09', workingHours: hours, durationMin: 45, now });
    expect(slots.filter((s) => s.available).every((s) => s.starts_at >= now)).toBe(true);
    expect(generateSlots({ date: '2026-11-10', workingHours: hours, durationMin: 45 })).toEqual([]);
  });
});

describe('validation', () => {
  it('normalises UZ phones', () => {
    expect(phoneSchema.parse('+998 90 123 45 67')).toBe('+998901234567');
    expect(phoneSchema.safeParse('+7 900 123 45 67').success).toBe(false);
  });

  it('checks cards', () => {
    expect(cardBrand('8600 0000 0000 0007')).toBe('uzcard'); // Luhn-valid test number
    expect(cardBrand('8600 0000 0000 0009')).toBeNull();
  });

  it('formats money', () => {
    expect(formatUzs(50000)).toBe('50 000 soʻm');
    expect(formatUzs(1234567, 'ru')).toBe('1 234 567 сум');
  });
});
