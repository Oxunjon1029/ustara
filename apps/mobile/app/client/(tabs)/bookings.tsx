import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { showDialog } from '../../../src/components/Dialog';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { formatUzs } from '@ustara/shared';
import { Button, Card, Screen } from '../../../src/components';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { bookingActions, useMyBookings, type BookingRow } from '../../../src/features/booking/api';
import { bookingErrorText, Segmented, StatusPill, statusTone } from '../../../src/features/booking/components';
import { useBarbers } from '../../../src/features/catalog/queries';
import { currentLocale } from '../../../src/i18n';
import { localTime, whenLabel } from '../../../src/lib/dates';
import { isDemo } from '../../../src/lib/supabase';
import { colors, fonts, type } from '../../../src/theme';

const RESCHEDULE_WINDOW_MS = 2 * 3600_000; // settings.reschedule_window_minutes default

export default function Bookings() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { state } = useAuth();
  const userId = state.status === 'signedIn' && !isDemo ? state.profile.user_id : '';
  const bookings = useMyBookings(userId);
  const barbers = useBarbers();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const now = Date.now();
  const all = bookings.data ?? [];
  const upcoming = all.filter((b) => (b.status === 'confirmed' || b.status === 'held') && Date.parse(b.ends_at) > now).reverse();
  const past = all.filter((b) => !upcoming.includes(b));
  const list = tab === 'upcoming' ? upcoming : past;
  const barberName = (id: string) => barbers.data?.find((b) => b.id === id)?.full_name ?? '';
  const name = (b: BookingRow) => (locale === 'ru' ? b.service.name_ru : b.service.name_uz);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['myBookings'] });
    queryClient.invalidateQueries({ queryKey: ['nextBooking'] });
  };

  const cancel = (b: BookingRow) =>
    showDialog(t('booking.cancelTitle'), t('booking.cancelBody', { when: whenLabel(b.starts_at, locale) }), [
      { text: t('booking.keep'), style: 'cancel' },
      {
        text: t('booking.yesCancel'),
        style: 'destructive',
        onPress: async () => {
          const err = await bookingActions.cancel(b.id);
          if (err) showDialog(bookingErrorText(t, err) ?? '');
          refresh();
        },
      },
    ]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 24, gap: 16 }}
        refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={refresh} />}
      >
        <Text style={type.h1}>{t('tabs.bookings')}</Text>
        <Segmented
          options={[{ value: 'upcoming', label: t('booking.upcoming') }, { value: 'past', label: t('booking.past') }]}
          value={tab}
          onChange={setTab}
        />
        {bookings.isLoading && <ActivityIndicator color={colors.primary} />}
        {!bookings.isLoading && list.length === 0 && (
          <Card style={{ gap: 12 }}>
            <Text style={type.small}>{t('booking.empty')}</Text>
            {tab === 'upcoming' && <Button label={t('client.bookNow')} onPress={() => router.push('/client/book')} style={{ height: 48 }} />}
          </Card>
        )}

        {list.map((b) => {
          const canChange = tab === 'upcoming' && b.status === 'confirmed';
          const freeUntil = Date.parse(b.starts_at) - RESCHEDULE_WINDOW_MS;
          const canReschedule = canChange && b.reschedule_count < 1 && freeUntil > now;
          return (
            <Card key={b.id} style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.displaySemibold, fontSize: 18, color: colors.ink }}>{whenLabel(b.starts_at, locale)}</Text>
                  <Text style={[type.small, { fontSize: 14, marginTop: 4 }]}>
                    {name(b)} · {barberName(b.barber_id)} · {t('client.minutes', { count: b.service.duration_min })}
                  </Text>
                </View>
                <StatusPill label={t(`booking.status.${b.status}`)} tone={statusTone(b.status)} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={[type.small, { fontSize: 14, flex: 1 }]}>{t('booking.payAtShopShort')}</Text>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, flexShrink: 0 }}>{formatUzs(b.price_uzs, locale)}</Text>
              </View>
              {canChange && (
                <>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {canReschedule && (
                      <Button
                        variant="outline"
                        label={t('booking.reschedule')}
                        onPress={() => router.push({ pathname: '/client/book', params: { reschedule: b.id } })}
                        size="sm"
                        style={{ flex: 1 }}
                      />
                    )}
                    <Button
                      variant="outline"
                      label={t('booking.cancel')}
                      onPress={() => cancel(b)}
                      size="sm"
                      textColor={colors.danger}
                      style={{ flex: 1, borderColor: colors.dangerBorder }}
                    />
                  </View>
                  {canReschedule && (
                    <Text style={[type.small, { fontSize: 12 }]}>
                      {t('booking.freeReschedule', { until: `${whenLabel(new Date(freeUntil).toISOString(), locale).split(' · ')[0]}, ${localTime(new Date(freeUntil))}` })}
                    </Text>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
