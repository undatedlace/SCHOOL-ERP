import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** The API port on a developer's machine (see mobile/README.md). */
export const DEV_API_PORT = 3104;

export interface BaseUrlInputs {
  /** `EXPO_PUBLIC_API_URL`, inlined at build time. */
  env?: unknown;
  /** `extra.apiUrl` from app.config.ts. */
  extra?: unknown;
  os: string;
  dev: boolean;
}

const clean = (v?: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/\/+$/, '') : null;

/**
 * Where the API lives. In order: `EXPO_PUBLIC_API_URL`, the `apiUrl` in app.config.ts extra, and,
 * in a development build only, the local API (`localhost` for the iOS simulator, `10.0.2.2` for
 * the Android emulator). A release build with no address returns an empty string, so requests
 * fail with a clear message instead of quietly calling a development address.
 */
export function resolveApiBaseUrl({ env, extra, os, dev }: BaseUrlInputs): string {
  const configured = clean(env) ?? clean(extra);
  if (configured) return configured;
  if (!dev) return '';
  return os === 'android' ? `http://10.0.2.2:${DEV_API_PORT}` : `http://localhost:${DEV_API_PORT}`;
}

export function getApiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiUrl?: string | null } | undefined;
  return resolveApiBaseUrl({
    // Written out in full so Metro can inline it.
    env: process.env.EXPO_PUBLIC_API_URL,
    extra: extra?.apiUrl,
    os: Platform.OS,
    dev: __DEV__,
  });
}

/** The versioned API prefix. Same API as `/api`, but a later breaking change can live at `/api/v2`. */
export const API_PREFIX = '/api/v1';
