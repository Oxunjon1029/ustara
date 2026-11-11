import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Icon, Screen } from '../../../src/components';
import { colors, fonts, radius, type } from '../../../src/theme';

type IconName = Parameters<typeof Icon>[0]['name'];

const ITEMS: { href: Href; icon: IconName; title: string; hint: string }[] = [
  { href: '/admin/barbers', icon: 'scissors', title: 'admin.barbers', hint: 'admin.barbersHint' },
  { href: '/admin/services', icon: 'clock', title: 'admin.services', hint: 'admin.servicesHint' },
  { href: '/admin/fees', icon: 'wallet', title: 'admin.fees', hint: 'admin.feesHint' },
  { href: '/admin/users', icon: 'user', title: 'admin.users', hint: 'admin.usersHint' },
  { href: '/admin/settings', icon: 'settings', title: 'admin.settings', hint: 'admin.settingsHint' },
  { href: '/admin/profile', icon: 'user', title: 'tabs.profile', hint: 'admin.profileHint' },
];

/** Admin hub: links to every management screen. */
export default function Manage() {
  const { t } = useTranslation();
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 10 }}>
        <Text style={[type.h1, { marginBottom: 6 }]}>{t('tabs.manage')}</Text>
        {ITEMS.map((it) => (
          <Pressable
            key={String(it.href)}
            accessibilityRole="button"
            onPress={() => router.push(it.href)}
            style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}
          >
            <View style={s.icon}><Icon name={it.icon} color={colors.primary} size={20} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{t(it.title)}</Text>
              <Text style={type.small}>{t(it.hint)}</Text>
            </View>
            <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={18} color={colors.inkMuted} /></View>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 14 },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
