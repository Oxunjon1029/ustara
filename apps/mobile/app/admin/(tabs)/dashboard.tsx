import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatUzs } from '@ustara/shared';
import { Card, Placeholder, Screen } from '../../../src/components';
import { useAdminReport } from '../../../src/features/admin/api';
import { BarRow, Kpi } from '../../../src/features/admin/components';
import { useShopDay } from '../../../src/features/booking/api';
import { useBarbers } from '../../../src/features/catalog/queries';
import { currentLocale } from '../../../src/i18n';
import { addDays, localTime, longDate, todayLocal, weekStart } from '../../../src/lib/dates';
import { isDemo } from '../../../src/lib/supabase';
import { colors, fonts, type } from '../../../src/theme';

/** Today at a glance: figures, who is next, each barber's load, and this week so far. */
export default function Dashboard() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const today = todayLocal();
  const day = useAdminReport(today, today);
  const week = useAdminReport(weekStart(today), addDays(weekStart(today), 6));
  const shop = useShopDay(today, !isDemo);
  const barbers = useBarbers();
  if (isDemo) return <Placeholder title={t('tabs.dashboard')} />;

  const d = day.data?.totals;
  const w = week.data?.totals;
  const now = Date.now();
  const bookings = (shop.data ?? []).filter((e) => e.kind === 'booking').map((e) => e.booking!);
  const next = bookings.filter((b) => b.status === 'confirmed' && Date.parse(b.ends_at) > now).slice(0, 5);
  const unmarked = bookings.filter((b) => b.status === 'confirmed' && Date.parse(b.starts_at) <= now).length;
  const barberName = (id: string) => barbers.data?.find((b) => b.id === id)?.full_name ?? '';
  const load = (day.data?.barbers ?? []).filter((b) => b.active);
  const maxLoad = Math.max(1, ...load.map((b) => b.bookings));
  const refresh = () => { day.refetch(); week.refetch(); shop.refetch(); };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }}
        refreshControl={<RefreshControl refreshing={day.isRefetching || shop.isRefetching} onRefresh={refresh} />}
      >
        <View>
          <Text style={type.small}>{longDate(today, locale)}</Text>
          <Text style={type.h1}>{t('tabs.dashboard')}</Text>
        </View>

        {!d ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Kpi tone="primary" label={t('admin.revenueToday')} value={formatUzs(d.revenue, locale, false)} />
            <Kpi label={t('admin.feesToday')} value={formatUzs(d.fees, locale, false)} />
            <Kpi label={t('barber.bookings')} value={String(d.bookings)} />
            <Kpi label={t('barber.completed')} value={`${d.completed} / ${d.bookings}`} />
          </View>
        )}

        {unmarked > 0 && (
          <Pressable accessibilityRole="button" onPress={() => router.push('/admin/schedule')} style={{ backgroundColor: colors.warnSoft, borderRadius: 14, padding: 14 }}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.warnInk }}>{t('admin.unmarked', { count: unmarked })}</Text>
          </Pressable>
        )}

        <View style={{ gap: 10 }}>
          <Text style={type.h2}>{t('admin.next')}</Text>
          {shop.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : next.length === 0 ? (
            <Text style={type.small}>{t('admin.noNext')}</Text>
          ) : (
            <Card style={{ gap: 12 }}>
              {next.map((b) => (
                <View key={b.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Text style={{ width: 48, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{localTime(b.starts_at)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.ink }} numberOfLines={1}>{b.client_name ?? t('barber.walkin')}</Text>
                    <Text style={type.small} numberOfLines={1}>
                      {locale === 'ru' ? b.service.name_ru : b.service.name_uz} · {barberName(b.barber_id)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>

        {load.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={type.h2}>{t('admin.loadToday')}</Text>
            <Card style={{ gap: 12 }}>
              {load.map((b) => (
                <BarRow key={b.barber_id} label={b.name} value={t('admin.doneOf', { done: b.completed, count: b.bookings })} share={b.bookings / maxLoad} />
              ))}
            </Card>
          </View>
        )}

        {w && (
          <View style={{ gap: 10 }}>
            <Text style={type.h2}>{t('admin.thisWeek')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Kpi label={t('earnings.gross')} value={formatUzs(w.revenue, locale, false)} />
              <Kpi label={t('earnings.fee')} value={formatUzs(w.fees, locale, false)} />
              <Kpi label={t('barber.bookings')} value={String(w.bookings)} />
              <Kpi label={t('admin.newClients')} value={String(w.new_clients)} />
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
