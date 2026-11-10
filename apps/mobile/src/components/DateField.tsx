import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, type } from '../theme';
import { currentLocale } from '../i18n';
import { longDate, monthYear, weekdayShort } from '../lib/dates';
import { BottomSheet } from './BottomSheet';
import { Icon } from '.';

// Dates are 'YYYY-MM-DD' strings in Tashkent time; arithmetic is done in UTC so the device zone never matters.
const toStr = (d: Date) => d.toISOString().slice(0, 10);
const fromStr = (s: string) => new Date(`${s}T00:00:00Z`);
const MONDAY = '2026-11-09'; // any Monday, for the weekday header

/** Labelled field that opens a month calendar in a bottom sheet. */
export function DateField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (d: string) => void; min?: string; max?: string }) {
  const locale = currentLocale();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${longDate(value, locale)}`} onPress={() => setOpen(true)} style={s.input}>
        <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{longDate(value, locale)}</Text>
        <Icon name="calendar" color={colors.inkMuted} size={20} />
      </Pressable>
      {open && <Calendar value={value} min={min} max={max} onPick={onChange} onDismiss={() => setOpen(false)} />}
    </View>
  );
}

function Calendar({ value, min, max, onPick, onDismiss }: { value: string; min?: string; max?: string; onPick: (d: string) => void; onDismiss: () => void }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const [month, setMonth] = useState(value.slice(0, 7) + '-01');

  const first = fromStr(month);
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first offset
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);

  const shift = (n: number) => setMonth(toStr(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1))));
  const canPrev = !min || month > min.slice(0, 7) + '-01';
  const canNext = !max || month < max.slice(0, 7) + '-01';
  const header = Array.from({ length: 7 }, (_, i) => weekdayShort(toStr(new Date(fromStr(MONDAY).getTime() + i * 86_400_000)), locale));

  return (
    <BottomSheet onDismiss={onDismiss}>
      {(close) => (
        <>
          <View style={s.monthRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="‹" disabled={!canPrev} onPress={() => shift(-1)} style={[s.nav, !canPrev && { opacity: 0.3 }]}>
              <Icon name="back" size={20} />
            </Pressable>
            <Text style={type.h2}>{monthYear(month, locale)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="›" disabled={!canNext} onPress={() => shift(1)} style={[s.nav, !canNext && { opacity: 0.3 }]}>
              <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={20} /></View>
            </Pressable>
          </View>
          <View style={s.grid}>
            {header.map((h) => (
              <Text key={h} style={[s.cell, s.head]}>{h}</Text>
            ))}
            {cells.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={s.cell} />;
              const off = (!!min && d < min) || (!!max && d > max);
              const active = d === value;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: off }}
                  accessibilityLabel={longDate(d, locale)}
                  disabled={off}
                  onPress={() => close(() => { onPick(d); onDismiss(); })}
                  style={s.cell}
                >
                  <View style={[s.day, active && { backgroundColor: colors.primary }]}>
                    <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 15, color: active ? '#fff' : off ? colors.border : colors.ink }}>
                      {Number(d.slice(8))}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Pressable accessibilityRole="button" onPress={() => close()} style={s.cancel}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{t('booking.keep')}</Text>
          </Pressable>
        </>
      )}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  input: {
    height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  nav: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.segment, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' },
  head: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted, textAlign: 'center', textAlignVertical: 'center' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cancel: { height: 52, borderRadius: radius.lg, backgroundColor: colors.segment, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
});
