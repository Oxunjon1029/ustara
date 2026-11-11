import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { TFunction } from 'i18next';
import type { Locale, Slot } from '@ustara/shared';
import { localTime, weekdayShort } from '../../lib/dates';
import { colors, fonts, radius } from '../../theme';

export function bookingErrorText(t: TFunction, code: string | null): string | null {
  if (!code) return null;
  const key = `booking.errors.${code}`;
  const msg = t(key);
  if (msg !== key) return msg;
  const auth = t(`auth.errors.${code}`);
  return auth === `auth.errors.${code}` ? t('auth.errors.server_error') : auth;
}

/** Horizontal strip of dates (design: ClientSlots). */
export function DateStrip({ dates, value, onChange, locale, disabled, marked }: {
  dates: string[];
  value: string;
  onChange: (d: string) => void;
  locale: Locale;
  disabled?: (d: string) => boolean;
  /** Shows a dot under the day (e.g. it has bookings). */
  marked?: (d: string) => boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {dates.map((d) => {
        const active = d === value;
        const off = disabled?.(d) ?? false;
        return (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: off }}
            onPress={() => onChange(d)}
            style={[s.day, active && { backgroundColor: colors.ink }, off && !active && { backgroundColor: colors.disabled }]}
          >
            <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: active ? '#fff' : off ? colors.disabledInk : colors.inkMuted }}>
              {weekdayShort(d, locale)}
            </Text>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: active ? '#fff' : off ? colors.disabledInk : colors.ink }}>
              {Number(d.slice(8))}
            </Text>
            {marked && <View style={[s.mark, { backgroundColor: marked(d) ? (active ? '#fff' : colors.primary) : 'transparent' }]} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** 4-column grid of times; taken slots are struck through (design: ClientSlots). */
export function SlotGrid({ slots, value, onChange }: { slots: Slot[]; value: number | null; onChange: (s: Slot) => void }) {
  return (
    <View style={s.grid}>
      {slots.map((slot) => {
        const ms = slot.starts_at.getTime();
        const active = ms === value;
        return (
          <Pressable
            key={ms}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !slot.available }}
            disabled={!slot.available}
            onPress={() => onChange(slot)}
            style={[
              s.slot,
              !slot.available && { backgroundColor: colors.disabled, borderColor: colors.disabled },
              active && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text
              style={{
                fontFamily: active ? fonts.semibold : fonts.medium,
                fontSize: 14,
                color: active ? '#fff' : slot.available ? colors.ink : colors.disabledInk,
                textDecorationLine: slot.available ? 'none' : 'line-through',
              }}
            >
              {localTime(slot.starts_at)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[s.segItem, active && { backgroundColor: colors.surface }]}
          >
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 14, color: active ? colors.ink : colors.inkMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: 'ok' | 'muted' | 'bad' }) {
  const bg = tone === 'ok' ? colors.primarySoft : tone === 'bad' ? '#FBEAE7' : colors.segment;
  const fg = tone === 'ok' ? colors.primaryDark : tone === 'bad' ? colors.danger : colors.inkMuted;
  return <Text style={[s.pill, { backgroundColor: bg, color: fg }]}>{label}</Text>;
}

export const statusTone = (status: string): 'ok' | 'muted' | 'bad' =>
  status === 'confirmed' || status === 'completed' ? 'ok' : status === 'no_show' ? 'bad' : 'muted';

const s = StyleSheet.create({
  day: { width: 52, height: 64, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 2 },
  mark: { width: 5, height: 5, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    width: '22.9%', height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  segment: { flexDirection: 'row', backgroundColor: colors.segment, borderRadius: radius.md, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 40, paddingHorizontal: 8, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pill: { fontFamily: fonts.semibold, fontSize: 12, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
});
