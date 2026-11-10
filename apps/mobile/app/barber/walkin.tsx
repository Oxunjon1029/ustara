import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useQueryClient } from '@tanstack/react-query';
import { formatUzs, phoneSchema, tashkentToUtc } from '@ustara/shared';
import { Button, Icon, Screen } from '../../src/components';
import { Field, FormError } from '../../src/components/fields';
import { TimeField } from '../../src/components/TimeField';
import { bookingActions } from '../../src/features/booking/api';
import { bookingErrorText, Segmented } from '../../src/features/booking/components';
import { useServices } from '../../src/features/catalog/queries';
import { currentLocale } from '../../src/i18n';
import { localTime, todayLocal } from '../../src/lib/dates';
import { colors, fonts, radius, type } from '../../src/theme';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Add a walk-in client (design screen 8). */
export default function Walkin() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const services = useServices();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [start, setStart] = useState(() => localTime(new Date(Math.floor(Date.now() / 300_000) * 300_000)));
  const [paid, setPaid] = useState<'cash' | 'card'>('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const sid = serviceId ?? services.data?.[0]?.id;
    if (!sid) return;
    if (!HHMM.test(start)) return setError(t('barber.timeFormat'));
    const p = phone.trim() && phone.trim() !== '+998' ? phoneSchema.safeParse(phone) : null;
    if (p && !p.success) return setError(t('auth.errors.invalid_phone'));
    setBusy(true);
    const err = await bookingActions.walkin(sid, tashkentToUtc(todayLocal(), start), name, p?.success ? p.data : null, paid);
    setBusy(false);
    if (err) return setError(bookingErrorText(t, err));
    queryClient.invalidateQueries({ queryKey: ['barberDay'] });
    router.back();
  };

  const selected = serviceId ?? services.data?.[0]?.id;

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
          <Text style={[type.h1, { fontSize: 22 }]}>{t('barber.walkin')}</Text>
        </View>

        <Field id="wi-name" label={t('barber.clientName')} value={name} onChangeText={setName} autoCapitalize="words" />
        <Field id="wi-phone" label={t('barber.phoneOptional')} hint={t('barber.phoneHint')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+998" />

        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          <Text style={type.label}>{t('booking.service')}</Text>
          {services.data?.map((sv) => {
            const on = sv.id === selected;
            return (
              <Pressable
                key={sv.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setServiceId(sv.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, borderRadius: radius.lg,
                  backgroundColor: colors.surface, borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.border,
                }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                </View>
                <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{locale === 'ru' ? sv.name_ru : sv.name_uz}</Text>
                <Text style={type.small}>{t('barber.minShort', { count: sv.duration_min })} · {formatUzs(sv.price_uzs, locale, false)}</Text>
              </Pressable>
            );
          })}
        </View>

        <TimeField label={t('barber.start')} value={start} onChange={setStart} />

        <View style={{ gap: 8 }}>
          <Text style={type.label}>{t('barber.payment')}</Text>
          <Segmented options={[{ value: 'cash', label: t('barber.cash') }, { value: 'card', label: t('barber.card') }]} value={paid} onChange={setPaid} />
        </View>

        <FormError message={error} />
        <Button label={t('barber.add')} onPress={submit} loading={busy} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
