import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, type } from '../theme';
import { BottomSheet } from './BottomSheet';

export type DialogButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  icon?: ReactNode;
  onPress?: () => void;
};
type DialogState = { title: string; message?: string; buttons: DialogButton[] };

let push: ((d: DialogState | null) => void) | null = null;

/** Drop-in replacement for Alert.alert: same arguments, rendered as an app-styled bottom sheet. */
export function showDialog(title: string, message?: string, buttons?: DialogButton[]) {
  push?.({ title, message, buttons: buttons ?? [] });
}

/** Mounted once in the root layout. */
export function DialogHost() {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    push = setDialog;
    return () => {
      push = null;
    };
  }, []);

  if (!dialog) return null;

  const buttons = dialog.buttons.length ? dialog.buttons : [{ text: t('common.ok'), style: 'cancel' as const }];
  const cancel = buttons.find((b) => b.style === 'cancel');
  // Actions first, the cancel button last (closest to the thumb).
  const actions = buttons.filter((b) => b.style !== 'cancel');
  const firstDefault = actions.findIndex((a) => a.style !== 'destructive');
  const press = (b?: DialogButton) => {
    setDialog(null);
    b?.onPress?.();
  };

  return (
    <BottomSheet onDismiss={() => press(cancel)}>
      {(close) => (
        <>
          <Text style={type.h2} accessibilityRole="header">{dialog.title}</Text>
          {dialog.message ? <Text style={[type.body, { color: colors.inkMuted, marginTop: 4 }]}>{dialog.message}</Text> : null}
          <View style={{ gap: 10, marginTop: 20 }}>
            {actions.map((b, i) => {
              const danger = b.style === 'destructive';
              const filled = i === firstDefault;
              return (
                <Pressable
                  key={b.text}
                  accessibilityRole="button"
                  onPress={() => press(b)}
                  style={({ pressed }) => [
                    s.btn,
                    filled && { backgroundColor: colors.primary },
                    danger && { backgroundColor: '#FBEDEB', borderColor: colors.dangerBorder, borderWidth: 1 },
                    !filled && !danger && { borderWidth: 1, borderColor: colors.border },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  {b.icon}
                  <Text style={[s.btnText, { color: filled ? '#fff' : danger ? colors.danger : colors.ink }]} numberOfLines={1}>
                    {b.text}
                  </Text>
                </Pressable>
              );
            })}
            {cancel && (
              <Pressable
                accessibilityRole="button"
                onPress={() => close()}
                style={({ pressed }) => [s.btn, { backgroundColor: colors.segment }, pressed && { opacity: 0.85 }]}
              >
                <Text style={[s.btnText, { color: colors.ink }]} numberOfLines={1}>{cancel.text}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  btn: { height: 52, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  btnText: { fontFamily: fonts.semibold, fontSize: 16 },
});
