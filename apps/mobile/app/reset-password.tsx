import { useRef, useState, type ComponentRef } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button, Screen } from '../src/components';
import { FormError, PasswordField } from '../src/components/fields';
import { useAuth } from '../src/features/auth/AuthProvider';
import { errorText } from '../src/features/auth/errors';
import { callFn, type SessionTokens } from '../src/lib/api';
import { colors, type } from '../src/theme';

/** Shown after the user confirmed a password reset in the Telegram bot. */
export default function ResetPassword() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { applySession } = useAuth();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repeatRef = useRef<ComponentRef<typeof TextInput>>(null);

  const submit = async () => {
    if (password.length < 8) return setError(t('auth.errors.password_too_short'));
    if (password !== repeat) return setError(t('auth.passwordsDiffer'));
    setBusy(true);
    setError(null);
    const res = await callFn<{ session: SessionTokens }>('telegram-token', { action: 'reset_password', token, password });
    const err = res.data ? await applySession(res.data.session) : res.error;
    setBusy(false);
    if (err) return setError(errorText(t, err));
    router.replace('/');
  };

  return (
    <Screen fullScreen>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={[type.h1, { marginTop: 32 }]}>{t('auth.newPasswordTitle')}</Text>
        <Text style={[type.body, { color: colors.inkMuted }]}>{t('auth.newPasswordBody')}</Text>
        <View style={{ gap: 14, marginTop: 8 }}>
          <PasswordField
            id="new-pw"
            label={t('auth.newPassword')}
            hint={t('auth.passwordHint')}
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => repeatRef.current?.focus()}
          />
          <PasswordField
            ref={repeatRef}
            id="repeat-pw"
            label={t('auth.repeatPassword')}
            value={repeat}
            onChangeText={setRepeat}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <FormError message={error} />
          <Button variant="dark" label={t('auth.savePassword')} onPress={submit} loading={busy} style={{ height: 52 }} />
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
