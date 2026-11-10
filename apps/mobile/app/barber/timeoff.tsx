import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useQueryClient } from '@tanstack/react-query';
import { tashkentToUtc } from '@ustara/shared';
import { Button, Icon, Screen } from '../../src/components';
import { Field, FormError } from '../../src/components/fields';
import { DateField } from '../../src/components/DateField';
import { TimeField } from '../../src/components/TimeField';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useMyBarberId } from '../../src/features/booking/api';
import { Segmented } from '../../src/features/booking/components';
import { todayLocal } from '../../src/lib/dates';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, type } from '../../src/theme';

type Kind = 'break' | 'day_off' | 'vacation';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Add a break, a day off, or a vacation. */
export default function TimeOff() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ date?: string }>();
  const { state } = useAuth();
  const barberId = useMyBarberId(state.status === 'signedIn' ? state.profile.user_id : '');
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>('break');
  const [date, setDate] = useState(params.date ?? todayLocal());
  const [endDate, setEndDate] = useState(params.date ?? todayLocal());
  const [from, setFrom] = useState('13:00');
  const [to, setTo] = useState('13:45');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!DATE.test(date) || (kind === 'vacation' && !DATE.test(endDate))) return setError(t('barber.date'));
    let startsAt: Date, endsAt: Date;
    if (kind === 'break') {
      if (!HHMM.test(from) || !HHMM.test(to)) return setError(t('barber.timeFormat'));
      startsAt = tashkentToUtc(date, from);
      endsAt = tashkentToUtc(date, to);
    } else {
      startsAt = tashkentToUtc(date, '00:00');
      endsAt = new Date(tashkentToUtc(kind === 'vacation' ? endDate : date, '00:00').getTime() + 24 * 3600_000);
    }
    if (endsAt <= startsAt) return setError(t('barber.endAfterStart'));
    if (!barberId.data) return;
    setBusy(true);
    const { error: err } = await supabase.from('time_off').insert({
      barber_id: barberId.data, kind, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), note: note.trim() || null,
    });
    setBusy(false);
    if (err) return setError(t('auth.errors.server_error'));
    queryClient.invalidateQueries({ queryKey: ['barberDay'] });
    router.back();
  };

  return (
    <Screen fullScreen>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('telegram.cancel')}
            onPress={() => router.back()}
            style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="back" size={20} />
          </Pressable>
          <Text style={[type.h1, { fontSize: 22 }]}>{t('barber.addTimeOff')}</Text>
        </View>

        <Segmented
          options={[
            { value: 'break', label: t('barber.break') },
            { value: 'day_off', label: t('barber.day_off') },
            { value: 'vacation', label: t('barber.vacation') },
          ]}
          value={kind}
          onChange={setKind}
        />
        <DateField
          label={kind === 'vacation' ? t('barber.from') : t('barber.date')}
          value={date}
          min={todayLocal()}
          onChange={(d) => { setDate(d); if (endDate < d) setEndDate(d); }}
        />
        {kind === 'vacation' && <DateField label={t('barber.to')} value={endDate} min={date} onChange={setEndDate} />}
        {kind === 'break' && (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><TimeField label={t('barber.from')} value={from} onChange={setFrom} /></View>
            <View style={{ flex: 1 }}><TimeField label={t('barber.to')} value={to} onChange={setTo} /></View>
          </View>
        )}
        <Field id="to-note" label={t('barber.note')} value={note} onChangeText={setNote} />
        <FormError message={error} />
        <Button label={t('barber.save')} onPress={submit} loading={busy} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
