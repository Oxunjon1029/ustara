import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Placeholder, Screen } from '../../../src/components';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useBarberDay, useMyBarberId } from '../../../src/features/booking/api';
import { DayList } from '../../../src/features/booking/DayList';
import { currentLocale } from '../../../src/i18n';
import { longDate, todayLocal } from '../../../src/lib/dates';
import { isDemo } from '../../../src/lib/supabase';
import { colors, fonts, radius, type } from '../../../src/theme';

export default function Today() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { state } = useAuth();
  const barberId = useMyBarberId(state.status === 'signedIn' && !isDemo ? state.profile.user_id : '');
  const date = todayLocal();
  const day = useBarberDay(barberId.data ?? null, date);
  if (isDemo) return <Placeholder title={t('tabs.today')} />;

  const bookings = (day.data ?? []).filter((e) => e.kind === 'booking').map((e) => e.booking!);
  const stats = [
    { label: t('barber.bookings'), value: bookings.length },
    { label: t('barber.completed'), value: bookings.filter((b) => b.status === 'completed').length },
    { label: t('barber.noShow'), value: bookings.filter((b) => b.status === 'no_show').length },
  ];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 24, gap: 18 }}
        refreshControl={<RefreshControl refreshing={day.isRefetching} onRefresh={() => { day.refetch(); }} />}
      >
        <View>
          <Text style={type.small}>{longDate(date, locale)}</Text>
          <Text style={type.h1}>{t('tabs.today')}</Text>
        </View>
        <Button variant="dark" label={t('barber.walkin')} onPress={() => router.push('/barber/walkin')} style={{ height: 52 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {stats.map((s) => (
            <View key={s.label} style={st.stat}>
              <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.ink }}>{s.value}</Text>
              <Text style={type.small}>{s.label}</Text>
            </View>
          ))}
        </View>
        {day.isLoading || barberId.isLoading ? <ActivityIndicator color={colors.primary} /> : <DayList entries={day.data ?? []} />}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, gap: 2 },
});
