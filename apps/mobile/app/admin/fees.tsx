import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useQueryClient } from '@tanstack/react-query';
import { formatUzs } from '@ustara/shared';
import { Button, Card, Screen } from '../../src/components';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FormError } from '../../src/components/fields';
import { showDialog } from '../../src/components/Dialog';
import { useFeeTiers } from '../../src/features/admin/api';
import { rpc } from '../../src/features/booking/api';
import { bookingErrorText } from '../../src/features/booking/components';
import { currentLocale } from '../../src/i18n';
import { colors, fonts, radius, type } from '../../src/theme';

const digits = (v: string) => v.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
const grouped = (v: string) => v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Tier n covers prices from (previous upper limit + 1) up to its own limit; the last tier has no limit. */
type Draft = { max: string; fee: string };

export default function AdminFees() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const q = useFeeTiers();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && !rows) {
      setRows(q.data.length ? q.data.map((r) => ({ max: r.max_price_uzs == null ? '' : String(r.max_price_uzs), fee: String(r.fee_uzs) })) : [{ max: '', fee: '0' }]);
    }
  }, [q.data, rows]);

  if (!rows) {
    return (
      <Screen fullScreen>
        <ScreenHeader title={t('admin.fees')} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      </Screen>
    );
  }

  const mins = rows.map((_, i) => (i === 0 ? 0 : Number(rows[i - 1].max) + 1));
  const set = (i: number, patch: Partial<Draft>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    for (let i = 0; i < rows.length; i++) {
      const last = i === rows.length - 1;
      if (!last && (!rows[i].max || Number(rows[i].max) < mins[i])) return setError(t('admin.tierLimits'));
      if (rows[i].fee === '') return setError(t('admin.tierFee'));
    }
    setError(null);
    setBusy(true);
    const payload = rows.map((r, i) => ({ min: mins[i], max: i === rows.length - 1 ? null : Number(r.max), fee: Number(r.fee) }));
    const err = await rpc('admin_save_fee_tiers', { p_tiers: payload });
    setBusy(false);
    if (err) return setError(bookingErrorText(t, err));
    queryClient.invalidateQueries({ queryKey: ['feeTiers'] });
    showDialog(t('barber.saved'), t('admin.feesSaved'));
    router.back();
  };

  return (
    <Screen fullScreen>
      <ScreenHeader title={t('admin.fees')} />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={type.small}>{t('admin.feesNote')}</Text>
        {rows.map((r, i) => {
          const last = i === rows.length - 1;
          return (
            <Card key={i} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>
                  {last
                    ? t('admin.tierFrom', { min: formatUzs(mins[i], locale) })
                    : t('admin.tierRange', { min: formatUzs(mins[i], locale, false) })}
                </Text>
                {rows.length > 1 && (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setRows(rows.filter((_, j) => j !== i))}>
                    <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.danger }}>{t('barber.delete')}</Text>
                  </Pressable>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {!last && (
                  <Money label={t('admin.tierUpTo')} value={r.max} onChange={(v) => set(i, { max: v })} />
                )}
                <Money label={t('admin.tierFeeLabel')} value={r.fee} onChange={(v) => set(i, { fee: v })} />
              </View>
            </Card>
          );
        })}
        <Button
          variant="outline"
          label={t('admin.addTier')}
          onPress={() => {
            // Split the open-ended tier: the current last one gets a limit, a new open tier follows.
            const lastMin = mins[rows.length - 1];
            const copy = rows.slice();
            copy[copy.length - 1] = { ...copy[copy.length - 1], max: String(lastMin + 50_000) };
            setRows([...copy, { max: '', fee: copy[copy.length - 1].fee }]);
          }}
        />
        <FormError message={error} />
        <Button label={t('barber.save')} onPress={save} loading={busy} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

function Money({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={type.label}>{label}</Text>
      <View style={s.input}>
        <TextInput
          accessibilityLabel={label}
          value={grouped(value)}
          onChangeText={(v) => onChange(digits(v))}
          keyboardType="number-pad"
          maxLength={11}
          style={[type.body, { flex: 1, padding: 0 }]}
        />
        <Text style={type.small}>{t('myServices.som')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  input: {
    height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
});
