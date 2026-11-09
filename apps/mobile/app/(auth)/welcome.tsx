import { useRef, useState, type ComponentRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import type { Role } from '@ustara/shared';
import { Button, Icon, LanguageSwitch, Screen } from '../../src/components';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { isDemo } from '../../src/lib/supabase';
import { colors, fonts, radius, type } from '../../src/theme';

export default function Welcome() {
  const { t } = useTranslation();
  const { signInWithPassword, signInDemo } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef =useRef<ComponentRef<typeof TextInput>>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const ok = await signInWithPassword(login, password);
    setBusy(false);
    if (!ok) setError(t('auth.invalid'));
  };

  const soon = () => Alert.alert(t('common.comingSoon'), t('common.soon'));

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

          <Button variant="telegram" label={t('auth.telegram')} icon={<Icon name="telegram" color="#fff" />} onPress={soon} style={{ marginTop: 40 }} />
          <Text style={[type.small, { textAlign: 'center', marginTop: 8 }]}>{t('auth.telegramHint')}</Text>

          <View style={s.divider}>
            <View style={s.line} />
            <Text style={type.small}>{t('auth.orPassword')}</Text>
            <View style={s.line} />
          </View>

          <View style={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <Text nativeID="login-label" style={type.label}>{t('auth.login')}</Text>
              <TextInput
                accessibilityLabelledBy="login-label"
                value={login}
                onChangeText={setLogin}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
                style={s.input}
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text nativeID="pw-label" style={type.label}>{t('auth.password')}</Text>
              <View style={s.passwordWrap}>
                <TextInput
                  ref={passwordRef}
                  accessibilityLabelledBy="pw-label"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={() => !isDemo && submit()}
                  style={[s.input, { paddingRight: 52 }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  style={s.eye}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} color={colors.inkMuted} size={20} />
                </Pressable>
              </View>
            </View>
            {error && <Text style={{ color: colors.danger, fontFamily: fonts.medium }}>{error}</Text>}
            <Pressable onPress={soon} style={{ alignSelf: 'flex-end', paddingVertical: 4 }}>
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
            <Pressable onPress={soon}><Text style={[s.link, { fontFamily: fonts.semibold }]}>{t('auth.signUp')}</Text></Pressable>
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
  input: { height: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 16, color: colors.ink },
  passwordWrap: { justifyContent: 'center' },
  eye: { position: 'absolute', right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  link: { color: colors.primary, fontFamily: fonts.medium, fontSize: 14 },
  footer: { marginTop: 'auto', paddingTop: 24, flexDirection: 'row', justifyContent: 'center' },
});
