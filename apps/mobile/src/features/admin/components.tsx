import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components';
import { colors, fonts, radius, type } from '../../theme';

/** Small figure tile: big value, label under it. */
export function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'primary' }) {
  const dark = tone === 'primary';
  return (
    <View style={[s.kpi, dark && { backgroundColor: colors.primary }]}>
      <Text style={[s.kpiValue, dark && { color: '#fff' }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[type.small, dark && { color: colors.inkOnDarkMuted }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** ‹ label › stepper for a date period; › is disabled at the current period. */
export function PeriodNav({ label, onPrev, onNext, canNext }: { label: string; onPrev: () => void; onNext: () => void; canNext: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={s.nav}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('earnings.prev')} onPress={onPrev} style={s.navBtn}>
        <Icon name="back" size={18} />
      </Pressable>
      <Text style={[type.h2, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('earnings.next')}
        accessibilityState={{ disabled: !canNext }}
        disabled={!canNext}
        onPress={onNext}
        style={[s.navBtn, !canNext && { opacity: 0.35 }]}
      >
        <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={18} /></View>
      </Pressable>
    </View>
  );
}

/** Label + value line with a proportional bar under it. */
export function BarRow({ label, value, share }: { label: string; value: string; share: number }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.ink, flex: 1 }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{value}</Text>
      </View>
      <View style={s.track}>
        <View style={[s.bar, { width: `${Math.max(share > 0 ? 3 : 0, Math.min(1, share) * 100)}%` }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  kpi: { flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, gap: 2 },
  kpiValue: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
});
