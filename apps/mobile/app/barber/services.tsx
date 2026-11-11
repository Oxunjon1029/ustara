import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useQueryClient } from '@tanstack/react-query';
import { formatUzs } from '@ustara/shared';
import { Button, Card, Icon, Screen } from '../../src/components';
import { BottomSheet } from '../../src/components/BottomSheet';
import { FormError } from '../../src/components/fields';
import { showDialog } from '../../src/components/Dialog';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useMyServiceTerms } from '../../src/features/booking/api';
import { bookingErrorText } from '../../src/features/booking/components';
import { currentLocale } from '../../src/i18n';
import { supabase } from '../../src/lib/supabase';
import { colors, fonts, radius, type } from '../../src/theme';

const DURATIONS = Array.from({ length: 36 }, (_, i) => (i + 2) * 5); // 10 … 185 min
const digits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '');
const grouped = (v: string) => v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Barber sets their own duration and price for each service. */
export default function MyServices() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { state } = useAuth();
  const mine = useMyServiceTerms(state.status === 'signedIn' ? state.profile.user_id : '');
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, { duration: number; price: string }>>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the current terms once they load.
  useEffect(() => {
    if (mine.services && Object.keys(edits).length === 0) {
      setEdits(Object.fromEntries(mine.services.map((sv) => [sv.id, { duration: sv.duration, price: String(sv.price) }])));
    }
  }, [mine.services, edits]);

  const save = async () => {
    setError(null);
    const changed = (mine.services ?? []).filter((sv) => {
      const e = edits[sv.id];
      return e && (e.duration !== sv.duration || Number(e.price) !== sv.price);
    });
    for (const sv of changed) {
      const p = Number(edits[sv.id].price);
      if (!p || p < 1000 || p > 10_000_000) return setError(t('myServices.priceRange'));
    }
    setBusy(true);
    for (const sv of changed) {
      const { error: err } = await supabase.rpc('set_my_service', { p_service: sv.id, p_duration: edits[sv.id].duration, p_price: Number(edits[sv.id].price) });
      if (err) {
        setBusy(false);
        return setError(bookingErrorText(t, err.message));
      }
    }
    setBusy(false);
    queryClient.invalidateQueries({ queryKey: ['barberServices'] });
    queryClient.invalidateQueries({ queryKey: ['barberProfile'] });
    showDialog(t('barber.saved'));
    router.back();
  };

  return (
    <Screen fullScreen>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('telegram.cancel')} onPress={() => router.back()} style={s.iconBtn}>
            <Icon name="back" size={20} />
          </Pressable>
          <Text style={[type.h1, { fontSize: 22, flex: 1 }]}>{t('myServices.title')}</Text>
        </View>
        <Text style={type.small}>{t('myServices.hint')}</Text>

        {mine.services?.map((sv) => {
          const e = edits[sv.id];
          if (!e) return null;
          return (
            <Card key={sv.id} style={{ gap: 12 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{locale === 'ru' ? sv.name_ru : sv.name_uz}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={type.label}>{t('myServices.duration')}</Text>
                  <Pressable accessibilityRole="button" onPress={() => setPicking(sv.id)} style={s.input}>
                    <Text style={[type.body, { flex: 1 }]}>{t('client.minutes', { count: e.duration })}</Text>
                    <Icon name="clock" color={colors.inkMuted} size={18} />
                  </Pressable>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={type.label}>{t('myServices.price')}</Text>
                  <View style={s.input}>
                    <TextInput
                      accessibilityLabel={`${t('myServices.price')}: ${locale === 'ru' ? sv.name_ru : sv.name_uz}`}
                      value={grouped(e.price)}
                      onChangeText={(v) => setEdits((x) => ({ ...x, [sv.id]: { ...e, price: digits(v) } }))}
                      keyboardType="number-pad"
                      maxLength={10}
                      style={[type.body, { flex: 1, padding: 0 }]}
                    />
                    <Text style={type.small}>{t('myServices.som')}</Text>
                  </View>
                </View>
              </View>
              {Number(e.price) !== sv.price_uzs || e.duration !== sv.duration_min ? (
                <Text style={type.small}>
                  {t('myServices.shopDefault', { duration: sv.duration_min, price: formatUzs(sv.price_uzs, locale) })}
                </Text>
              ) : null}
            </Card>
          );
        })}

        <FormError message={error} />
        <Button label={t('barber.save')} onPress={save} loading={busy} disabled={!mine.barberId} />
      </KeyboardAwareScrollView>

      {picking && edits[picking] && (
        <BottomSheet onDismiss={() => setPicking(null)}>
          {(close) => (
            <>
              <Text style={[type.h2, { marginBottom: 12 }]}>{t('myServices.duration')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {DURATIONS.map((d) => {
                  const on = d === edits[picking].duration;
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        const id = picking;
                        close(() => { setEdits((x) => ({ ...x, [id]: { ...x[id], duration: d } })); setPicking(null); });
                      }}
                      style={{ width: '20%', height: 46, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <View style={[s.chip, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                        <Text style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 15, color: on ? '#fff' : colors.ink }}>{d}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[type.small, { marginTop: 8, textAlign: 'center' }]}>{t('myServices.minutesNote')}</Text>
            </>
          )}
        </BottomSheet>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  input: {
    height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  chip: { width: '88%', height: 38, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
});
