import { useQuery } from '@tanstack/react-query';
import { isDemo, photoUrl, supabase } from '../../lib/supabase';

export interface Service { id: string; name_uz: string; name_ru: string; duration_min: number; price_uzs: number; buffer_min?: number }
export interface Barber { id: string; full_name: string; rating_avg: number; photo_url?: string | null }
export interface NextBooking { id: string; starts_at: string; status: string; price_uzs: number; barber_name: string; service: Service }

const DEMO_SERVICES: Service[] = [
  { id: 's1', name_uz: 'Soch olish', name_ru: 'Стрижка', duration_min: 45, price_uzs: 50000 },
  { id: 's2', name_uz: 'Soqol olish', name_ru: 'Стрижка бороды', duration_min: 30, price_uzs: 30000 },
  { id: 's3', name_uz: 'Soch + soqol', name_ru: 'Стрижка + борода', duration_min: 75, price_uzs: 75000 },
];
const DEMO_BARBERS: Barber[] = [
  { id: 'b1', full_name: 'Jasur', rating_avg: 4.9 },
  { id: 'b2', full_name: 'Bekzod', rating_avg: 4.8 },
  { id: 'b3', full_name: 'Sardor', rating_avg: 4.7 },
];

export const useServices = () =>
  useQuery({
    queryKey: ['services'],
    queryFn: async (): Promise<Service[]> => {
      if (isDemo) return DEMO_SERVICES;
      const { data, error } = await supabase
        .from('services')
        .select('id, name_uz, name_ru, duration_min, price_uzs, buffer_min')
        .eq('is_active', true)
        .order('sort');
      if (error) throw error;
      return data;
    },
  });

export const useBarbers = () =>
  useQuery({
    queryKey: ['barbers'],
    queryFn: async (): Promise<Barber[]> => {
      if (isDemo) return DEMO_BARBERS;
      const { data: barbers, error } = await supabase.from('barbers').select('id, user_id, rating_avg, photo_path').eq('is_active', true);
      if (error) throw error;
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', barbers.map((b) => b.user_id));
      const name = new Map(profiles?.map((p) => [p.user_id, p.full_name]));
      return barbers.map((b) => ({ id: b.id, full_name: name.get(b.user_id) ?? '', rating_avg: Number(b.rating_avg), photo_url: photoUrl(b.photo_path) }));
    },
  });

export const useNextBooking = (userId: string) =>
  useQuery({
    queryKey: ['nextBooking', userId],
    queryFn: async (): Promise<NextBooking | null> => {
      if (isDemo) {
        const starts = new Date(Date.now() + 24 * 3600_000);
        starts.setUTCHours(9, 30, 0, 0); // 14:30 Tashkent
        return { id: 'demo', starts_at: starts.toISOString(), status: 'confirmed', price_uzs: 50000, barber_name: 'Jasur', service: DEMO_SERVICES[0] };
      }
      const { data, error } = await supabase
        .from('bookings')
        .select('id, starts_at, status, price_uzs, barber_id, services(id, name_uz, name_ru, duration_min, price_uzs)')
        .eq('client_id', userId)
        .in('status', ['held', 'confirmed'])
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: b } = await supabase.from('barbers').select('user_id').eq('id', data.barber_id).single();
      const { data: p } = b ? await supabase.from('profiles').select('full_name').eq('user_id', b.user_id).single() : { data: null };
      return {
        id: data.id,
        starts_at: data.starts_at,
        status: data.status,
        price_uzs: data.price_uzs,
        barber_name: p?.full_name ?? '',
        service: data.services as unknown as Service,
      };
    },
  });

export interface BarberProfile {
  id: string;
  full_name: string;
  bio: { uz: string | null; ru: string | null };
  rating_avg: number;
  rating_count: number;
  photo_url?: string | null;
  services: (Service & { price: number })[];
  /** weekday (0 = Sunday) → 'HH:MM–HH:MM'; missing = day off */
  hours: Record<number, string>;
}

/** Everything a client sees on a barber's profile page. */
export const useBarberProfile = (id: string) =>
  useQuery({
    queryKey: ['barberProfile', id],
    enabled: !!id,
    queryFn: async (): Promise<BarberProfile> => {
      if (isDemo) {
        const b = DEMO_BARBERS.find((x) => x.id === id) ?? DEMO_BARBERS[0];
        return {
          ...b, bio: { uz: 'Klassik va zamonaviy soch turmagi.', ru: 'Классические и современные стрижки.' }, rating_count: 120,
          services: DEMO_SERVICES.map((s) => ({ ...s, price: s.price_uzs })),
          hours: Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [d, '10:00–19:00'])),
        };
      }
      const { data: b, error } = await supabase.from('barbers').select('id, user_id, bio_uz, bio_ru, rating_avg, rating_count, photo_path').eq('id', id).single();
      if (error) throw error;
      const [p, bs, wh] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('user_id', b.user_id).single(),
        supabase.from('barber_services').select('price_override_uzs, duration_override_min, services(id, name_uz, name_ru, duration_min, price_uzs, is_active, sort)').eq('barber_id', id),
        supabase.from('working_hours').select('weekday, start_local, end_local').eq('barber_id', id),
      ]);
      type Row = { price_override_uzs: number | null; duration_override_min: number | null; services: Service & { is_active: boolean; sort: number } };
      const services = ((bs.data ?? []) as unknown as Row[])
        .filter((r) => r.services?.is_active)
        .sort((a, c) => a.services.sort - c.services.sort)
        .map((r) => ({ ...r.services, duration_min: r.duration_override_min ?? r.services.duration_min, price: r.price_override_uzs ?? r.services.price_uzs }));
      const hours: Record<number, string> = {};
      for (const h of wh.data ?? []) hours[h.weekday] = `${h.start_local.slice(0, 5)}–${h.end_local.slice(0, 5)}`;
      return {
        id: b.id, full_name: p.data?.full_name ?? '', bio: { uz: b.bio_uz, ru: b.bio_ru },
        rating_avg: Number(b.rating_avg), rating_count: b.rating_count, photo_url: photoUrl(b.photo_path), services, hours,
      };
    },
  });
