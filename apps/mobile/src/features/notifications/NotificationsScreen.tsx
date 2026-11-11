import { useEffect } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Icon, Screen } from '../../components';
import { localDate, localTime, todayLocal } from '../../lib/dates';
import { isDemo, supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { colors, fonts, radius, type } from '../../theme';

export interface AppNotification { id: string; title: string; body: string; url: string | null; read_at: string | null; created_at: string }

export const useNotifications = (userId: string) =>
  useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId && !isDemo,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, body, url, read_at, created_at')
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

  useEffect(() => {
    if (!hasUnread) return;
    const timer = setTimeout(async () => {
      await supabase.rpc('mark_notifications_read', {});
      Notifications.setBadgeCountAsync(0).catch(() => {});
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
              accessibilityRole={n.url ? 'button' : undefined}
              onPress={() => n.url && router.push(n.url as Href)}
              style={({ pressed }) => [s.item, pressed && n.url ? { opacity: 0.85 } : null]}
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
});
