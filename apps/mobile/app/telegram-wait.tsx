import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Icon, Screen } from '../src/components';
import { FormError } from '../src/components/fields';
import { useAuth } from '../src/features/auth/AuthProvider';
import { errorText } from '../src/features/auth/errors';
import { callFn, type SessionTokens } from '../src/lib/api';
import { colors, fonts, radius, type } from '../src/theme';

type Purpose = 'login' | 'link' | 'reset';
type Status = 'starting' | 'pending' | 'confirmed' | 'expired' | 'error';

const POLL_MS = 2000;

/** Waits while the user confirms in the Telegram bot (sign-in, linking, or password reset). */
export default function TelegramWait() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ purpose?: Purpose; fromSignup?: string }>();
  const purpose: Purpose = params.purpose === 'link' || params.purpose === 'reset' ? params.purpose : 'login';
  const fromSignup = params.fromSignup === '1';
  const { applySession, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<Status>('starting');
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ token: string; url: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const done = useRef(false);

  const start = useCallback(async () => {
    setStatus('starting');
    setError(null);
    const res = await callFn<{ token: string; url: string; expires_at: string }>('telegram-token', { action: 'create', purpose });
    if (!res.data) {
      setStatus('error');
      setError(errorText(t, res.error));
      return;
    }
    setLink({ token: res.data.token, url: res.data.url, expiresAt: Date.parse(res.data.expires_at) });
    setStatus('pending');
    Linking.openURL(res.data.url).catch(() => {});
  }, [purpose, t]);

  useEffect(() => {
    start();
  }, [start]);

  const poll = useCallback(async () => {
    if (!link || done.current) return;
    const res = await callFn<{ status: string; session?: SessionTokens }>('telegram-token', { action: 'poll', token: link.token });
    if (done.current || !res.data) return;
    const s = res.data.status;
    if (s === 'expired' || s === 'used') return setStatus('expired');
    if (s !== 'confirmed') return;

    done.current = true;
    setStatus('confirmed');
    if (purpose === 'reset') return router.replace({ pathname: '/reset-password', params: { token: link.token } });
    if (purpose === 'link') {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['telegramLink'] });
      return finish();
    }
    const err = res.data.session ? await applySession(res.data.session) : 'server_error';
    if (err) {
      done.current = false;
      setStatus('error');
      setError(errorText(t, err));
      return;
    }
    router.replace('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, purpose]);

  // Poll every 2s while pending, and immediately when the user comes back from Telegram.
  useEffect(() => {
    if (status !== 'pending') return;
    const id = setInterval(() => {
      setNow(Date.now());
      poll();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && poll());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [status, poll]);

  const remaining = link ? Math.max(0, Math.round((link.expiresAt - now) / 1000)) : 0;
  useEffect(() => {
    if (status === 'pending' && link && remaining === 0) setStatus('expired');
  }, [remaining, status, link]);

  function finish() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const isReset = purpose === 'reset';
  const body = isReset ? t('telegram.bodyReset') : purpose === 'link' ? t('telegram.bodyLink') : t('telegram.body');
  const step2 = isReset ? t('telegram.step2Reset') : t('telegram.step2');
  const step3 = isReset ? t('telegram.step3Reset') : purpose === 'link' ? t('telegram.step3Link') : t('telegram.step3');
  const canReopen = status === 'pending' && link;

  return (
    <Screen fullScreen style={s.root}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('telegram.cancel')} onPress={finish} style={s.back}>
        <Icon name="back" size={20} />
      </Pressable>

      <View style={s.hero}>
        <View style={s.tile}><Icon name="telegram" color={colors.telegram} size={44} /></View>
        <Text style={[type.h1, { textAlign: 'center', marginTop: 28 }]}>{isReset ? t('telegram.titleReset') : t('telegram.title')}</Text>
        <Text style={[type.body, { color: colors.inkMuted, textAlign: 'center', marginTop: 12 }]}>
          {fromSignup ? `${t('telegram.signupDone')}\n\n${body}` : body}
        </Text>
      </View>

      <View style={{ marginTop: 32, gap: 12 }}>
        <Step n={1} label={t('telegram.step1')} state={link ? 'done' : 'todo'} />
        <Step n={2} label={step2} state={status === 'confirmed' ? 'done' : link ? 'active' : 'todo'} />
        <Step n={3} label={step3} state={status === 'confirmed' ? 'active' : 'todo'} />
      </View>

      <View style={s.status}>
        {status === 'pending' && <View style={s.dot} />}
        <Text style={type.small}>
          {status === 'starting' ? t('telegram.starting') : status === 'expired' ? t('telegram.expired') : status === 'pending' ? t('telegram.waiting', { time: mmss }) : ''}
        </Text>
      </View>
      <FormError message={error} />

      <View style={{ marginTop: 'auto', gap: 10 }}>
        <Button
          variant="telegram"
          label={canReopen ? t('telegram.reopen') : t('telegram.newLink')}
          loading={status === 'starting'}
          onPress={() => (canReopen ? Linking.openURL(link.url).catch(() => {}) : start())}
        />
        <Button
          variant="outline"
          label={fromSignup ? t('telegram.later') : purpose === 'link' ? t('telegram.cancel') : t('telegram.withPassword')}
          onPress={finish}
          style={{ height: 52 }}
        />
      </View>
    </Screen>
  );
}

function Step({ n, label, state }: { n: number; label: string; state: 'done' | 'active' | 'todo' }) {
  return (
    <View style={s.step}>
      <View
        style={[
          s.badge,
          state === 'done' && { backgroundColor: colors.primary, borderColor: colors.primary },
          state === 'active' && { borderColor: colors.telegram },
        ]}
      >
        {state === 'done' ? (
          <Icon name="check" color="#fff" size={16} />
        ) : (
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: state === 'active' ? colors.telegram : colors.inkMuted }}>{n}</Text>
        )}
      </View>
      <Text style={{ fontFamily: state === 'active' ? fonts.semibold : fonts.body, fontSize: 15, color: state === 'todo' ? colors.inkMuted : colors.ink, flex: 1 }}>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  back: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  hero: { marginTop: 40, alignItems: 'center' },
  tile: { width: 96, height: 96, borderRadius: 28, backgroundColor: colors.telegramSoft, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 16 },
  badge: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: 2, borderColor: '#C9C3B8', alignItems: 'center', justifyContent: 'center' },
  status: { marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.telegram },
});
