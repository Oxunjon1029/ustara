import '../src/i18n';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { AuthProvider, useAuth } from '../src/features/auth/AuthProvider';
import { initSentry, Sentry } from '../src/lib/sentry';
import { DialogHost } from '../src/components/Dialog';
import { usePushSetup } from '../src/features/notifications/push';

initSentry();
SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 2 } } });

/** Role gate: only the stack for the signed-in role is reachable. */
function RootStack() {
  const { state } = useAuth();
  const role = state.status === 'signedIn' ? state.profile.role : null;
  usePushSetup(state.status === 'signedIn' ? state.profile.user_id : null);

  useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hideAsync();
  }, [state.status]);
  if (state.status === 'loading') return null;

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
