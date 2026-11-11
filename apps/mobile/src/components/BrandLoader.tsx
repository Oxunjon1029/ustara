import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { Icon } from '.';

/**
 * Full-screen Ustara loader shown while the app restores the session.
 * The tile matches the native splash (96px, same colours), so the hand-off is seamless.
 */
export function BrandLoader({ onReady }: { onReady?: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 350, delay: 120, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start();
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ]),
    );
    const wave = Animated.loop(
      Animated.stagger(
        160,
        dots.map((d) =>
          Animated.sequence([
            Animated.timing(d, { toValue: 1, duration: 280, useNativeDriver: true }),
            Animated.timing(d, { toValue: 0.3, duration: 280, useNativeDriver: true }),
          ]),
        ),
      ),
    );
    breathe.start();
    wave.start();
    return () => {
      breathe.stop();
      wave.stop();
    };
  }, [pulse, enter, dots]);

  return (
    <View style={s.root} onLayout={onReady} accessibilityRole="progressbar" accessibilityLabel="Ustara">
      <Animated.View style={[s.tile, { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }]}>
        <Icon name="scissors" color="#fff" size={52} />
      </Animated.View>
      <Animated.View style={{ alignItems: 'center', gap: 14, opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
        <Text style={s.word}>Ustara</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {dots.map((d, i) => (
            <Animated.View key={i} style={[s.dot, { opacity: d }]} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', gap: 20 },
  // 96px tile, 24% radius: identical to assets/splash-icon.png at imageWidth 96.
  tile: { width: 96, height: 96, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  word: { fontFamily: fonts.display, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
});
