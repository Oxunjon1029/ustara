import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Icon } from '.';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

/** Time ('HH:MM') field that opens an hour/minute picker in a bottom sheet. `compact` = small box without label. */
export function TimeField({ label, value, onChange, compact, style }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const button = (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={() => setOpen(true)} style={[compact ? s.box : s.input, style]}>
      <Text style={compact ? s.boxText : [type.body, { flex: 1 }]}>{value}</Text>
      {!compact && <Icon name="clock" color={colors.inkMuted} size={20} />}
    </Pressable>
  );
  return (
    <>
      {compact ? button : (
        <View style={{ gap: 6 }}>
          <Text style={type.label}>{label}</Text>
          {button}
        </View>
      )}
      {open && <Picker title={label} value={value} onPick={onChange} onDismiss={() => setOpen(false)} />}
    </>
  );
}

function Picker({ title, value, onPick, onDismiss }: { title: string; value: string; onPick: (v: string) => void; onDismiss: () => void }) {
  const { t } = useTranslation();
  const [h0, m0] = value.split(':');
  const [h, setH] = useState(HOURS.includes(h0) ? h0 : '09');
  // Snap odd minutes to the nearest 5 so something is always selected.
  const [m, setM] = useState(String(Math.min(55, Math.round(Number(m0 || 0) / 5) * 5)).padStart(2, '0'));

  const grid = (items: string[], selected: string, set: (v: string) => void, label: string) => (
    <View style={s.grid} accessibilityLabel={label}>
      {items.map((v) => {
        const active = v === selected;
        return (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => set(v)}
            style={s.cell}
          >
            <View style={[s.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 15, color: active ? '#fff' : colors.ink }}>{v}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <BottomSheet onDismiss={onDismiss}>
      {(close) => (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={type.h2}>{title}</Text>
            <Text style={[type.h1, { color: colors.primary }]}>{h}:{m}</Text>
          </View>
          <Text style={[type.small, s.section]}>{t('common.hour')}</Text>
          {grid(HOURS, h, setH, t('common.hour'))}
          <Text style={[type.small, s.section]}>{t('common.minute')}</Text>
          {grid(MINUTES, m, setM, t('common.minute'))}
          <Pressable
            accessibilityRole="button"
            onPress={() => close(() => { onPick(`${h}:${m}`); onDismiss(); })}
            style={({ pressed }) => [s.done, pressed && { opacity: 0.85 }]}
          >
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: '#fff' }}>{t('common.done')}</Text>
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
  box: {
    width: 58, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  boxText: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
  section: { marginTop: 14, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 6}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  chip: { width: '86%', height: 38, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  done: { height: 52, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
});
