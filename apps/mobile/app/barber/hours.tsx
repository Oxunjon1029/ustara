import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { showDialog } from '../../src/components/Dialog';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Icon, Screen } from '../../src/components';
import { FormError } from '../../src/components/fields';
import { TimeField } from '../../src/components/TimeField';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useMyBarberId } from '../../src/features/booking/api';
import { currentLocale } from '../../src/i18n';
import { weekdayName } from '../../src/lib/dates';
import { supabase } from '../../src/lib/supabase';
import { colors, fonts, radius, type } from '../../src/theme';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first
type Day = { open: boolean; start: string; end: string };

/** Weekly working hours (one block per day). */
export default function Hours() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { state } = useAuth();
  const barberId = useMyBarberId(state.status === 'signedIn' ? state.profile.user_id : '');
  const queryClient = useQueryClient();
  const [days, setDays] = useState<Record<number, Day>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = useQuery({
    queryKey: ['hours', barberId.data],
    enabled: !!barberId.data,
    queryFn: async () => {
      const { data } = await supabase.from('working_hours').select('weekday, start_local, end_local').eq('barber_id', barberId.data!);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!current.data) return;
    const next: Record<number, Day> = {};
    for (const d of WEEK) {
      const row = current.data.find((r) => r.weekday === d);
      next[d] = row ? { open: true, start: row.start_local.slice(0, 5), end: row.end_local.slice(0, 5) } : { open: false, start: '10:00', end: '19:00' };
    }
    setDays(next);
  }, [current.data]);

  const update = (d: number, patch: Partial<Day>) => setDays((all) => ({ ...all, [d]: { ...all[d], ...patch } }));

  const save = async () => {
    setError(null);
    const open = WEEK.filter((d) => days[d]?.open);
    for (const d of open) {
      if (!HHMM.test(days[d].start) || !HHMM.test(days[d].end)) return setError(`${weekdayName(d, locale)}: ${t('barber.timeFormat')}`);
      if (days[d].end <= days[d].start) return setError(`${weekdayName(d, locale)}: ${t('barber.endAfterStart')}`);
    }
    setBusy(true);
    const del = await supabase.from('working_hours').delete().eq('barber_id', barberId.data!);
    const ins = del.error
      ? del
      : await supabase.from('working_hours').insert(open.map((d) => ({ barber_id: barberId.data!, weekday: d, start_local: days[d].start, end_local: days[d].end })));
    setBusy(false);
    if (ins.error) return setError(t('auth.errors.server_error'));
    queryClient.invalidateQueries({ queryKey: ['hours'] });
    showDialog(t('barber.saved'));
    router.back();
  };

  return (
    <Screen fullScreen>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('telegram.cancel')}
            onPress={() => router.back()}
            style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="back" size={20} />
          </Pressable>
          <Text style={[type.h1, { fontSize: 22 }]}>{t('barber.hoursTitle')}</Text>
        </View>

        {WEEK.map((d) => {
          const day = days[d];
          if (!day) return null;
          return (
            <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 10, minHeight: 64 }}>
              <Switch
                accessibilityLabel={weekdayName(d, locale)}
                value={day.open}
                onValueChange={(open) => update(d, { open })}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#fff"
              />
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{weekdayName(d, locale)}</Text>
              {day.open ? (
                <>
                  <TimeField compact label={`${weekdayName(d, locale)} ${t('barber.from')}`} value={day.start} onChange={(start) => update(d, { start })} />
                  <Text style={type.small}>–</Text>
                  <TimeField compact label={`${weekdayName(d, locale)} ${t('barber.to')}`} value={day.end} onChange={(end) => update(d, { end })} />
                </>
              ) : (
                <Text style={type.small}>{t('barber.closed')}</Text>
              )}
            </View>
          );
        })}
        <FormError message={error} />
        <Button label={t('barber.save')} onPress={save} loading={busy} disabled={!barberId.data} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

