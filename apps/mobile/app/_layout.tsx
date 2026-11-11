import '../src/i18n';
import { useEffect } from 'react';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { AuthProvider, useAuth } from '../src/features/auth/AuthProvider';
import { initSentry, Sentry } from '../src/lib/sentry';
import { DialogHost } from '../src/components/Dialog';
import { BrandLoader } from '../src/components/BrandLoader';
import { usePushSetup } from '../src/features/notifications/push';
import { initTelegram, telegram } from '../src/lib/telegram';

initSentry();
initTelegram();
SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 2 } } });

/** Role gate: only the stack for the signed-in role is reachable. */
function RootStack() {
  const { state } = useAuth();
  const role = state.status === 'signedIn' ? state.profile.role : null;
  usePushSetup(state.status === 'signedIn' ? state.profile.user_id : null);
  useTelegramBackButton();

  useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hideAsync();
  }, [state.status]);
  // Native splash hands over to the animated loader while the session is restored.
  if (state.status === 'loading') return <BrandLoader onReady={() => SplashScreen.hideAsync()} />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* Reachable signed in or out: Telegram sign-in/link/reset and the new-password step. */}
      <Stack.Screen name="telegram-wait" />
      <Stack.Screen name="reset-password" />
      <Stack.Protected guard={!role}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={role === 'client'}>
        <Stack.Screen name="client" />
      </Stack.Protected>
      <Stack.Protected guard={role === 'barber'}>
        <Stack.Screen name="barber" />
      </Stack.Protected>
      <Stack.Protected guard={role === 'admin'}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
    </Stack>
  );
}

/** In the Telegram Mini App, Telegram's header back button appears on pushed pages (not on tabs or sign-in). */
function useTelegramBackButton() {
  const segments = useSegments() as string[];
  const key = segments.join('/');
  useEffect(() => {
    if (!telegram) return;
    const back = () => router.back();
    const root = segments.length === 0 || segments.includes('(tabs)') || segments.includes('(auth)');
    if (!root && router.canGoBack()) {
      telegram.BackButton.show();
      telegram.BackButton.onClick(back);
    } else telegram.BackButton.hide();
    return () => telegram!.BackButton.offClick(back);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });
  if (!fontsLoaded) return null;
  return (
    <KeyboardProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootStack />
          <DialogHost />
        </AuthProvider>
      </QueryClientProvider>
    </KeyboardProvider>
  );
}

export default Sentry.wrap(RootLayout);
