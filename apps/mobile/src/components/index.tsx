import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, type } from '../theme';
import { setLocale } from '../i18n';

/** Tab screens sit under AppHeader and above the tab bar (no insets needed); full-screen pages pass `fullScreen`. */
export function Screen({ children, style, fullScreen }: { children: ReactNode; style?: StyleProp<ViewStyle>; fullScreen?: boolean }) {
  return (
    <SafeAreaView edges={fullScreen ? ['top', 'bottom'] : []} style={[{ flex: 1, backgroundColor: colors.ground }, style]}>
      {children}
    </SafeAreaView>
  );
}

type Variant = 'primary' | 'dark' | 'telegram' | 'outline';
const bg: Record<Variant, string> = { primary: colors.primary, dark: colors.ink, telegram: colors.telegram, outline: 'transparent' };

export function Button(props: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  /** 'sm': 44px-tall, 14px label, for buttons inside cards */
  size?: 'md' | 'sm';
  textColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const v = props.variant ?? 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg[v], opacity: pressed || props.disabled ? 0.85 : 1 },
        v === 'outline' && { borderWidth: 1, borderColor: colors.border },
        props.size === 'sm' && { height: 44, paddingHorizontal: 12 },
        props.style,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={v === 'outline' ? colors.ink : '#fff'} />
      ) : (
        <>
          {props.icon}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={[
              s.buttonText,
              v === 'outline' && { color: colors.ink, fontFamily: fonts.medium },
              props.size === 'sm' && { fontSize: 14, fontFamily: fonts.semibold },
              props.textColor ? { color: props.textColor } : null,
              { flexShrink: 1, textAlign: 'center' },
            ]}
          >
            {props.label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Badge({ label }: { label: string }) {
  return <Text style={s.badge}>{label}</Text>;
}

export function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size }]}>
      <Text style={{ fontFamily: fonts.semibold, color: colors.primary, fontSize: size / 3.5 }}>{name.charAt(0)}</Text>
    </View>
  );
}

export function LanguageSwitch() {
  const { i18n } = useTranslation();
  return (
    <View style={s.segment} accessibilityRole="radiogroup">
      {(['uz', 'ru'] as const).map((l) => {
        const active = i18n.language === l;
        return (
          <Pressable
            key={l}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => setLocale(l)}
            style={[s.segmentItem, active && { backgroundColor: colors.surface }]}
          >
            <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 13, color: active ? colors.ink : colors.inkMuted }}>
              {l === 'uz' ? 'Oʻzbekcha' : 'Русский'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Placeholder({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <Screen style={{ padding: 20, paddingTop: 8 }}>
      <Text style={type.h1}>{title}</Text>
      <Card style={{ marginTop: 16 }}>
        <Text style={type.small}>{t('common.soon')}</Text>
      </Card>
    </Screen>
  );
}

// Icons: inline stroke SVGs from the UI canvas ------------------------------
type IconName = 'back' | 'check' | 'eye' | 'eyeOff' | 'home' | 'calendar' | 'user' | 'bell' | 'telegram' | 'scissors' | 'clock' | 'wallet' | 'grid' | 'chart' | 'settings' | 'phone';
export function Icon({ name, color = colors.ink, size = 22 }: { name: IconName; color?: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'back' && <Path {...p} d="M15 18l-6-6 6-6" />}
      {name === 'check' && <Path {...p} strokeWidth={2.5} d="m5 12 5 5 9-10" />}
      {name === 'eye' &&(<><Path {...p} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><Circle {...p} cx={12} cy={12} r={3} /></>)}
      {name === 'eyeOff' && (<><Path {...p} d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><Path {...p} d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" /></>)}
      {name === 'home' &&<Path {...p} d="M3 10.5 12 3l9 7.5V21H3z" />}
      {name === 'calendar' && (<><Rect {...p} x={3} y={4} width={18} height={17} rx={2} /><Path {...p} d="M16 2v4M8 2v4M3 10h18" /></>)}
      {name === 'user' && (<><Circle {...p} cx={12} cy={8} r={4} /><Path {...p} d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>)}
      {name === 'bell' && (<><Path {...p} d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><Path {...p} d="M13.7 21a2 2 0 0 1-3.4 0" /></>)}
      {name === 'telegram' && (<><Path {...p} d="M21 4 3 11l6 2 2 6 3-4 5 4z" /><Path {...p} d="m9 13 12-9" /></>)}
      {name === 'scissors' && (<><Circle {...p} cx={6} cy={6} r={3} /><Circle {...p} cx={6} cy={18} r={3} /><Line {...p} x1={20} y1={4} x2={8.1} y2={15.9} /><Line {...p} x1={14.5} y1={14.5} x2={20} y2={20} /><Line {...p} x1={8.1} y1={8.1} x2={12} y2={12} /></>)}
      {name === 'clock' && (<><Circle {...p} cx={12} cy={12} r={9} /><Path {...p} d="M12 7v5l3 2" /></>)}
      {name === 'wallet' && (<><Rect {...p} x={3} y={6} width={18} height={14} rx={2} /><Path {...p} d="M16 13h2M3 10h18" /></>)}
      {name === 'grid' && (<><Rect {...p} x={3} y={3} width={7} height={7} rx={1} /><Rect {...p} x={14} y={3} width={7} height={7} rx={1} /><Rect {...p} x={3} y={14} width={7} height={7} rx={1} /><Rect {...p} x={14} y={14} width={7} height={7} rx={1} /></>)}
      {name === 'chart' && <Path {...p} d="M4 20V10M10 20V4M16 20v-7M22 20H2" />}
      {name === 'phone' && <Path {...p} d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />}
      {name === 'settings' && (<><Circle {...p} cx={12} cy={12} r={3} /><Path {...p} d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>)}
    </Svg>
  );
}

const s = StyleSheet.create({
  button: { height: 56, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  buttonText: { color: '#fff', fontFamily: fonts.semibold, fontSize: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 16 },
  badge: { fontFamily: fonts.semibold, fontSize: 12, color: '#fff', backgroundColor: colors.confirmed, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  avatar: { borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: colors.segment, borderRadius: radius.pill, padding: 3 },
  segmentItem: { borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
});
