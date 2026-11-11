import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { dateStrip } from '@ustara/shared';
import { Button, Placeholder, Screen } from '../../../src/components';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useBarberDay, useBarberRange, useMyBarberId, type DayEntry } from '../../../src/features/booking/api';
import { DateStrip, Segmented } from '../../../src/features/booking/components';
import { DayList } from '../../../src/features/booking/DayList';
import { currentLocale } from '../../../src/i18n';
import { localDate, longDate, monthYear, todayLocal } from '../../../src/lib/dates';
import { isDemo } from '../../../src/lib/supabase';
import { colors, type } from '../../../src/theme';

const AHEAD = 28; // days shown in the day strip and the upcoming list
const BACK = 30; // days of history in the past list

const shiftDate = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Day view with booking dots on the date strip, or every booking (upcoming / past) grouped by day. */
export default function Calendar() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { state } = useAuth();
  const barberId = useMyBarberId(state.status === 'signedIn' && !isDemo ? state.profile.user_id : '');
  const today = todayLocal();
  const dates = useMemo(() => dateStrip(new Date(), AHEAD), []);
  const [mode, setMode] = useState<'day' | 'all'>('day');
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [date, setDate] = useState(dates[0]);

  const bid = barberId.data ?? null;
  const day = useBarberDay(mode === 'day' ? bid : null, date);
  const ahead = useBarberRange(bid, today, dates[dates.length - 1]);
  const past = useBarberRange(mode === 'all' && when === 'past' ? bid : null, shiftDate(today, -BACK), shiftDate(today, -1));

  // Dates that have at least one booking, for the dots on the strip.
  const busyDays = useMemo(() => new Set((ahead.data ?? []).map((e) => localDate(e.starts_at))), [ahead.data]);

  // Upcoming: from now on, soonest first. Past: most recent day first.
  const groups = useMemo(() => {
    const now = Date.now();
    const list = when === 'upcoming'
      ? (ahead.data ?? []).filter((e) => Date.parse(e.ends_at) > now || localDate(e.starts_at) === today)
      : past.data ?? [];
    const byDay = new Map<string, DayEntry[]>();
    for (const e of list) {
      const d = localDate(e.starts_at);
      byDay.set(d, [...(byDay.get(d) ?? []), e]);
    }
    const days = [...byDay.entries()];
    return when === 'past' ? days.reverse() : days;
  }, [when, ahead.data, past.data, today]);

  if (isDemo) return <Placeholder title={t('tabs.calendar')} />;
  const active = mode === 'day' ? day : when === 'upcoming' ? ahead : past;
  const total = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }}
        refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={() => { active.refetch(); ahead.refetch(); }} />}
      >
        <Text style={type.h1}>{t('tabs.calendar')}</Text>
        <Segmented
          options={[{ value: 'day', label: t('calendar.byDay') }, { value: 'all', label: t('calendar.all') }]}
          value={mode}
          onChange={setMode}
        />

        {mode === 'day' ? (
          <>
            <Text style={[type.label, { fontSize: 15 }]}>{monthYear(date, locale)}</Text>
            <DateStrip dates={dates} value={date} onChange={setDate} locale={locale} marked={(d) => busyDays.has(d)} />
            <Text style={type.h2}>{longDate(date, locale)}</Text>
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
          </>
        ) : (
          <>
            <Segmented
              options={[{ value: 'upcoming', label: t('calendar.upcoming') }, { value: 'past', label: t('calendar.past', { days: BACK }) }]}
              value={when}
              onChange={setWhen}
            />
            {active.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : total === 0 ? (
              <Text style={[type.small, { textAlign: 'center', marginTop: 16 }]}>{t('calendar.none')}</Text>
            ) : (
              <>
                <Text style={type.small}>{t('calendar.count', { count: total })}</Text>
                {groups.map(([d, list]) => (
                  <View key={d} style={{ gap: 8 }}>
                    <Text style={type.h2}>
                      {d === today ? `${t('tabs.today')} · ` : ''}{longDate(d, locale)}
                    </Text>
                    <DayList entries={list} />
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
