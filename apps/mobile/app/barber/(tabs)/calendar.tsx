import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { dateStrip } from '@ustara/shared';
import { Button, Placeholder, Screen } from '../../../src/components';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useBarberDay, useMyBarberId } from '../../../src/features/booking/api';
import { DateStrip } from '../../../src/features/booking/components';
import { DayList } from '../../../src/features/booking/DayList';
import { currentLocale } from '../../../src/i18n';
import { longDate, monthYear } from '../../../src/lib/dates';
import { isDemo } from '../../../src/lib/supabase';
import { colors, type } from '../../../src/theme';

/** Day view across the next weeks, with time off. */
export default function Calendar() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { state } = useAuth();
  const barberId = useMyBarberId(state.status === 'signedIn' && !isDemo ? state.profile.user_id : '');
  const dates = useMemo(() => dateStrip(new Date(), 28), []);
  const [date, setDate] = useState(dates[0]);
  const day = useBarberDay(barberId.data ?? null, date);
  if (isDemo) return <Placeholder title={t('tabs.calendar')} />;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 24, gap: 16 }}
        refreshControl={<RefreshControl refreshing={day.isRefetching} onRefresh={() => { day.refetch(); }} />}
      >
        <Text style={type.h1}>{t('tabs.calendar')}</Text>
        <Text style={[type.label, { fontSize: 15 }]}>{monthYear(date, locale)}</Text>
        <DateStrip dates={dates} value={date} onChange={setDate} locale={locale} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={type.h2}>{longDate(date, locale)}</Text>
        </View>
        {day.isLoading ? <ActivityIndicator color={colors.primary} /> : <DayList entries={day.data ?? []} />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            variant="outline"
            label={t('barber.addTimeOff')}
            onPress={() => router.push({ pathname: '/barber/timeoff', params: { date } })}
            style={{ flex: 1, height: 48, paddingHorizontal: 8 }}
          />
          <Button variant="outline" label={t('barber.hours')} onPress={() => router.push('/barber/hours')} style={{ flex: 1, height: 48, paddingHorizontal: 8 }} />
        </View>
      </ScrollView>
    </Screen>
  );
}
