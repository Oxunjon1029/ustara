import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatUzs, utcToTashkent } from '@ustara/shared';
import { Avatar, Badge, Button, Icon, Screen } from '../../src/components';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useBarbers, useNextBooking, useServices } from '../../src/features/catalog/queries';
import { currentLocale } from '../../src/i18n';
import { colors, fonts, radius, type } from '../../src/theme';

export default function ClientHome() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const locale = currentLocale();
  const userId = state.status === 'signedIn' ? state.profile.user_id : '';
  const name = state.status === 'signedIn' ? state.profile.full_name : '';
  const services = useServices();
  const barbers = useBarbers();
  const next = useNextBooking(userId);
  const soon = () => Alert.alert(t('common.comingSoon'), t('common.soon'));

  const n = next.data;
  const nLocal = n ? utcToTashkent(new Date(n.starts_at)) : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <View>
            <Text style={type.small}>{t('client.hello')}</Text>
            <Text style={[type.h1, { fontSize: 26 }]}>{name}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('client.notifications')} style={s.iconBtn} onPress={soon}>
            <Icon name="bell" size={20} />
          </Pressable>
        </View>

        <View style={s.nextCard}>
          <View style={s.row}>
            <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkOnDarkMuted }}>{t('client.nextVisit')}</Text>
            {n?.status === 'confirmed' && <Badge label={t('client.confirmed')} />}
          </View>
          {n && nLocal ? (
            <>
              <Text style={s.nextTime}>{nLocal.date} · {nLocal.time}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={s.darkAvatar}><Text style={{ color: colors.inkOnDark, fontFamily: fonts.semibold }}>{n.barber_name.charAt(0)}</Text></View>
                <Text style={{ color: colors.inkOnDark, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 }}>
                  {n.barber_name} · {locale === 'ru' ? n.service.name_ru : n.service.name_uz}
                  {'\n'}
                  <Text style={{ color: colors.inkOnDarkMuted }}>{t('client.minutes', { count: n.service.duration_min })} · {formatUzs(n.price_uzs, locale)}</Text>
                </Text>
              </View>
            </>
          ) : (
            <Text style={[s.nextTime, { fontSize: 18 }]}>{t('client.noVisit')}</Text>
          )}
        </View>

        <Button label={t('client.bookNow')} onPress={soon} />

        <View style={{ gap: 10 }}>
          <View style={[s.row, { alignItems: 'baseline' }]}>
            <Text style={type.h2}>{t('client.services')}</Text>
            <Pressable onPress={soon}><Text style={s.link}>{t('client.all')}</Text></Pressable>
          </View>
          <View style={s.list}>
            {services.data?.map((svc, i, arr) => (
              <View key={svc.id} style={[s.listRow, i < arr.length - 1 && s.listDivider]}>
                <View>
                  <Text style={s.rowTitle}>{locale === 'ru' ? svc.name_ru : svc.name_uz}</Text>
                  <Text style={type.small}>{t('client.minutes', { count: svc.duration_min })}</Text>
                </View>
                <Text style={s.rowTitle}>{formatUzs(svc.price_uzs, locale)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={type.h2}>{t('client.barbers')}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {barbers.data?.map((b) => (
              <View key={b.id} style={s.barber}>
                <Avatar name={b.full_name} />
                <Text style={[s.rowTitle, { fontSize: 14 }]}>{b.full_name}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted }}>★ {b.rating_avg.toFixed(1)}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: 20, paddingTop: 24, gap: 22 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  nextCard: { backgroundColor: colors.ink, borderRadius: radius.card, padding: 18, gap: 14 },
  nextTime: { fontFamily: fonts.displaySemibold, fontSize: 22, color: colors.inkOnDark },
  darkAvatar: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: '#3A3D43', alignItems: 'center', justifyContent: 'center' },
  link: { color: colors.primary, fontFamily: fonts.medium, fontSize: 14 },
  list: { backgroundColor: colors.surface, borderRadius: radius.xl },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  listDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  barber: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 12, alignItems: 'center', gap: 6 },
});
