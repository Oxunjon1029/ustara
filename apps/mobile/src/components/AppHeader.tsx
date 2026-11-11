import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../features/auth/AuthProvider';
import { BellButton } from '../features/notifications/NotificationsScreen';
import { colors, fonts, radius } from '../theme';
import { Icon } from '.';

/** Brand mark: scissors tile + wordmark. */
export function Logo() {
  return (
    <View style={s.logo} accessibilityRole="header" accessibilityLabel="Ustara">
      <View style={s.mark}>
        <Icon name="scissors" color="#fff" size={18} />
      </View>
      <Text style={s.word}>Ustara</Text>
    </View>
  );
}

/** Header shared by every tab screen: logo on the left, notifications on the right (clients and barbers). */
export function AppHeader() {
  const insets = useSafeAreaInsets();
  const { state } = useAuth();
  const role = state.status === 'signedIn' ? state.profile.role : null;
  return (
    <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
      <Logo />
      {role === 'client' && <BellButton href="/client/notifications" />}
      {role === 'barber' && <BellButton href="/barber/notifications" />}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 8, backgroundColor: colors.ground,
  },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  mark: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  word: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, letterSpacing: -0.3 },
});
