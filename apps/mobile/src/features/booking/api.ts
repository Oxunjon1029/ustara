import { useQuery } from '@tanstack/react-query';
import { generateSlots, tashkentToUtc, type Slot, type WorkingHours } from '@ustara/shared';
import { supabase } from '../../lib/supabase';
import { useServices, type Service } from '../catalog/queries';

export interface BookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: 'held' | 'confirmed' | 'completed' | 'no_show' | 'cancelled' | 'expired';
  source: 'app' | 'walkin';
  price_uzs: number;
  reschedule_count: number;
  barber_id: string;
  service_id: string;
  client_id: string | null;
  walkin_name: string | null;
  walkin_phone: string | null;
  paid_method: 'cash' | 'card' | null;
  service: Service;
}

const BOOKING_COLS =
  'id, starts_at, ends_at, status, source, price_uzs, reschedule_count, barber_id, service_id, client_id, walkin_name, walkin_phone, paid_method, service:services(id, name_uz, name_ru, duration_min, price_uzs)';

/** Map a Postgres function error (raised as e.g. 'slot_taken') to an i18n code. */
function rpcError(error: { message?: string } | null): string | null {
  if (!error) return null;
  const m = error.message ?? '';
  return /^[a-z_]+$/.test(m) ? m : 'server_error';
}

export async function rpc(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase.rpc(fn, args);
  return rpcError(error);
}

export const bookingActions = {
  create: (barber: string, service: string, startsAt: Date) =>
    rpc('create_booking', { p_barber: barber, p_service: service, p_starts_at: startsAt.toISOString() }),
  cancel: (id: string) => rpc('cancel_booking', { p_booking: id }),
  reschedule: (id: string, startsAt: Date) => rpc('reschedule_booking', { p_booking: id, p_starts_at: startsAt.toISOString() }),
  outcome: (id: string, status: 'completed' | 'no_show') => rpc('set_booking_outcome', { p_booking: id, p_status: status }),
  walkin: (service: string, startsAt: Date, name: string, phone: string | null, paid: 'cash' | 'card') =>
    rpc('add_walkin', { p_service: service, p_starts_at: startsAt.toISOString(), p_name: name, p_phone: phone, p_paid_method: paid }),
};

/** UTC bounds of a local Tashkent day. */
export function dayBounds(date: string) {
  const from = tashkentToUtc(date, '00:00');
  return { from, to: new Date(from.getTime() + 24 * 3600_000) };
}

export interface BarberSlots {
  barberId: string;
  slots: Slot[];
}

/** Slot grid for one or more barbers on a local date, using the shared slot generator. */
export async function fetchAvailability(opts: {
  barberIds: string[];
  service: Service & { buffer_min?: number };
  date: string;
  ignoreBookingId?: string;
  /** per-barber duration when it differs from the service default */
  durations?: Record<string, number>;
}): Promise<BarberSlots[]> {
  const { from, to } = dayBounds(opts.date);
  const [hours, timeOff] = await Promise.all([
    supabase.from('working_hours').select('barber_id, weekday, start_local, end_local').in('barber_id', opts.barberIds),
    supabase.from('time_off').select('barber_id, starts_at, ends_at').in('barber_id', opts.barberIds)
      .lt('starts_at', to.toISOString()).gt('ends_at', from.toISOString()),
  ]);
  const busy = await Promise.all(
    opts.barberIds.map((id) => supabase.rpc('busy_intervals', { p_barber: id, p_from: from.toISOString(), p_to: to.toISOString() })),
  );
  // The booking being rescheduled must not block its own new time.
  let own: { starts_at: string } | null = null;
  if (opts.ignoreBookingId) {
    const { data } = await supabase.from('bookings').select('starts_at').eq('id', opts.ignoreBookingId).single();
    own = data;
  }

  return opts.barberIds.map((barberId, i) => ({
    barberId,
    slots: generateSlots({
      date: opts.date,
      workingHours: (hours.data ?? [])
        .filter((h) => h.barber_id === barberId)
        .map((h): WorkingHours => ({ weekday: h.weekday, start_local: h.start_local.slice(0, 5), end_local: h.end_local.slice(0, 5) })),
      timeOff: (timeOff.data ?? []).filter((t) => t.barber_id === barberId),
      bookings: (busy[i].data ?? []).filter((b: { starts_at: string }) => !own || Date.parse(b.starts_at) !== Date.parse(own.starts_at)),
      durationMin: opts.durations?.[barberId] ?? opts.service.duration_min,
      bufferMin: opts.service.buffer_min ?? 0,
      now: new Date(),
      leadMin: 5,
    }),
  }));
}

export const useMyBookings = (userId: string) =>
  useQuery({
    queryKey: ['myBookings', userId],
    enabled: !!userId,
    queryFn: async (): Promise<BookingRow[]> => {
      const { data, error } = await supabase.from('bookings').select(BOOKING_COLS).eq('client_id', userId).order('starts_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as unknown as BookingRow[];
    },
  });

export interface DayEntry {
  kind: 'booking' | 'off';
  starts_at: string;
  ends_at: string;
  booking?: BookingRow & { client_name: string | null; client_phone: string | null };
  off?: { id: string; kind: 'break' | 'day_off' | 'vacation'; note: string | null };
}

/** A barber's bookings and time off for one local day, merged and sorted. */
/** A barber's bookings (and optionally time off) between two instants, with client names, sorted by time. */
async function fetchBarberEntries(barberId: string, from: Date, to: Date, withOff: boolean): Promise<DayEntry[]> {
      const [bk, off] = await Promise.all([
        supabase.from('bookings').select(BOOKING_COLS).eq('barber_id', barberId)
          .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString())
          .not('status', 'in', '(cancelled,expired)').order('starts_at').limit(500),
        withOff
          ? supabase.from('time_off').select('id, kind, note, starts_at, ends_at').eq('barber_id', barberId)
              .lt('starts_at', to.toISOString()).gt('ends_at', from.toISOString())
          : Promise.resolve({ data: [] as { id: string; kind: 'break' | 'day_off' | 'vacation'; note: string | null; starts_at: string; ends_at: string }[] }),
      ]);
      if (bk.error) throw bk.error;
      const rows = bk.data as unknown as BookingRow[];
      const clientIds = [...new Set(rows.map((r) => r.client_id).filter(Boolean))] as string[];
      const { data: people } = clientIds.length
        ? await supabase.from('profiles').select('user_id, full_name, phone').in('user_id', clientIds)
        : { data: [] as { user_id: string; full_name: string; phone: string | null }[] };
      const who = new Map((people ?? []).map((p) => [p.user_id, p]));

      const entries: DayEntry[] = [
        ...rows.map((r) => ({
          kind: 'booking' as const,
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          booking: {
            ...r,
            client_name: r.client_id ? who.get(r.client_id)?.full_name ?? null : r.walkin_name,
            client_phone: r.client_id ? who.get(r.client_id)?.phone ?? null : r.walkin_phone,
          },
        })),
        ...(off.data ?? []).map((o) => ({ kind: 'off' as const, starts_at: o.starts_at, ends_at: o.ends_at, off: o })),
      ];
      return entries.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export const useBarberDay = (barberId: string | null, date: string) =>
  useQuery({
    queryKey: ['barberDay', barberId, date],
    enabled: !!barberId,
    queryFn: () => {
      const { from, to } = dayBounds(date);
      return fetchBarberEntries(barberId!, from, to, true);
    },
  });

/** Bookings over a range of local dates (inclusive). Shares the 'barberDay' key prefix so actions refresh it too. */
export const useBarberRange = (barberId: string | null, fromDate: string, toDate: string) =>
  useQuery({
    queryKey: ['barberDay', 'range', barberId, fromDate, toDate],
    enabled: !!barberId,
    queryFn: () => fetchBarberEntries(barberId!, dayBounds(fromDate).from, dayBounds(toDate).to, false),
  });

export const useMyBarberId = (userId: string) =>
  useQuery({
    queryKey: ['myBarberId', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('barbers').select('id').eq('user_id', userId).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });

/** Which services each barber offers. */
export interface Offer { barber_id: string; service_id: string; price_override_uzs: number | null; duration_override_min: number | null }

export const useBarberServices = () =>
  useQuery({
    queryKey: ['barberServices'],
    queryFn: async () => {
      const { data, error } = await supabase.from('barber_services').select('barber_id, service_id, price_override_uzs, duration_override_min');
      if (error) throw error;
      return data as Offer[];
    },
  });

/** What a service costs and how long it takes with a given barber (their own terms, else the shop default). */
export function termsFor(offers: Offer[] | undefined, barberId: string | null | undefined, service: Service) {
  const o = barberId ? offers?.find((x) => x.barber_id === barberId && x.service_id === service.id) : undefined;
  return { price: o?.price_override_uzs ?? service.price_uzs, duration: o?.duration_override_min ?? service.duration_min };
}

/** The signed-in barber's services with their own duration and price applied. */
export function useMyServiceTerms(userId: string) {
  const barberId = useMyBarberId(userId);
  const services = useServices();
  const offers = useBarberServices();
  const list = services.data?.map((sv) => ({ ...sv, ...termsFor(offers.data, barberId.data, sv) }));
  return { barberId: barberId.data ?? null, services: list, isLoading: services.isLoading || offers.isLoading, refetch: offers.refetch };
}
