import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Screen } from '../../src/components';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useAdminBarbers } from '../../src/features/admin/api';
import { StatusPill } from '../../src/features/booking/components';
import { colors, fonts, radius, type } from '../../src/theme';
import { formatPhone } from '../../src/lib/phone';

/** All barbers (active first); add one by picking an existing account. */
export default function AdminBarbers() {
  const { t } = useTranslation();
  const q = useAdminBarbers();
  return (
    <Screen fullScreen>
      <ScreenHeader title={t('admin.barbers')} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 10 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} />}
      >
        <Button label={t('admin.newBarber')} onPress={() => router.push('/admin/new-barber')} />
        <Button variant="outline" size="sm" label={t('admin.fromExisting')} onPress={() => router.push({ pathname: '/admin/users', params: { pick: 'barber' } })} />
        {q.isLoading && <ActivityIndicator color={colors.primary} />}
        {q.data?.map((b) => (
          <Pressable
            key={b.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/admin/barber/[id]', params: { id: b.id } })}
            style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }, !b.is_active && { opacity: 0.7 }]}
          >
            <Avatar name={b.full_name} uri={b.photo_url} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{b.full_name}</Text>
              <Text style={type.small} numberOfLines={1}>
                {[b.phone && formatPhone(b.phone), b.username && `@${b.username}`].filter(Boolean).join(' · ')}
              </Text>
              <Text style={type.small}>★ {b.rating_avg.toFixed(1)} · {t('barberProfile.reviews', { count: b.rating_count })}</Text>
            </View>
            <StatusPill label={b.is_active ? t('admin.active') : t('admin.inactive')} tone={b.is_active ? 'ok' : 'muted'} />
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 14 },
});
