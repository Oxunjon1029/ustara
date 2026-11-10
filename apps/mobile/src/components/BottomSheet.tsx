import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

/** Slides `then` out of view, then runs it. Children use it to close with the animation. */
export type CloseSheet = (then?: () => void) => void;

/**
 * App bottom sheet: dimmed backdrop, drag handle, swipe down / tap outside / back button to dismiss.
 * Mount it only while it should be visible (`{open && <BottomSheet ... />}`).
 */
export function BottomSheet({ onDismiss, children }: { onDismiss: () => void; children: (close: CloseSheet) => ReactNode }) {
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onDismiss}>
      {/* The modal is its own window: measure its insets here, not from the screen behind it. */}
      <SafeAreaProvider>
        <Sheet onDismiss={onDismiss}>{children}</Sheet>
      </SafeAreaProvider>
    </Modal>
  );
}

function Sheet({ onDismiss, children }: { onDismiss: () => void; children: (close: CloseSheet) => ReactNode }) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(500)).current; // 0 = fully open

  useEffect(() => {
    Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
  }, [y]);

  const close: CloseSheet = (then = onDismiss) =>
    Animated.timing(y, { toValue: 600, duration: 160, useNativeDriver: true }).start(() => then());

  // Swipe down to dismiss; taps still reach the content.
  const closeRef = useRef(close);
  closeRef.current = close;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.8) closeRef.current();
        else Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(y, { toValue: 0, useNativeDriver: true }).start(),
    }),
  ).current;

  return (
    <View style={{ flex: 1 }}>
      <Pressable style={s.backdrop} onPress={() => close()} />
      <Animated.View {...pan.panHandlers} accessibilityViewIsModal style={[s.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: y }] }]}>
        <View style={s.handle} />
        {children(close)}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(21,23,26,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.chrome, marginBottom: 16 },
});
