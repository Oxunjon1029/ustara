import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Screen } from '../../src/components';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Field, FormError } from '../../src/components/fields';
import { showDialog } from '../../src/components/Dialog';
import { useAdminServices } from '../../src/features/admin/api';
import { Segmented } from '../../src/features/booking/components';
import { supabase } from '../../src/lib/supabase';
import { colors, fonts, radius, type } from '../../src/theme';

const DURATIONS = [15, 20, 30, 40, 45, 60, 75, 90, 120];
const BUFFERS = [0, 5, 10, 15];
const digits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '');
const grouped = (v: string) => v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Create (no id) or edit a service. Services are hidden rather than deleted, so history stays intact. */
export default function AdminService() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const q = useAdminServices();
  const existing = id ? q.data?.find((x) => x.id === id) : undefined;
  const queryClient = useQueryClient();
  const [nameUz, setNameUz] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [duration, setDuration] = useState(45);
  const [buffer, setBuffer] = useState(0);
  const [price, setPrice] = useState('');
  const [active, setActive] = useState<'on' | 'off'>('on');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setNameUz(existing.name_uz);
    setNameRu(existing.name_ru);
    setDuration(existing.duration_min);
    setBuffer(existing.buffer_min);
    setPrice(String(existing.price_uzs));
    setActive(existing.is_active ? 'on' : 'off');
  }, [existing]);

  const save = async () => {
    const p = Number(price);
    if (nameUz.trim().length < 2 || nameRu.trim().length < 2) return setError(t('admin.namesRequired'));
    if (!p || p < 1000 || p > 10_000_000) return setError(t('myServices.priceRange'));
    setError(null);
    setBusy(true);
    const row = {
      name_uz: nameUz.trim(), name_ru: nameRu.trim(), duration_min: duration, buffer_min: buffer, price_uzs: p, is_active: active === 'on',
    };
    const { error: err } = existing
      ? await supabase.from('services').update(row).eq('id', existing.id)
      : await supabase.from('services').insert({ ...row, sort: (q.data?.length ?? 0) + 1 });
    setBusy(false);
    if (err) return setError(t('auth.errors.server_error'));
    for (const key of ['adminServices', 'services', 'barberServices', 'barberProfile']) queryClient.invalidateQueries({ queryKey: [key] });
    showDialog(t('barber.saved'));
    router.back();
  };

  const chips = (values: number[], value: number, onChange: (v: number) => void, label: (v: number) => string) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {values.map((v) => {
        const on = v === value;
        return (
          <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(v)}
            style={[s.chip, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            <Text style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 14, color: on ? '#fff' : colors.ink }}>{label(v)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Screen fullScreen>
      <ScreenHeader title={existing ? t('admin.editService') : t('admin.addService')} />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Field id="nameUz" label={t('admin.nameUz')} value={nameUz} onChangeText={setNameUz} maxLength={40} />
        <Field id="nameRu" label={t('admin.nameRu')} value={nameRu} onChangeText={setNameRu} maxLength={40} />
        <Field
          id="price"
          label={`${t('myServices.price')} (${t('myServices.som')})`}
          value={grouped(price)}
          onChangeText={(v) => setPrice(digits(v))}
          keyboardType="number-pad"
          maxLength={10}
        />
        <View style={{ gap: 8 }}>
          <Text style={type.label}>{t('myServices.duration')}</Text>
          {chips(DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b), duration, setDuration, (v) => t('barber.minShort', { count: v }))}
        </View>
        <View style={{ gap: 8 }}>
          <Text style={type.label}>{t('admin.buffer')}</Text>
          {chips(BUFFERS, buffer, setBuffer, (v) => t('barber.minShort', { count: v }))}
          <Text style={type.small}>{t('admin.bufferHint')}</Text>
        </View>
        {existing && (
          <Segmented
            options={[{ value: 'on', label: t('admin.visible') }, { value: 'off', label: t('admin.hidden') }]}
            value={active}
            onChange={setActive}
          />
        )}
        <FormError message={error} />
        <Button label={t('barber.save')} onPress={save} loading={busy} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  chip: { minWidth: 64, height: 40, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
