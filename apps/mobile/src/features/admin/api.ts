import type { TFunction } from 'i18next';
import { useQuery } from '@tanstack/react-query';
import { isDemo, photoUrl, supabase } from '../../lib/supabase';
import { dayBounds } from '../booking/api';

export interface Settings { no_show_limit: number; reschedule_window_minutes: number }

/** Shop-wide rules (readable by everyone, editable by admin). */
export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    enabled: !isDemo,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase.from('settings').select('no_show_limit, reschedule_window_minutes').single();
      if (error) throw error;
      return data;
    },
  });

export interface ReportTotals {
  bookings: number; completed: number; no_show: number; cancelled: number; upcoming: number; walkins: number;
  revenue: number; fees: number; net: number; expected: number; new_clients: number; reviews: number; rating: number | null;
}
export interface Report {
  totals: ReportTotals;
  barbers: { barber_id: string; name: string; active: boolean; rating: number; bookings: number; completed: number; no_show: number; revenue: number; fees: number }[];
  services: { service_id: string; name_uz: string; name_ru: string; completed: number; revenue: number }[];
  days: { date: string; bookings: number; revenue: number }[];
}

/** Shop figures for local dates [fromDate, toDate] inclusive. */
export const useAdminReport = (fromDate: string, toDate: string) =>
  useQuery({
    queryKey: ['adminReport', fromDate, toDate],
    enabled: !isDemo,
    queryFn: async (): Promise<Report> => {
      const { data, error } = await supabase.rpc('admin_report', {
        p_from: dayBounds(fromDate).from.toISOString(),
        p_to: dayBounds(toDate).to.toISOString(),
      });
      if (error) throw error;
      return data as Report;
    },
  });

export interface AdminBarber {
  id: string; user_id: string; is_active: boolean; rating_avg: number; rating_count: number;
  photo_path: string | null; photo_url: string | null; bio_uz: string | null; bio_ru: string | null;
  full_name: string; phone: string | null; username: string | null;
}

/** Every barber, active or not, with contact details. */
export const useAdminBarbers = () =>
  useQuery({
    queryKey: ['adminBarbers'],
    enabled: !isDemo,
    queryFn: async (): Promise<AdminBarber[]> => {
      const { data: bs, error } = await supabase.from('barbers').select('id, user_id, is_active, rating_avg, rating_count, photo_path, bio_uz, bio_ru');
      if (error) throw error;
      const { data: ps } = await supabase.from('profiles').select('user_id, full_name, phone, username').in('user_id', bs.map((b) => b.user_id));
      const byId = new Map((ps ?? []).map((p) => [p.user_id, p]));
      return bs
        .map((b) => {
          const p = byId.get(b.user_id);
          return { ...b, rating_avg: Number(b.rating_avg), photo_url: photoUrl(b.photo_path), full_name: p?.full_name ?? '', phone: p?.phone ?? null, username: p?.username ?? null };
        })
        .sort((a, c) => Number(c.is_active) - Number(a.is_active) || a.full_name.localeCompare(c.full_name));
    },
  });

export interface UserRow {
  user_id: string; full_name: string; phone: string | null; username: string | null; role: 'client' | 'barber' | 'admin';
  no_show_count: number; booking_blocked: boolean; phone_verified: boolean; created_at: string;
}

/** Accounts matching a name / phone / username search (newest first). */
export const useUsers = (search: string) =>
  useQuery({
    queryKey: ['adminUsers', search],
    enabled: !isDemo,
    queryFn: async (): Promise<UserRow[]> => {
      let q = supabase
        .from('profiles')
        .select('user_id, full_name, phone, username, role, no_show_count, booking_blocked, phone_verified, created_at')
        .order('created_at', { ascending: false })
        .limit(60);
      const term = search.trim().replace(/[%,()]/g, '');
      if (term) {
        const digits = term.replace(/\D/g, '');
        const ors = [`full_name.ilike.%${term}%`, `username.ilike.%${term}%`];
        if (digits.length >= 3) ors.push(`phone.like.%${digits}%`);
        q = q.or(ors.join(','));
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as UserRow[];
    },
  });

export interface FeeTierRow { id: string; min_price_uzs: number; max_price_uzs: number | null; fee_uzs: number }

/** Fee tiers in force now, cheapest first. */
export const useFeeTiers = () =>
  useQuery({
    queryKey: ['feeTiers'],
    enabled: !isDemo,
    queryFn: async (): Promise<FeeTierRow[]> => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('fee_tiers')
        .select('id, min_price_uzs, max_price_uzs, fee_uzs')
        .lte('active_from', now)
        .or(`active_to.is.null,active_to.gt.${now}`)
        .order('min_price_uzs');
      if (error) throw error;
      return data;
    },
  });

export interface AdminService {
  id: string; name_uz: string; name_ru: string; duration_min: number; price_uzs: number; buffer_min: number; is_active: boolean; sort: number;
}

/** All services including hidden ones (admin RLS). */
export const useAdminServices = () =>
  useQuery({
    queryKey: ['adminServices'],
    enabled: !isDemo,
    queryFn: async (): Promise<AdminService[]> => {
      const { data, error } = await supabase.from('services').select('id, name_uz, name_ru, duration_min, price_uzs, buffer_min, is_active, sort').order('sort');
      if (error) throw error;
      return data;
    },
  });

/** Easy-to-dictate password: no look-alike characters (0/O, 1/l/I). */
export function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** The login text an admin sends to a barber. */
export const credentialsText = (t: TFunction, username: string, password: string) =>
  t('admin.credentialsText', { username, password });
