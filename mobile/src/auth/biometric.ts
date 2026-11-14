import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

/** Whether the lock is switched on. A preference only; no account data. */
export const BIOMETRIC_PREF_KEY = 'pref.biometric';

export async function readBiometricPreference(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BIOMETRIC_PREF_KEY)) === 'on';
  } catch {
    return false;
  }
}

export async function writeBiometricPreference(on: boolean): Promise<void> {
  try {
    if (on) await AsyncStorage.setItem(BIOMETRIC_PREF_KEY, 'on');
    else await AsyncStorage.removeItem(BIOMETRIC_PREF_KEY);
  } catch {
    // The choice just is not remembered.
  }
}

export type BiometricSupport = 'ready' | 'no_hardware' | 'not_enrolled';

/** Can this phone check a face, fingerprint or screen lock right now? */
export async function biometricSupport(): Promise<BiometricSupport> {
  if (!(await LocalAuthentication.hasHardwareAsync())) return 'no_hardware';
  if (!(await LocalAuthentication.isEnrolledAsync())) return 'not_enrolled';
  return 'ready';
}

/** Asks the phone to check the person. True when they passed. */
export async function authenticate(reason: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancel',
    // Falling back to the phone's passcode keeps people with a bad fingerprint reader from being locked out.
    disableDeviceFallback: false,
  });
  return result.success;
}

/** How long the app may sit in the background before it asks again. */
export const RELOCK_AFTER_MS = 60_000;
