import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '../../src/components/Dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dateStrip, formatUzs, type Slot } from '@ustara/shared';
import { Avatar, Button, Card, Icon, Screen } from '../../src/components';
import { FormError } from '../../src/components/fields';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { bookingActions, fetchAvailability, useBarberServices, useMyBookings } from '../../src/features/booking/api';
import { bookingErrorText, DateStrip, SlotGrid } from '../../src/features/booking/components';
import { useBarbers, useServices, type Service } from '../../src/features/catalog/queries';
import { currentLocale } from '../../src/i18n';
import { localTime, longDate, monthYear } from '../../src/lib/dates';
import { colors, fonts, radius, type } from '../../src/theme';

const ANY = 'any';
type Step = 0 | 1 | 2 | 3;

/** Booking flow: service → barber → date & time → confirm. Also used to reschedule (?reschedule=<id>). */
export default function Book() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const params = useLocalSearchParams<{ reschedule?: string; service?: string; barber?: string }>();
  const { state } = useAuth();
  const profile = state.status === 'signedIn' ? state.profile : null;
  const queryClient = useQueryClient();

  const services = useServices();
  const barbers = useBarbers();
  const offers = useBarberServices();
  const myBookings = useMyBookings(params.reschedule ? profile?.user_id ?? '' : '');
  const original = myBookings.data?.find((b) => b.id === params.reschedule);
  const isReschedule = !!params.reschedule;

  const [step, setStep] = useState<Step>(isReschedule ? 2 : params.service ? (params.barber ? 2 : 1) : 0);
  const [serviceId, setServiceId] = useState<string | null>(params.service ?? null);
  const [barberId, setBarberId] = useState<string | null>(params.barber ?? null);
  const dates = useMemo(() => dateStrip(new Date(), 14), []);
  const [date, setDate] = useState(dates[0]);
  const [slot, setSlot] = useState<{ ms: number; barberId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sid = isReschedule ? original?.service_id ?? null : serviceId;
  const bid = isReschedule ? original?.barber_id ?? null : barberId;
  const service: Service | undefined = isReschedule ? original?.service : services.data?.find((s) => s.id === sid);

  const offering = useMemo(
    () => (barbers.data ?? []).filter((b) => offers.data?.some((o) => o.barber_id === b.id && o.service_id === sid)),
    [barbers.data, offers.data, sid],
  );
  const candidateIds = bid && bid !== ANY ? [bid] : offering.map((b) => b.id);

  const availability = useQuery({
    queryKey: ['availability', candidateIds.join(','), sid, date, params.reschedule ?? ''],
    enabled: step >= 2 && !!service && candidateIds.length > 0,
    queryFn: () => fetchAvailability({ barberIds: candidateIds, service: service!, date, ignoreBookingId: params.reschedule }),
  });

  // "Any barber": one grid of times, each mapped to the first barber free then.
  const grid = useMemo(() => {
    const byTime = new Map<number, { slot: Slot; barberId: string | null }>();
    for (const { barberId: b, slots } of availability.data ?? []) {
      for (const s of slots) {
        const ms = s.starts_at.getTime();
        const cur = byTime.get(ms);
        if (!cur) byTime.set(ms, { slot: s, barberId: s.available ? b : null });
        else if (!cur.barberId && s.available) byTime.set(ms, { slot: s, barberId: b });
      }
    }
    return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => ({ ...v.slot, available: !!v.barberId, barberId: v.barberId }));
  }, [availability.data]);

  const chosenBarber = barbers.data?.find((b) => b.id === (slot?.barberId ?? bid));
  const name = (s?: Service) => (s ? (locale === 'ru' ? s.name_ru : s.name_uz) : '');

  const back = () => {
    setError(null);
    if (step === 0 || (isReschedule && step === 2)) return router.back();
    if (step === 2 && params.barber) return params.service ? router.back() : setStep(0); // barber chosen on their profile
    setStep((s) => (s - 1) as Step);
  };

  const submit = async () => {
    if (!slot || !sid) return;
    setBusy(true);
    setError(null);
    const at = new Date(slot.ms);
    const err = isReschedule ? await bookingActions.reschedule(params.reschedule!, at) : await bookingActions.create(slot.barberId, sid, at);
    setBusy(false);
    if (err) {
      setError(bookingErrorText(t, err));
      if (err === 'slot_taken') {
        setSlot(null);
        setStep(2);
        availability.refetch();
      }
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['myBookings'] });
    queryClient.invalidateQueries({ queryKey: ['nextBooking'] });
    showDialog(isReschedule ? t('booking.rescheduled') : t('booking.booked'));
    router.replace('/client/bookings');
  };

  const askToVerify = () =>
    showDialog(t('booking.verifyFirst'), undefined, [
      { text: t('telegram.later'), style: 'cancel' },
      { text: t('booking.verifyNow'), onPress: () => router.push({ pathname: '/telegram-wait', params: { purpose: 'link' } }) },
    ]);

  const title = isReschedule
    ? t('booking.rescheduleTitle')
    : [t('booking.stepService'), t('booking.stepBarber'), t('booking.stepTime'), t('booking.stepConfirm')][step];

  return (
    <Screen fullScreen>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('telegram.cancel')} onPress={back} style={s.iconBtn}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={[type.h1, { fontSize: 22 }]}>{title}</Text>
      </View>
      {!isReschedule && (
        <View style={s.progress}>
          {[0, 1, 2, 3].map((i) => <View key={i} style={[s.bar, i <= step && { backgroundColor: colors.primary }]} />)}
        </View>
      )}

      <ScrollView contentContainerStyle={s.body}>
        {step === 0 && (
          <View style={s.list}>
            {services.data?.map((sv, i, arr) => (
              <Pressable
                key={sv.id}
                accessibilityRole="button"
                onPress={() => { setServiceId(sv.id); setSlot(null); setStep(params.barber ? 2 : 1); }}
                style={[s.row, i < arr.length - 1 && s.divider]}
              >
                <View>
                  <Text style={s.rowTitle}>{name(sv)}</Text>
                  <Text style={type.small}>{t('client.minutes', { count: sv.duration_min })}</Text>
                </View>
                <Text style={s.rowTitle}>{formatUzs(sv.price_uzs, locale)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {step === 1 && (
          <View style={{ gap: 10 }}>
            <BarberRow label={t('booking.anyBarber')} sub={t('booking.anyBarberHint')} onPress={() => { setBarberId(ANY); setSlot(null); setStep(2); }} />
            {offering.map((b) => (
              <BarberRow
                key={b.id}
                label={b.full_name}
                sub={`★ ${b.rating_avg.toFixed(1)}`}
                onPress={() => { setBarberId(b.id); setSlot(null); setStep(2); }}
                onInfo={() => router.push({ pathname: '/client/barber/[id]', params: { id: b.id } })}
                infoLabel={t('barberProfile.title')}
              />
            ))}
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: 18 }}>
            {service && (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <Avatar name={chosenBarber?.full_name ?? '?'} size={40} />
                <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.ink }}>
                  <Text style={{ fontFamily: fonts.semibold }}>{name(service)}</Text>
                  {bid && bid !== ANY ? ` · ${chosenBarber?.full_name ?? ''}` : ''}
                  {'\n'}
                  <Text style={{ color: colors.inkMuted }}>{t('client.minutes', { count: service.duration_min })} · {formatUzs(service.price_uzs, locale)}</Text>
                </Text>
                {!isReschedule && (
                  <Pressable onPress={() => setStep(0)} style={{ paddingVertical: 8 }}>
                    <Text style={s.link}>{t('booking.change')}</Text>
                  </Pressable>
                )}
              </Card>
            )}
            <View style={{ gap: 10 }}>
              <Text style={s.section}>{monthYear(date, locale)}</Text>
              <DateStrip dates={dates} value={date} onChange={(d) => { setDate(d); setSlot(null); }} locale={locale} />
            </View>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={s.section}>{t('booking.freeSlots')}</Text>
                <Text style={type.small}>{t('booking.tashkentTime')}</Text>
              </View>
              {availability.isLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
              ) : grid.some((g) => g.available) ? (
                <SlotGrid
                  slots={grid}
                  value={slot?.ms ?? null}
                  onChange={(sl) => {
                    const g = grid.find((x) => x.starts_at.getTime() === sl.starts_at.getTime());
                    if (g?.barberId) setSlot({ ms: sl.starts_at.getTime(), barberId: g.barberId });
                  }}
                />
              ) : (
                <Text style={type.small}>{t('booking.noSlots')}</Text>
              )}
            </View>
            <FormError message={error} />
          </View>
        )}

        {step === 3 && service && slot && (
          <View style={{ gap: 16 }}>
            <Card style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Avatar name={chosenBarber?.full_name ?? '?'} size={48} />
                <View>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{name(service)}</Text>
                  <Text style={type.small}>{t('booking.barber')}: {chosenBarber?.full_name}</Text>
                </View>
              </View>
              <View style={s.hr} />
              <Line label={t('booking.date')} value={longDate(date, locale)} />
              <Line label={t('booking.time')} value={`${localTime(new Date(slot.ms))} – ${localTime(new Date(slot.ms + service.duration_min * 60_000))}`} />
              <Line label={t('booking.price')} value={formatUzs(service.price_uzs, locale)} />
              <View style={s.hr} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{t('booking.total')}</Text>
                <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.ink }}>{formatUzs(service.price_uzs, locale)}</Text>
              </View>
              <Text style={type.small}>{t('booking.noExtra')} {t('booking.payAtShop')}</Text>
            </Card>
            {profile && !profile.phone_verified && (
              <Card style={{ gap: 10, backgroundColor: colors.warnSoft }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.warnInk }}>{t('booking.verifyFirst')}</Text>
                <Button
                  variant="telegram"
                  label={t('booking.verifyNow')}
                  onPress={() => router.push({ pathname: '/telegram-wait', params: { purpose: 'link' } })}
                  style={{ height: 48 }}
                />
              </Card>
            )}
            <FormError message={error} />
          </View>
        )}
      </ScrollView>

      {step >= 2 && (
        <View style={s.footer}>
          <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkMuted }}>
            {longDate(date, locale)}
            {'\n'}
            <Text style={{ fontFamily: fonts.semibold, color: colors.ink }}>
              {slot && service ? `${localTime(new Date(slot.ms))} – ${localTime(new Date(slot.ms + service.duration_min * 60_000))}` : '—'}
            </Text>
          </Text>
          {/* Never silently disabled: an incomplete step explains itself on tap. */}
          {step === 2 ? (
            <Button
              label={t('booking.continue')}
              onPress={() => {
                if (!slot) return setError(t('booking.pickTime'));
                setError(null);
                setStep(3);
              }}
              style={{ height: 52, opacity: slot ? 1 : 0.6 }}
            />
          ) : (
            <Button
              label={isReschedule ? t('booking.rescheduleConfirm') : t('booking.confirm')}
              loading={busy}
              onPress={() => (profile?.phone_verified ? submit() : askToVerify())}
              style={{ height: 52, opacity: profile?.phone_verified ? 1 : 0.6 }}
            />
          )}
        </View>
      )}
    </Screen>
  );
}

function BarberRow({ label, sub, onPress, onInfo, infoLabel }: { label: string; sub: string; onPress: () => void; onInfo?: () => void; infoLabel?: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.barber}>
      <Avatar name={label} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{label}</Text>
        <Text style={type.small}>{sub}</Text>
      </View>
      {onInfo && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${infoLabel}: ${label}`} onPress={onInfo} hitSlop={6} style={s.infoBtn}>
          <Icon name="user" size={18} color={colors.primary} />
        </Pressable>
      )}
      <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={18} color={colors.inkMuted} /></View>
    </Pressable>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.inkMuted }}>{label}</Text>
      <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.ink }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  infoBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginTop: 16 },
  bar: { flex: 1, height: 4, borderRadius: 4, backgroundColor: '#DCD7CD' },
  body: { padding: 20, gap: 16, paddingBottom: 32 },
  list: { backgroundColor: colors.surface, borderRadius: radius.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, minHeight: 64 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  barber: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 14 },
  section: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  link: { color: colors.primary, fontFamily: fonts.medium, fontSize: 14 },
  hr: { height: 1, backgroundColor: colors.divider },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.chrome, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
  },
});
