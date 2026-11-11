import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, type } from '../theme';
import { Icon } from '.';

/** Back button + title for pushed (non-tab) screens; `right` holds an optional action. */
export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <View style={s.bar}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={s.iconBtn}>
        <Icon name="back" size={20} />
      </Pressable>
      <Text style={[type.h1, { fontSize: 22, flex: 1 }]} numberOfLines={1}>{title}</Text>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
