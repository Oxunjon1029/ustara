import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { showDialog } from './Dialog';
import { changePhoto } from '../lib/photo';
import { Avatar, Button, Card, Icon, LanguageSwitch, Screen } from '.';
import { ScreenHeader } from './ScreenHeader';
import { useAuth } from '../features/auth/AuthProvider';
import { isDemo, photoUrl, supabase } from '../lib/supabase';
import { colors, fonts, type } from '../theme';
import { formatPhone } from '../lib/phone';

/** The signed-in user's photo: a barber's is stored on barbers (shown to clients), everyone else's on profiles. */
function useMyPhoto(userId: string, isBarber: boolean) {
  return useQuery({
    queryKey: ['myPhoto', userId],
    enabled: !!userId && !isDemo,
    queryFn: async () => {
      const { data } = isBarber
        ? await supabase.from('barbers').select('photo_path').eq('user_id', userId).maybeSingle()
        : await supabase.from('profiles').select('photo_path').eq('user_id', userId).maybeSingle();
      const path = (data?.photo_path as string | null | undefined) ?? null;
      return { path, url: photoUrl(path) };
    },
  });
}

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

/** Own profile. `pushed`: shown as a stacked page (admin) with a back header instead of a tab. */
export function ProfileScreen({ pushed }: { pushed?: boolean } = {}) {
  const { t } = useTranslation();
  const { state, signOut } = useAuth();
  const userId = state.status === 'signedIn' ? state.profile.user_id : '';
  const tgLink = useTelegramLink(userId);
  const [signingOut, setSigningOut] = useState(false);
  const isBarber = state.status === 'signedIn' && state.profile.role === 'barber';
  const photo = useMyPhoto(userId, isBarber);
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const onPhoto = async () => {
    setUploading(true);
    try {
      if (await changePhoto(userId, isBarber, photo.data?.path ?? null)) {
        for (const key of ['myPhoto', 'barbers', 'barberProfile', 'adminBarbers']) queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch {
      showDialog(t('admin.photoFailed'));
    }
    setUploading(false);
  };
  if (state.status !== 'signedIn') return null;
  const p = state.profile;
  const linked = isDemo || !!tgLink.data;

  return (
    <Screen fullScreen={pushed}>
      {pushed && <ScreenHeader title={t('tabs.profile')} />}
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }}>
        {!pushed && <Text style={type.h1}>{t('tabs.profile')}</Text>}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('admin.changePhoto')} onPress={onPhoto} disabled={uploading || isDemo}>
            <Avatar name={p.full_name} size={56} uri={photo.data?.url} />
            <View style={st.camBadge}>
              {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.camText}>+</Text>}
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{p.full_name}</Text>
            <Text style={type.small}>{[p.phone && formatPhone(p.phone), p.username && `@${p.username}`, t(`roles.${p.role}`)].filter(Boolean).join(' · ')}</Text>
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

const st = StyleSheet.create({
  camBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  camText: { color: '#fff', fontFamily: fonts.semibold, fontSize: 14, lineHeight: 16 },
});
