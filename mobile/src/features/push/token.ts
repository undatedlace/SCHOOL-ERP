import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

/**
 * How the app behaves when a push arrives while it is open: nothing from the system (no alert,
 * no sound); the app shows its own small banner instead (PushBanner).
 */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    // Android 13 and later only ask for permission once a channel exists.
    void Notifications.setNotificationChannelAsync('default', {
      name: 'School updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => undefined);
  }
}

export async function getPushPermission(): Promise<PushPermission> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain === false || p.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'denied';
  }
}

/** Shows the system's permission question. Call this only after the primer has explained why. */
export async function askPushPermission(): Promise<PushPermission> {
  try {
    const p = await Notifications.requestPermissionsAsync();
    return p.granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * The Expo push token of this phone, or null when there is none: a simulator, a build with no
 * EAS project id (Expo Go has none), or a refused request. The reason is logged and nothing else
 * happens, so the app works the same without push.
 */
export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('push: this is a simulator or emulator, which cannot receive push. Skipping.');
    return null;
  }
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.log('push: no EAS project id in this build (normal in Expo Go). Skipping push registration.');
    return null;
  }
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (e) {
    console.log(`push: could not get a push token: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export const appVersion = (): string => Constants.expoConfig?.version ?? '0';
export const devicePlatform = (): 'IOS' | 'ANDROID' => (Platform.OS === 'ios' ? 'IOS' : 'ANDROID');
