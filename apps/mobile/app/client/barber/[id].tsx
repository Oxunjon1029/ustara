import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatUzs } from '@ustara/shared';
import { Avatar, Button, Icon, Screen } from '../../../src/components';
import { useBarberProfile } from '../../../src/features/catalog/queries';
import { currentLocale } from '../../../src/i18n';
import { localDate, longDate, weekdayName } from '../../../src/lib/dates';
import { Stars, useBarberReviews } from '../../../src/features/reviews';
import { colors, fonts, radius, type } from '../../../src/theme';

const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first

/** Barber profile for clients: bio, rating, services with their prices, weekly hours, and a booking shortcut. */
export default function BarberProfileScreen() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useBarberProfile(id);
  const b = q.data;
  const reviews = useBarberReviews(id);
  const book = (service?: string) =>
    router.push({ pathname: '/client/book', params: service ? { barber: id, service } : { barber: id } });

  return (
    <Screen fullScreen>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('telegram.cancel')} onPress={() => router.back()} style={s.iconBtn}>
          <Icon name="back" size={20} />
        </Pressable>
      </View>

      {!b ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 20 }}>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Avatar name={b.full_name} size={88} uri={b.photo_url} />
              <Text style={[type.h1, { textAlign: 'center' }]}>{b.full_name}</Text>
              <Text style={type.small}>
                {b.rating_count > 0 ? `★ ${b.rating_avg.toFixed(1)} · ${t('barberProfile.reviews', { count: b.rating_count })}` : t('reviews.new')}
              </Text>
            </View>

            {(b.bio[locale] ?? b.bio.uz) ? (
              <Text style={[type.body, { color: colors.inkMuted, textAlign: 'center' }]}>{b.bio[locale] ?? b.bio.uz}</Text>
            ) : null}

            <View style={{ gap: 10 }}>
              <Text style={type.h2}>{t('client.services')}</Text>
              <View style={s.list}>
                {b.services.map((sv, i, arr) => (
                  <Pressable
                    key={sv.id}
                    accessibilityRole="button"
                    accessibilityHint={t('client.bookNow')}
                    onPress={() => book(sv.id)}
                    style={[s.row, i < arr.length - 1 && s.divider]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle}>{locale === 'ru' ? sv.name_ru : sv.name_uz}</Text>
                      <Text style={type.small}>{t('client.minutes', { count: sv.duration_min })}</Text>
                    </View>
                    <Text style={s.rowTitle}>{formatUzs(sv.price, locale)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={type.h2}>{t('barberProfile.hours')}</Text>
              <View style={[s.list, { paddingVertical: 6 }]}>
                {WEEK.map((d) => (
                  <View key={d} style={s.hoursRow}>
                    <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.ink }}>{weekdayName(d, locale)}</Text>
                    <Text style={{ fontFamily: fonts.body, fontSize: 15, color: b.hours[d] ? colors.ink : colors.inkMuted }}>
                      {b.hours[d] ?? t('barber.closed')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {!!reviews.data?.length && (
              <View style={{ gap: 10 }}>
                <Text style={type.h2}>{t('reviews.heading')}</Text>
                {reviews.data.map((r, i) => (
                  <View key={i} style={[s.list, { padding: 14, gap: 6 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <Stars value={r.rating} size={15} />
                      <Text style={type.small}>{longDate(localDate(r.created_at), locale).split(', ')[1]}</Text>
                    </View>
                    {!!r.comment && <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.ink }}>{r.comment}</Text>}
                    {!!r.client_name && <Text style={type.small}>{r.client_name}</Text>}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
            <Button label={t('barberProfile.bookWith', { name: b.full_name })} onPress={() => book()} />
          </View>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  list: { backgroundColor: colors.surface, borderRadius: radius.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 16 },
});
