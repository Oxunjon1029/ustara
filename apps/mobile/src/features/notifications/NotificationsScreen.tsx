import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Button, Icon, Screen } from '../../components';
import { BottomSheet } from '../../components/BottomSheet';
import { formatUzs } from '@ustara/shared';
import { currentLocale } from '../../i18n';
import { StatusPill, statusTone } from '../booking/components';
import { localDate, localTime, longDate, todayLocal } from '../../lib/dates';
import { isDemo, supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { colors, fonts, radius, type } from '../../theme';

export interface AppNotification {
  id: string; title: string; body: string; url: string | null; booking_id: string | null; read_at: string | null; created_at: string;
}

interface BookingDetail {
  starts_at: string; ends_at: string; status: string; price_uzs: number;
  service: { name_uz: string; name_ru: string } | null;
  barber_name: string; client_name: string;
}

/** The booking a notification is about, as it is now (it may have changed since). */
const useBookingDetail = (id: string | null) =>
  useQuery({
    queryKey: ['bookingDetail', id],
    enabled: !!id,
    queryFn: async (): Promise<BookingDetail | null> => {
      const { data: b } = await supabase
        .from('bookings')
        .select('starts_at, ends_at, status, price_uzs, client_id, walkin_name, barber_id, service:services(name_uz, name_ru)')
        .eq('id', id!)
        .maybeSingle();
      if (!b) return null;
      const { data: br } = await supabase.from('barbers').select('user_id').eq('id', b.barber_id).maybeSingle();
      const ids = [br?.user_id, b.client_id].filter(Boolean) as string[];
      const { data: people } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
      const name = (uid?: string | null) => people?.find((p) => p.user_id === uid)?.full_name ?? '';
      return {
        starts_at: b.starts_at, ends_at: b.ends_at, status: b.status, price_uzs: b.price_uzs,
        service: b.service as unknown as BookingDetail['service'],
        barber_name: name(br?.user_id), client_name: b.client_id ? name(b.client_id) : b.walkin_name ?? '',
      };
    },
  });

/** Bottom sheet with the whole notification and the booking it refers to. */
function NotificationSheet({ n, onDismiss }: { n: AppNotification; onDismiss: () => void }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { state } = useAuth();
  const isBarber = state.status === 'signedIn' && state.profile.role === 'barber';
  const b = useBookingDetail(n.booking_id);
  const d = b.data;
  return (
    <BottomSheet onDismiss={onDismiss}>
      {(close) => (
        <View style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <Text style={type.h2}>{n.title}</Text>
            <Text style={type.small}>{longDate(localDate(n.created_at), locale)} · {localTime(n.created_at)}</Text>
          </View>
          <Text style={[type.body, { color: colors.inkMuted }]}>{n.body}</Text>

          {n.booking_id && (
            <View style={s.detail}>
              {b.isLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : !d ? (
                <Text style={type.small}>{t('notifications.bookingGone')}</Text>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>
                      {d.service ? (locale === 'ru' ? d.service.name_ru : d.service.name_uz) : ''}
                    </Text>
                    <StatusPill label={t(`booking.status.${d.status}`)} tone={statusTone(d.status)} />
                  </View>
                  <Row label={t('booking.date')} value={longDate(localDate(d.starts_at), locale)} />
                  <Row label={t('booking.time')} value={`${localTime(d.starts_at)} – ${localTime(d.ends_at)}`} />
                  <Row label={isBarber ? t('notifications.client') : t('booking.barber')} value={isBarber ? d.client_name : d.barber_name} />
                  <Row label={t('booking.price')} value={formatUzs(d.price_uzs, locale)} />
                </>
              )}
            </View>
          )}

          {n.url && (
            <Button
              label={isBarber ? t('notifications.openCalendar') : t('notifications.openBookings')}
              onPress={() => close(() => { onDismiss(); router.push(n.url as Href); })}
            />
          )}
        </View>
      )}
    </BottomSheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted }}>{label}</Text>
      <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.ink, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

export const useNotifications = (userId: string) =>
  useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId && !isDemo,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, body, url, booking_id, read_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

export const useUnreadCount = (userId: string) => {
  const q = useNotifications(userId);
  return q.data?.filter((n) => !n.read_at).length ?? 0;
};

/** Bell button with an unread badge; opens the notifications list of the current role. */
export function BellButton({ href }: { href: Href }) {
  const { t } = useTranslation();
  const { state } = useAuth();
  const unread = useUnreadCount(state.status === 'signedIn' ? state.profile.user_id : '');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `${t('client.notifications')}: ${unread}` : t('client.notifications')}
      onPress={() => router.push(href)}
      style={s.bell}
    >
      <Icon name="bell" size={20} />
      {unread > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Notifications list (shared by client and barber). Opening it marks everything read. */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const userId = state.status === 'signedIn' ? state.profile.user_id : '';
  const q = useNotifications(userId);
  const queryClient = useQueryClient();
  const hasUnread = q.data?.some((n) => !n.read_at) ?? false;
  const [open, setOpen] = useState<AppNotification | null>(null);

  useEffect(() => {
    if (!hasUnread) return;
    const timer = setTimeout(async () => {
      await supabase.rpc('mark_notifications_read', {});
      if (Platform.OS !== 'web') Notifications.setBadgeCountAsync(0).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }, 1200); // let the unread dots be seen first
    return () => clearTimeout(timer);
  }, [hasUnread, queryClient]);

  const today = todayLocal();
  const when = (iso: string) => (localDate(iso) === today ? localTime(iso) : `${localDate(iso).slice(8)}.${localDate(iso).slice(5, 7)} ${localTime(iso)}`);

  return (
    <Screen fullScreen>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('telegram.cancel')} onPress={() => router.back()} style={s.iconBtn}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={[type.h1, { fontSize: 22 }]}>{t('client.notifications')}</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 10 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} />}
      >
        {q.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : !q.data?.length ? (
          <View style={{ alignItems: 'center', gap: 10, marginTop: 48 }}>
            <Icon name="bell" size={32} color={colors.inkMuted} />
            <Text style={[type.small, { textAlign: 'center' }]}>{t('notifications.empty')}</Text>
          </View>
        ) : (
          q.data.map((n) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              onPress={() => setOpen(n)}
              style={({ pressed }) => [s.item, pressed && { opacity: 0.85 }]}
            >
              <View style={[s.dot, { backgroundColor: n.read_at ? 'transparent' : colors.primary }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{n.title}</Text>
                  <Text style={type.small}>{when(n.created_at)}</Text>
                </View>
                <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkMuted }}>{n.body}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
      {open && <NotificationSheet n={open} onDismiss={() => setOpen(null)} />}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  bell: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontFamily: fonts.semibold, fontSize: 11 },
  item: { flexDirection: 'row', gap: 10, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  detail: { backgroundColor: colors.ground, borderRadius: radius.lg, padding: 14, gap: 8 },
});
