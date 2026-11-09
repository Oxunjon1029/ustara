import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, LanguageSwitch, Screen } from '.';
import { useAuth } from '../features/auth/AuthProvider';
import { colors, type } from '../theme';

/** Shared profile tab for all roles (Telegram link, payment history etc. arrive in later milestones). */
export function ProfileScreen() {
  const { t } = useTranslation();
  const { state, signOut } = useAuth();
  if (state.status !== 'signedIn') return null;
  const p = state.profile;
  return (
    <Screen style={{ padding: 20, gap: 16 }}>
      <Text style={type.h1}>{t('tabs.profile')}</Text>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={p.full_name} size={48} />
        <View>
          <Text style={[type.body, { fontWeight: '600' }]}>{p.full_name}</Text>
          <Text style={type.small}>{[p.phone, p.username && `@${p.username}`, t(`roles.${p.role}`)].filter(Boolean).join(' · ')}</Text>
        </View>
      </Card>
      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={type.label}>{t('common.language')}</Text>
        <LanguageSwitch />
      </Card>
      <Button variant="outline" label={t('common.signOut')} onPress={signOut} style={{ borderColor: colors.dangerBorder }} />
    </Screen>
  );
}
