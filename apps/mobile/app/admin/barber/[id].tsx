import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, Screen } from '../../../src/components';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { Field, FormError } from '../../../src/components/fields';
import { showDialog } from '../../../src/components/Dialog';
import { credentialsText, generatePassword, useAdminBarbers, type AdminBarber } from '../../../src/features/admin/api';
import { callFn } from '../../../src/lib/api';
import { rpc } from '../../../src/features/booking/api';
import { bookingErrorText } from '../../../src/features/booking/components';
import { supabase } from '../../../src/lib/supabase';
import { changePhoto as uploadAndSave } from '../../../src/lib/photo';
import { colors, fonts, type } from '../../../src/theme';
import { formatPhone } from '../../../src/lib/phone';

/** Admin edits a barber: photo, name, bio (uz/ru), active state. */
export default function AdminBarberEdit() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useAdminBarbers();
  const b = q.data?.find((x) => x.id === id);
  return (
    <Screen fullScreen>
      <ScreenHeader title={b?.full_name ?? t('admin.barbers')} />
      {!b ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : <Form b={b} />}
    </Screen>
  );
}

function Form({ b }: { b: AdminBarber }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(b.full_name);
  const [bioUz, setBioUz] = useState(b.bio_uz ?? '');
  const [bioRu, setBioRu] = useState(b.bio_ru ?? '');
  const [busy, setBusy] = useState<'save' | 'photo' | 'active' | 'password' | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setName(b.full_name), [b.full_name]);

  const refresh = () => {
    for (const key of ['adminBarbers', 'barbers', 'barberProfile', 'adminUsers']) queryClient.invalidateQueries({ queryKey: [key] });
  };

  const changePhoto = async () => {
    setError(null);
    setBusy('photo');
    try {
      if (await uploadAndSave(b.user_id, true, b.photo_path)) refresh();
    } catch {
      setError(t('admin.photoFailed'));
    }
    setBusy(null);
  };

  const save = async () => {
    if (name.trim().length < 2) return setError(t('auth.errors.invalid_name'));
    setError(null);
    setBusy('save');
    const [p, br] = await Promise.all([
      supabase.from('profiles').update({ full_name: name.trim() }).eq('user_id', b.user_id),
      supabase.from('barbers').update({ bio_uz: bioUz.trim() || null, bio_ru: bioRu.trim() || null }).eq('id', b.id),
    ]);
    setBusy(null);
    if (p.error || br.error) return setError(t('auth.errors.server_error'));
    refresh();
    showDialog(t('barber.saved'));
    router.back();
  };

  const setActive = async (active: boolean) => {
    setBusy('active');
    const { data, error: err } = await supabase.rpc('admin_set_barber', { p_user: b.user_id, p_active: active });
    setBusy(null);
    if (err) return setError(bookingErrorText(t, err.message));
    refresh();
    if (!active && Number(data) > 0) showDialog(t('admin.deactivated'), t('admin.upcomingLeft', { count: Number(data) }));
  };

  // New password for a barber who forgot theirs; the old one stops working.
  const resetPassword = () => {
    const password = generatePassword();
    showDialog(t('admin.resetPasswordTitle'), t('admin.resetPasswordBody', { password }), [
      {
        text: t('admin.resetPasswordConfirm'),
        onPress: async () => {
          setBusy('password');
          const res = await callFn('auth-password', { action: 'set_password', user_id: b.user_id, password });
          setBusy(null);
          if (res.error) return setError(bookingErrorText(t, res.error));
          const text = b.username ? credentialsText(t, b.username, password) : password;
          showDialog(t('admin.passwordChanged'), text, [
            { text: t('admin.sendLogin'), onPress: () => { Share.share({ message: text }).catch(() => {}); } },
            { text: t('common.done'), style: 'cancel' },
          ]);
        },
      },
      { text: t('booking.keep'), style: 'cancel' },
    ]);
  };

  const confirmDeactivate = () =>
    showDialog(t('admin.deactivateTitle', { name: b.full_name }), t('admin.deactivateBody'), [
      { text: t('admin.deactivate'), style: 'destructive', onPress: () => setActive(false) },
      { text: t('booking.keep'), style: 'cancel' },
    ]);

  return (
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('admin.changePhoto')} onPress={changePhoto} disabled={!!busy}>
          <Avatar name={b.full_name} uri={b.photo_url} size={72} />
        </Pressable>
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={type.small}>{[b.phone && formatPhone(b.phone), b.username && `@${b.username}`].filter(Boolean).join(' · ')}</Text>
          <Button variant="outline" size="sm" label={t('admin.changePhoto')} onPress={changePhoto} loading={busy === 'photo'} />
        </View>
      </Card>

      <Field id="name" label={t('auth.fullName')} value={name} onChangeText={setName} maxLength={60} />
      <Field id="bioUz" label={t('admin.bioUz')} value={bioUz} onChangeText={setBioUz} multiline maxLength={300} style={{ height: 96, paddingTop: 12, textAlignVertical: 'top' }} />
      <Field id="bioRu" label={t('admin.bioRu')} value={bioRu} onChangeText={setBioRu} multiline maxLength={300} style={{ height: 96, paddingTop: 12, textAlignVertical: 'top' }} />
      <FormError message={error} />
      <Button label={t('barber.save')} onPress={save} loading={busy === 'save'} disabled={!!busy && busy !== 'save'} />

      <Card style={{ gap: 10 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{t('admin.loginTitle')}</Text>
        <Text style={type.small}>{b.username ? t('admin.loginIs', { username: b.username }) : t('admin.noUsername')}</Text>
        <Button variant="outline" label={t('admin.resetPassword')} onPress={resetPassword} loading={busy === 'password'} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>
          {b.is_active ? t('admin.activeHint') : t('admin.inactiveHint')}
        </Text>
        {b.is_active ? (
          <Button
            variant="outline"
            label={t('admin.deactivate')}
            textColor={colors.danger}
            style={{ borderColor: colors.dangerBorder }}
            onPress={confirmDeactivate}
            loading={busy === 'active'}
          />
        ) : (
          <Button variant="dark" label={t('admin.activate')} onPress={() => setActive(true)} loading={busy === 'active'} />
        )}
      </Card>
    </KeyboardAwareScrollView>
  );
}
