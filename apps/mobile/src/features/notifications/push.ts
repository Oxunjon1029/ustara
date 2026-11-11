import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { isDemo, supabase } from '../../lib/supabase';
import { syncProfileLocale } from '../../i18n';

// Show notifications while the app is open too (banner + sound), same on iOS and Android.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

/**
 * Phone push is off for the pilot: notifications go through the Telegram bot (every client who can book has linked it).
 * To turn it on: set true, add google-services.json + googleServicesFile in app.json, upload the FCM V1 key and the APNs
 * key with `eas credentials`, and ship a new build. The server already sends push to any registered token.
 */
export const PUSH_ENABLED = false;

let currentToken: string | null = null;

const projectId = (): string | undefined =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

/** Ask permission (once), get this device's Expo push token and attach it to the signed-in user. */
export async function registerForPush(): Promise<string | null> {
  if (!PUSH_ENABLED || isDemo || !Device.isDevice || Platform.OS === 'web') return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Ustara',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#1F5F4A',
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;

  const id = projectId();
  if (!id) {
    console.warn('push: no EAS projectId in app.json (run `eas init`)');
    return null;
  }
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw error;
    currentToken = token;
    return token;
  } catch (e) {
    console.warn('push: registration failed', e);
    return null;
  }
}

/** Called before sign-out so this phone stops getting the previous user's notifications. */
export async function unregisterPush() {
  if (!currentToken) return;
  await supabase.rpc('unregister_push_token', { p_token: currentToken });
  currentToken = null;
}

/** Registers the device when signed in, refreshes the bell list on arrival, and opens the right screen on tap. */
export function usePushSetup(userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    registerForPush();
    syncProfileLocale();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const open = (r: Notifications.NotificationResponse | null) => {
      const url = r?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
    };
    // App launched by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then(open);
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    const received = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['myBookings'] });
      queryClient.invalidateQueries({ queryKey: ['nextBooking'] });
      queryClient.invalidateQueries({ queryKey: ['barberDay'] });
    });
    return () => {
      tapped.remove();
      received.remove();
    };
  }, [userId, queryClient]);
}
