import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { showDialog, type DialogButton } from '../../components/Dialog';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Icon } from '../../components';
import { currentLocale } from '../../i18n';
import { localTime } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import { colors, fonts, radius, type } from '../../theme';
import { bookingActions, type DayEntry } from './api';
import { bookingErrorText, StatusPill, statusTone } from './components';

/** Timeline of a barber's day: bookings with Completed / No-show actions, and time off. */
export function DayList({ entries }: { entries: DayEntry[] }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const queryClient = useQueryClient();
  const now = Date.now();
  const nextId = entries.find((e) => e.booking?.status === 'confirmed' && Date.parse(e.ends_at) > now)?.booking?.id;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['barberDay'] });
  const run = async (p: Promise<string | null>) => {
    const err = await p;
    if (err) showDialog(bookingErrorText(t, err) ?? '');
    refresh();
  };

  const bookingMenu = (e: DayEntry) => {
    const b = e.booking!;
    const buttons: DialogButton[] = [];
    if (b.client_phone) {
      buttons.push({ text: b.client_phone, icon: <Icon name="phone" color="#fff" size={18} />, onPress: () => Linking.openURL(`tel:${b.client_phone}`) });
    }
    if (b.status === 'confirmed' && Date.parse(b.starts_at) > now) {
      buttons.push({ text: t('booking.cancel'), style: 'destructive', onPress: () => run(bookingActions.cancel(b.id)) });
    }
    buttons.push({ text: t('booking.keep'), style: 'cancel' });
    showDialog(b.client_name ?? t('barber.walkin'), `${localTime(b.starts_at)} · ${locale === 'ru' ? b.service.name_ru : b.service.name_uz}`, buttons);
  };

  const offMenu = (e: DayEntry) =>
    showDialog(t(`barber.${e.off!.kind}`), `${localTime(e.starts_at)} – ${localTime(e.ends_at)}`, [
      { text: t('booking.keep'), style: 'cancel' },
      {
        text: t('barber.delete'),
        style: 'destructive',
        onPress: async () => {
          await supabase.from('time_off').delete().eq('id', e.off!.id);
          refresh();
        },
      },
    ]);

  if (entries.length === 0) return <Text style={[type.small, { paddingVertical: 8 }]}>{t('barber.noBookings')}</Text>;

  return (
    <View style={{ gap: 10 }}>
      {entries.map((e) => {
        if (e.kind === 'off') {
          const mins = Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60_000);
          return (
            <Pressable key={e.off!.id} onPress={() => offMenu(e)} style={[s.row, { backgroundColor: colors.disabled }]}>
              <Text style={s.time}>{localTime(e.starts_at)}</Text>
              <Text style={[type.small, { flex: 1 }]}>
                {e.off!.note || t(`barber.${e.off!.kind}`)} · {mins >= 600 ? `${localTime(e.starts_at)}–${localTime(e.ends_at)}` : t('barber.minutes', { count: mins })}
              </Text>
            </Pressable>
          );
        }
        const b = e.booking!;
        const isNext = b.id === nextId;
        const started = Date.parse(b.starts_at) <= now;
        const svc = locale === 'ru' ? b.service.name_ru : b.service.name_uz;
        const walkin = b.source === 'walkin';
        const paid = b.paid_method ? ` · ${t(b.paid_method === 'card' ? 'barber.paidCard' : 'barber.paidCash')}` : '';
        return (
          <Pressable
            key={b.id}
            onPress={() => bookingMenu(e)}
            style={[s.row, isNext && { backgroundColor: colors.ink }, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={[s.time, isNext && { color: colors.inkOnDark }]}>{localTime(b.starts_at)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: isNext ? colors.inkOnDark : colors.ink }}>
                  {b.client_name ?? t('barber.walkin')}{walkin ? ` · ${t('barber.walkinShort')}` : ''}
                </Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: isNext ? colors.inkOnDarkMuted : colors.inkMuted }}>
                  {svc} · {t('barber.minutes', { count: b.service.duration_min })}{paid}
                </Text>
              </View>
              {isNext ? (
                <Text style={[s.nextPill]}>{t('barber.next')}</Text>
              ) : b.status !== 'confirmed' ? (
                <StatusPill label={t(`booking.status.${b.status}`)} tone={statusTone(b.status)} />
              ) : null}
            </View>
            {b.status === 'confirmed' && started && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label={t('booking.status.completed')} onPress={() => run(bookingActions.outcome(b.id, 'completed'))} style={{ flex: 1, height: 44 }} />
                <Button
                  variant="outline"
                  label={t('booking.status.no_show')}
                  onPress={() =>
                    showDialog(t('barber.noShowConfirm'), b.client_name ?? '', [
                      { text: t('booking.keep'), style: 'cancel' },
                      { text: t('booking.status.no_show'), style: 'destructive', onPress: () => run(bookingActions.outcome(b.id, 'no_show')) },
                    ])
                  }
                  style={{ flex: 1, height: 44, backgroundColor: colors.surface }}
                />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14 },
  time: { width: 48, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  nextPill: {
    fontFamily: fonts.semibold, fontSize: 12, color: colors.ink, backgroundColor: colors.inkOnDark,
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden',
  },
});
