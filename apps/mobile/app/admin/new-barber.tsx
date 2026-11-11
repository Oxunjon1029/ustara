import { useState } from 'react';
import { Share, Text } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Screen } from '../../src/components';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Field, FormError, PasswordField } from '../../src/components/fields';
import { showDialog } from '../../src/components/Dialog';
import { bookingErrorText } from '../../src/features/booking/components';
import { currentLocale } from '../../src/i18n';
import { callFn } from '../../src/lib/api';
import { credentialsText, generatePassword } from '../../src/features/admin/api';
import { type } from '../../src/theme';
import { formatPhone } from '../../src/lib/phone';

/** Admin creates a barber account with a login and password; the barber just signs in. */
export default function NewBarber() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(generatePassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    setBusy(true);
    const res = await callFn<{ user_id: string; barber_id: string }>('auth-password', {
      action: 'create_barber', full_name: name, username, phone, password, locale: currentLocale(),
    });
    setBusy(false);
    if (res.error || !res.data) return setError(bookingErrorText(t, res.error ?? 'server_error'));
    for (const key of ['adminBarbers', 'barbers', 'adminUsers']) queryClient.invalidateQueries({ queryKey: [key] });
    const text = credentialsText(t, username.trim(), password);
    router.replace({ pathname: '/admin/barber/[id]', params: { id: res.data.barber_id } });
    showDialog(t('admin.barberCreated', { name: name.trim() }), text, [
      { text: t('admin.sendLogin'), onPress: () => { Share.share({ message: text }); } },
      { text: t('common.done'), style: 'cancel' },
    ]);
  };

  return (
    <Screen fullScreen>
      <ScreenHeader title={t('admin.newBarber')} />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={type.small}>{t('admin.newBarberHint')}</Text>
        <Field id="name" label={t('auth.fullName')} value={name} onChangeText={setName} maxLength={60} autoCapitalize="words" />
        <Field id="username" label={t('auth.username')} hint={t('auth.usernameHint')} value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={32} />
        <Field id="phone" label={t('barber.phoneOptional')} hint={t('admin.phoneHint')} value={phone} onChangeText={(v) => setPhone(formatPhone(v))} keyboardType="phone-pad" maxLength={17} placeholder="+998 90 123 45 67" />
        <PasswordField id="password" label={t('auth.password')} hint={t('auth.passwordHint')} value={password} onChangeText={setPassword} autoCapitalize="none" />
        <Button variant="outline" size="sm" label={t('admin.newPassword')} onPress={() => setPassword(generatePassword())} />
        <FormError message={error} />
        <Button label={t('admin.createBarber')} onPress={create} loading={busy} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
