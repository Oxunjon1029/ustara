import { useRef, useState, type ComponentRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { Role } from '@ustara/shared';
import { Button, Icon, LanguageSwitch, Screen } from '../../src/components';
import { Field, FormError, PasswordField } from '../../src/components/fields';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { errorText } from '../../src/features/auth/errors';
import { isDemo } from '../../src/lib/supabase';
import { colors, fonts, type } from '../../src/theme';

export default function Welcome() {
  const { t } = useTranslation();
  const { signInWithPassword, signInDemo } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  const needsBackend = (go: () => void) => () => (isDemo ? Alert.alert(t('common.comingSoon'), t('auth.needsSupabase')) : go());

  const submit = async () => {
    if (isDemo || busy) return;
    setBusy(true);
    setError(null);
    const err = await signInWithPassword(login.trim(), password);
    setBusy(false);
    if (err) setError(errorText(t, err));
  };

  return (
    <Screen fullScreen>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.top}>
          <View style={s.brand}>
            <View style={s.logo}><Icon name="scissors" color={colors.ground} size={20} /></View>
            <Text style={s.brandText}>Ustara</Text>
          </View>
          <LanguageSwitch />
        </View>

        <View style={{ marginTop: 56 }}>
          <Text style={type.hero}>{t('auth.heroTitle')}</Text>
          <Text style={[type.body, { color: colors.inkMuted, marginTop: 12 }]}>{t('auth.heroBody')}</Text>
        </View>

        <Button
          variant="telegram"
          label={t('auth.telegram')}
          icon={<Icon name="telegram" color="#fff" />}
          onPress={needsBackend(() => router.push({ pathname: '/telegram-wait', params: { purpose: 'login' } }))}
          style={{ marginTop: 40 }}
        />
        <Text style={[type.small, { textAlign: 'center', marginTop: 8 }]}>{t('auth.telegramHint')}</Text>

        <View style={s.divider}>
          <View style={s.line} />
          <Text style={type.small}>{t('auth.orPassword')}</Text>
          <View style={s.line} />
        </View>

        <View style={{ gap: 14 }}>
          <Field
            id="login-id"
            label={t('auth.login')}
            value={login}
            onChangeText={setLogin}
            autoCapitalize="none"
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <PasswordField
            ref={passwordRef}
            id="login-pw"
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <FormError message={error} />
          <Pressable
            onPress={needsBackend(() => router.push({ pathname: '/telegram-wait', params: { purpose: 'reset' } }))}
            style={{ alignSelf: 'flex-end', paddingVertical: 4 }}
          >
            <Text style={s.link}>{t('auth.forgot')}</Text>
          </Pressable>
          <Button variant="dark" label={t('auth.signIn')} onPress={submit} loading={busy} disabled={isDemo} style={{ height: 52 }} />
        </View>

        {isDemo && (
          <View style={{ marginTop: 24, gap: 8 }}>
            <Text style={[type.small, { textAlign: 'center' }]}>{t('auth.demoTitle')}</Text>
            {(['client', 'barber', 'admin'] as Role[]).map((r) => (
              <Button key={r} variant="outline" label={t('auth.demoAs', { role: t(`roles.${r}`) })} onPress={() => signInDemo(r)} style={{ height: 48 }} />
            ))}
          </View>
        )}

        <View style={s.footer}>
          <Text style={type.small}>{t('auth.noAccount')} </Text>
          <Pressable onPress={needsBackend(() => router.push('/signup'))}>
            <Text style={[s.link, { fontFamily: fonts.semibold }]}>{t('auth.signUp')}</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: 24, paddingBottom: 32, flexGrow: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28, marginBottom: 20 },
  line: { flex: 1, height: 1, backgroundColor: '#DCD7CD' },
  link: { color: colors.primary, fontFamily: fonts.medium, fontSize: 14 },
  footer: { marginTop: 'auto', paddingTop: 24, flexDirection: 'row', justifyContent: 'center' },
});
