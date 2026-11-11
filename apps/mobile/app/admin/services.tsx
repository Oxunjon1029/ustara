import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatUzs } from '@ustara/shared';
import { Button, Screen } from '../../src/components';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useAdminServices } from '../../src/features/admin/api';
import { StatusPill } from '../../src/features/booking/components';
import { currentLocale } from '../../src/i18n';
import { colors, fonts, radius, type } from '../../src/theme';

/** Shop services with default duration and price; barbers may set their own on top. */
export default function AdminServices() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const q = useAdminServices();
  return (
    <Screen fullScreen>
      <ScreenHeader title={t('admin.services')} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 10 }}>
        <Text style={type.small}>{t('admin.servicesNote')}</Text>
        <Button label={t('admin.addService')} onPress={() => router.push('/admin/service')} />
        {q.isLoading && <ActivityIndicator color={colors.primary} />}
        {q.data?.map((sv) => (
          <Pressable
            key={sv.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/admin/service', params: { id: sv.id } })}
            style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }, !sv.is_active && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{locale === 'ru' ? sv.name_ru : sv.name_uz}</Text>
              <Text style={type.small}>{t('client.minutes', { count: sv.duration_min })} · {formatUzs(sv.price_uzs, locale)}</Text>
            </View>
            {!sv.is_active && <StatusPill label={t('admin.hidden')} tone="muted" />}
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 16 },
});
