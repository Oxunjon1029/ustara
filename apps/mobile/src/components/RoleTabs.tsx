import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '.';
import { AppHeader } from './AppHeader';
import { colors, fonts } from '../theme';

type IconName = Parameters<typeof Icon>[0]['name'];

/** Bottom tab bar styled like the UI canvas. */
export function RoleTabs({ tabs }: { tabs: { name: string; label: string; icon: IconName }[] }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        // One app header (logo + notifications) above every tab screen.
        header: () => <AppHeader />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        // Explicit: 60px of tab content plus the system navigation area (3-button bar or gesture handle).
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.chrome,
          // Web (Telegram Mini App) text renders taller, so give labels a bit more room there.
          height: (Platform.OS === 'web' ? 66 : 60) + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 8 : 6),
        },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: t(tab.label), tabBarIcon: ({ color }) => <Icon name={tab.icon} color={String(color)} /> }}
        />
      ))}
    </Tabs>
  );
}
