import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { phoneSchema, usernameSchema } from '@ustara/shared';
import { Button, Icon, Screen } from '../../src/components';
import { Field, FormError, PasswordField } from '../../src/components/fields';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { errorText } from '../../src/features/auth/errors';
import { colors, fonts, radius, type } from '../../src/theme';
import { formatPhone } from '../../src/lib/phone';

type FieldKey = 'full_name' | 'phone' | 'username' | 'password';
const FIELD_OF: Record<string, FieldKey> = {
  invalid_name: 'full_name', invalid_phone: 'phone', phone_taken: 'phone',
  invalid_username: 'username', username_taken: 'username', password_too_short: 'password',
};

export default function SignUp() {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const [form, setForm] = useState({ full_name: '', phone: '+998 ', username: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = {
    phone: useRef<ComponentRef<typeof TextInput>>(null),
    username: useRef<ComponentRef<typeof TextInput>>(null),
    password: useRef<ComponentRef<typeof TextInput>>(null),
  };
  const set = (k: FieldKey) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Partial<Record<FieldKey, string>> = {};
    if (form.full_name.trim().length < 2) e.full_name = t('auth.errors.invalid_name');
    if (!phoneSchema.safeParse(form.phone).success) e.phone = t('auth.errors.invalid_phone');
    if (!usernameSchema.safeParse(form.username.trim()).success) e.username = t('auth.errors.invalid_username');
    if (form.password.length < 8) e.password = t('auth.errors.password_too_short');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    const err = await signUp({ ...form, full_name: form.full_name.trim(), username: form.username.trim() });
    setBusy(false);
    if (!err) return router.replace({ pathname: '/telegram-wait', params: { purpose: 'link', fromSignup: '1' } });
    const field = FIELD_OF[err];
    if (field) setErrors({ [field]: errorText(t, err) ?? '' });
    else setFormError(errorText(t, err));
  };

  return (
    <Screen fullScreen>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 24, gap: 16, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('telegram.cancel')}
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={type.h1}>{t('auth.signUpTitle')}</Text>

        <View style={{ gap: 14 }}>
          <Field
            id="su-name" label={t('auth.fullName')} value={form.full_name} onChangeText={set('full_name')} error={errors.full_name}
            autoCapitalize="words" autoComplete="name" textContentType="name"
            returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => refs.phone.current?.focus()}
          />
          <Field
            ref={refs.phone} id="su-phone" label={t('auth.phone')} value={form.phone} onChangeText={(v) => set('phone')(formatPhone(v))} error={errors.phone}
            keyboardType="phone-pad" maxLength={17} placeholder="+998 90 123 45 67" autoComplete="tel" textContentType="telephoneNumber"
            returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => refs.username.current?.focus()}
          />
          <Field
            ref={refs.username} id="su-username" label={t('auth.username')} hint={t('auth.usernameHint')}
            value={form.username} onChangeText={set('username')} error={errors.username}
            autoCapitalize="none" autoComplete="username-new" textContentType="username"
            returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => refs.password.current?.focus()}
          />
          <PasswordField
            ref={refs.password} id="su-password" label={t('auth.password')} hint={t('auth.passwordHint')}
            value={form.password} onChangeText={set('password')} error={errors.password}
            autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={submit}
          />
          <FormError message={formError} />
          <Button variant="dark" label={t('auth.createAccount')} onPress={submit} loading={busy} style={{ height: 52 }} />
        </View>

        <View style={{ marginTop: 'auto', paddingTop: 16, flexDirection: 'row', justifyContent: 'center' }}>
          <Text style={type.small}>{t('auth.haveAccount')} </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 14 }}>{t('auth.signIn')}</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
