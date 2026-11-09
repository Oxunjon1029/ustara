import { useQuery } from '@tanstack/react-query';
import { isDemo, supabase } from '../../lib/supabase';

export interface Service { id: string; name_uz: string; name_ru: string; duration_min: number; price_uzs: number }
export interface Barber { id: string; full_name: string; rating_avg: number }
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
        .select('id, name_uz, name_ru, duration_min, price_uzs')
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
      const { data: barbers, error } = await supabase.from('barbers').select('id, user_id, rating_avg').eq('is_active', true);
      if (error) throw error;
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', barbers.map((b) => b.user_id));
      const name = new Map(profiles?.map((p) => [p.user_id, p.full_name]));
      return barbers.map((b) => ({ id: b.id, full_name: name.get(b.user_id) ?? '', rating_avg: Number(b.rating_avg) }));
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
