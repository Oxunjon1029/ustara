import { Pressable, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Card, Icon, LanguageSwitch, Screen } from '.';
import { useAuth } from '../features/auth/AuthProvider';
import { isDemo, supabase } from '../lib/supabase';
import { colors, fonts, type } from '../theme';

export function useTelegramLink(userId: string) {
  return useQuery({
    queryKey: ['telegramLink', userId],
    enabled: !isDemo && !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('telegram_links').select('tg_username').eq('user_id', userId).maybeSingle();
      return data as { tg_username: string | null } | null;
    },
  });
}

/** Shared profile tab for all roles. */
export function ProfileScreen() {
  const { t } = useTranslation();
  const { state, signOut } = useAuth();
  const userId = state.status === 'signedIn' ? state.profile.user_id : '';
  const tgLink = useTelegramLink(userId);
  const [signingOut, setSigningOut] = useState(false);
  if (state.status !== 'signedIn') return null;
  const p = state.profile;
  const linked = isDemo || !!tgLink.data;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }}>
        <Text style={type.h1}>{t('tabs.profile')}</Text>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={p.full_name} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{p.full_name}</Text>
            <Text style={type.small}>{[p.phone, p.username && `@${p.username}`, t(`roles.${p.role}`)].filter(Boolean).join(' · ')}</Text>
            <Text style={[type.small, { color: p.phone_verified ? colors.primary : colors.warnInk, marginTop: 2 }]}>
              {p.phone_verified ? t('profile.phoneVerified') : t('profile.phoneNotVerified')}
            </Text>
          </View>
        </Card>

        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="telegram" color={colors.telegram} />
            <Text style={[type.label, { flex: 1, fontSize: 15 }]}>{t('profile.telegram')}</Text>
            <Text style={[type.small, linked && { color: colors.primary, fontFamily: fonts.semibold }]}>
              {linked ? (tgLink.data?.tg_username ? `@${tgLink.data.tg_username}` : t('profile.linked')) : t('profile.notLinked')}
            </Text>
          </View>
          {!linked && !tgLink.isLoading && (
            <Button
              variant="telegram"
              label={t('profile.link')}
              onPress={() => router.push({ pathname: '/telegram-wait', params: { purpose: 'link' } })}
              style={{ height: 48 }}
            />
          )}
        </Card>

        {p.role === 'barber' && (
          <Pressable accessibilityRole="button" onPress={() => router.push('/barber/services')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="scissors" color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[type.label, { fontSize: 15 }]}>{t('myServices.title')}</Text>
                <Text style={type.small}>{t('myServices.entryHint')}</Text>
              </View>
              <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={18} color={colors.inkMuted} /></View>
            </Card>
          </Pressable>
        )}

        <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={type.label}>{t('common.language')}</Text>
          <LanguageSwitch />
        </Card>
        <Button
          variant="outline"
          label={t('common.signOut')}
          loading={signingOut}
          onPress={async () => {
            setSigningOut(true);
            try {
              await signOut();
            } finally {
              setSigningOut(false);
            }
          }}
          style={{ borderColor: colors.dangerBorder }}
        />
      </ScrollView>
    </Screen>
  );
}
