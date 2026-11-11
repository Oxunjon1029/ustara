import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Avatar, Placeholder, Screen } from '../../../src/components';
import { useAdminBarbers } from '../../../src/features/admin/api';
import { useShopDay } from '../../../src/features/booking/api';
import { DateStrip } from '../../../src/features/booking/components';
import { DayList } from '../../../src/features/booking/DayList';
import { currentLocale } from '../../../src/i18n';
import { addDays, longDate, todayLocal } from '../../../src/lib/dates';
import { isDemo } from '../../../src/lib/supabase';
import { colors, fonts, radius, type } from '../../../src/theme';

const ALL = 'all';

/** Every barber's day; filter to one barber. Admin can mark visits and cancel like the barber. */
export default function Schedule() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const today = todayLocal();
  const dates = Array.from({ length: 21 }, (_, i) => addDays(today, i - 7));
  const [date, setDate] = useState(today);
  const [who, setWho] = useState<string>(ALL);
  const day = useShopDay(date, !isDemo);
  const barbers = useAdminBarbers();
  if (isDemo) return <Placeholder title={t('tabs.schedule')} />;

  const entries = day.data ?? [];
  const barberOf = (e: (typeof entries)[number]) => e.booking?.barber_id ?? e.barber_id;
  const shown = (barbers.data ?? []).filter((b) => (who === ALL ? b.is_active || entries.some((e) => barberOf(e) === b.id) : b.id === who));

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }}
        refreshControl={<RefreshControl refreshing={day.isRefetching} onRefresh={() => { day.refetch(); }} />}
      >
        <View>
          <Text style={type.small}>{longDate(date, locale)}</Text>
          <Text style={type.h1}>{t('tabs.schedule')}</Text>
        </View>
        <DateStrip dates={dates} value={date} onChange={setDate} locale={locale} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[{ id: ALL, full_name: t('client.all') }, ...(barbers.data ?? []).filter((b) => b.is_active)].map((b) => {
            const on = who === b.id;
            return (
              <Pressable key={b.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setWho(b.id)}
                style={[s.chip, on && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: on ? colors.inkOnDark : colors.ink }}>{b.full_name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {day.isLoading || barbers.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          shown.map((b) => {
            const mine = entries.filter((e) => barberOf(e) === b.id);
            const count = mine.filter((e) => e.kind === 'booking').length;
            return (
              <View key={b.id} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar name={b.full_name} uri={b.photo_url} size={32} />
                  <Text style={[type.h2, { flex: 1 }]}>{b.full_name}</Text>
                  <Text style={type.small}>{t('calendar.count', { count })}</Text>
                </View>
                <DayList entries={mine} />
              </View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  chip: { height: 38, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
});
