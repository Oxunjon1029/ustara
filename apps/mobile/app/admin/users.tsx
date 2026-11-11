import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Icon, Screen } from '../../src/components';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { showDialog, type DialogButton } from '../../src/components/Dialog';
import { useUsers, type UserRow } from '../../src/features/admin/api';
import { bookingErrorText, StatusPill } from '../../src/features/booking/components';
import { supabase } from '../../src/lib/supabase';
import { colors, fonts, radius, type } from '../../src/theme';
import { formatPhone } from '../../src/lib/phone';

/** Accounts: search, make someone a barber, lift a no-show booking block. `?pick=barber` = adding a barber. */
export default function AdminUsers() {
  const { t } = useTranslation();
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const picking = pick === 'barber';
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSearch(text), 300);
    return () => clearTimeout(id);
  }, [text]);
  const q = useUsers(search);
  const queryClient = useQueryClient();
  const refresh = () => {
    for (const key of ['adminUsers', 'adminBarbers', 'barbers']) queryClient.invalidateQueries({ queryKey: [key] });
  };

  const makeBarber = (u: UserRow) =>
    showDialog(t('admin.makeBarberTitle', { name: u.full_name }), t('admin.makeBarberBody'), [
      {
        text: t('admin.makeBarber'),
        onPress: async () => {
          const { error } = await supabase.rpc('admin_set_barber', { p_user: u.user_id, p_active: true });
          if (error) return showDialog(bookingErrorText(t, error.message) ?? '');
          refresh();
          if (picking) router.back();
          showDialog(t('admin.barberAdded', { name: u.full_name }));
        },
      },
      { text: t('booking.keep'), style: 'cancel' },
    ]);

  const unblock = async (u: UserRow) => {
    const { error } = await supabase.from('profiles').update({ booking_blocked: false, no_show_count: 0 }).eq('user_id', u.user_id);
    if (error) return showDialog(t('auth.errors.server_error'));
    refresh();
    showDialog(t('admin.unblocked', { name: u.full_name }));
  };

  const menu = (u: UserRow) => {
    if (picking) return u.role === 'client' ? makeBarber(u) : showDialog(t('admin.alreadyStaff'));
    const buttons: DialogButton[] = [];
    if (u.phone) buttons.push({ text: formatPhone(u.phone), icon: <Icon name="phone" color="#fff" size={18} />, onPress: () => Linking.openURL(`tel:${u.phone}`) });
    if (u.booking_blocked) buttons.push({ text: t('admin.unblock'), onPress: () => unblock(u) });
    if (u.role === 'client') buttons.push({ text: t('admin.makeBarber'), onPress: () => makeBarber(u) });
    buttons.push({ text: t('booking.keep'), style: 'cancel' });
    const info = [
      t(`roles.${u.role}`),
      u.phone_verified ? t('profile.phoneVerified') : t('profile.phoneNotVerified'),
      u.no_show_count ? t('admin.noShows', { count: u.no_show_count }) : null,
    ].filter(Boolean).join(' · ');
    showDialog(u.full_name, info, buttons);
  };

  return (
    <Screen fullScreen>
      <ScreenHeader title={picking ? t('admin.addBarber') : t('admin.users')} />
      <View style={{ paddingHorizontal: 20, gap: 8, paddingBottom: 8 }}>
        {picking && <Text style={type.small}>{t('admin.pickHint')}</Text>}
        <TextInput
          accessibilityLabel={t('admin.search')}
          placeholder={t('admin.search')}
          placeholderTextColor={colors.disabledInk}
          value={text}
          onChangeText={setText}
          autoCorrect={false}
          autoCapitalize="none"
          style={s.search}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 8 }} keyboardShouldPersistTaps="handled">
        {q.isLoading && <ActivityIndicator color={colors.primary} />}
        {!q.isLoading && !q.data?.length && <Text style={type.small}>{t('admin.noUsers')}</Text>}
        {q.data?.map((u) => (
          <Pressable key={u.user_id} accessibilityRole="button" onPress={() => menu(u)} style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}>
            <Avatar name={u.full_name} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }} numberOfLines={1}>{u.full_name}</Text>
              <Text style={type.small} numberOfLines={1}>{[u.phone && formatPhone(u.phone), u.username && `@${u.username}`].filter(Boolean).join(' · ')}</Text>
            </View>
            {u.booking_blocked ? (
              <StatusPill label={t('admin.blocked')} tone="bad" />
            ) : u.role !== 'client' ? (
              <StatusPill label={t(`roles.${u.role}`)} tone="ok" />
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  search: {
    height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15, color: colors.ink,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12 },
});
