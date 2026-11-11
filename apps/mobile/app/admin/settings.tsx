import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Screen } from '../../src/components';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FormError } from '../../src/components/fields';
import { showDialog } from '../../src/components/Dialog';
import { useSettings } from '../../src/features/admin/api';
import { supabase } from '../../src/lib/supabase';
import { colors, fonts, radius, type } from '../../src/theme';

const WINDOWS = [30, 60, 120, 180, 360, 720, 1440];
const LIMITS = [1, 2, 3, 4, 5];

/** Shop rules: how late clients may reschedule, and after how many no-shows online booking closes. */
export default function AdminSettings() {
  const { t } = useTranslation();
  const q = useSettings();
  const queryClient = useQueryClient();
  const [win, setWin] = useState(120);
  const [limit, setLimit] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) { setWin(q.data.reschedule_window_minutes); setLimit(q.data.no_show_limit); }
  }, [q.data]);

  const save = async () => {
    setBusy(true);
    const { error: err } = await supabase.from('settings').update({ reschedule_window_minutes: win, no_show_limit: limit }).eq('id', true);
    setBusy(false);
    if (err) return setError(t('auth.errors.server_error'));
    queryClient.invalidateQueries({ queryKey: ['settings'] });
    showDialog(t('barber.saved'));
    router.back();
  };

  const label = (m: number) => (m < 60 ? t('barber.minShort', { count: m }) : t('admin.hours', { count: m / 60 }));
  const chips = (values: number[], value: number, onChange: (v: number) => void, fmt: (v: number) => string) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {values.map((v) => {
        const on = v === value;
        return (
          <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(v)}
            style={[s.chip, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            <Text style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 14, color: on ? '#fff' : colors.ink }}>{fmt(v)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Screen fullScreen>
      <ScreenHeader title={t('admin.settings')} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 14 }}>
        <Card style={{ gap: 10 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{t('admin.rescheduleWindow')}</Text>
          <Text style={type.small}>{t('admin.rescheduleWindowHint')}</Text>
          {chips(WINDOWS, win, setWin, label)}
        </Card>
        <Card style={{ gap: 10 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{t('admin.noShowLimit')}</Text>
          <Text style={type.small}>{t('admin.noShowLimitHint')}</Text>
          {chips(LIMITS, limit, setLimit, String)}
        </Card>
        <FormError message={error} />
        <Button label={t('barber.save')} onPress={save} loading={busy} disabled={!q.data} />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  chip: { minWidth: 56, height: 40, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
