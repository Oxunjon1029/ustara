import { forwardRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '.';
import { colors, fonts, radius, type } from '../theme';

type InputRef = ComponentRef<typeof TextInput>;

interface FieldProps extends TextInputProps {
  label: string;
  /** Unique id linking the label to the input for screen readers */
  id: string;
  hint?: string;
  error?: string | null;
}

/** Labelled text input matching the sign-in design. */
export const Field = forwardRef<InputRef, FieldProps>(function Field({ label, id, hint, error, style, ...props }, ref) {
  return (
    <View style={{ gap: 6 }}>
      <Text nativeID={id} style={type.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabelledBy={id}
        autoCorrect={false}
        placeholderTextColor={colors.disabledInk}
        style={[s.input, !!error && { borderColor: colors.danger }, style]}
        {...props}
      />
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={type.small}>{hint}</Text> : null}
    </View>
  );
});

/** Password input with a show/hide eye button. */
export const PasswordField = forwardRef<InputRef, FieldProps>(function PasswordField({ label, id, hint, error, ...props }, ref) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text nativeID={id} style={type.label}>{label}</Text>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          ref={ref}
          accessibilityLabelledBy={id}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          style={[s.input, { paddingRight: 52 }, !!error && { borderColor: colors.danger }]}
          {...props}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(show ? 'auth.hidePassword' : 'auth.showPassword')}
          onPress={() => setShow((v) => !v)}
          hitSlop={8}
          style={s.eye}
        >
          <Icon name={show ? 'eyeOff' : 'eye'} color={colors.inkMuted} size={20} />
        </Pressable>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={type.small}>{hint}</Text> : null}
    </View>
  );
});

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={s.banner}>
      <Text style={{ color: colors.danger, fontFamily: fonts.medium, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  input: {
    height: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface,
    paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 16, color: colors.ink,
  },
  eye: { position: 'absolute', right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13 },
  banner: { backgroundColor: '#FBEAE7', borderRadius: radius.md, padding: 12 },
});
