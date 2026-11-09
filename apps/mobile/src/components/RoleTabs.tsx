import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '.';
import { colors, fonts } from '../theme';

type IconName = Parameters<typeof Icon>[0]['name'];

/** Bottom tab bar styled like the UI canvas. */
export function RoleTabs({ tabs }: { tabs: { name: string; label: string; icon: IconName }[] }) {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.chrome, height: 76, paddingTop: 8 },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
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
