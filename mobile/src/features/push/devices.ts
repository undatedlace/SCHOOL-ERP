import * as SecureStore from 'expo-secure-store';
import { api } from '@/api/client';
import type { DeviceRecord, TokenOwner } from './decision';

/**
 * This phone's registration with the server, kept in secure storage:
 *   - `device.<userId>`  the device id the server gave that account (and the token it was for)
 *   - `push.owner`       the account the server currently has the token under
 * No tokens or names of children are stored here; the account's own session token is kept
 * apart by the auth module and passed in.
 *
 * This file must not import the auth provider: the provider imports `unregisterDevice` from here.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const deviceKey = (accountId: string) => `device.${accountId}`;
const OWNER_KEY = 'push.owner';

async function readJson<T>(key: string, valid: (v: unknown) => v is T): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key, OPTIONS);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is DeviceRecord =>
  Boolean(v) &&
  typeof (v as DeviceRecord).deviceId === 'string' &&
  typeof (v as DeviceRecord).pushToken === 'string';

const isOwner = (v: unknown): v is TokenOwner =>
  Boolean(v) &&
  typeof (v as TokenOwner).accountId === 'string' &&
  typeof (v as TokenOwner).pushToken === 'string';

export const readDevice = (accountId: string) => readJson(deviceKey(accountId), isRecord);
export const readOwner = () => readJson(OWNER_KEY, isOwner);

/** Forgets this account's device on the phone only (the server is not asked). */
export async function forgetDevice(accountId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(deviceKey(accountId), OPTIONS);
    const owner = await readOwner();
    if (owner?.accountId === accountId) await SecureStore.deleteItemAsync(OWNER_KEY, OPTIONS);
  } catch {
    // Storage trouble must never stop a sign-out.
  }
}

export interface RegisterInput {
  accountId: string;
  /** That account's own session token (the one for the account being registered). */
  sessionToken: string;
  pushToken: string;
  platform: 'IOS' | 'ANDROID';
  appVersion: string;
}

/** `POST /devices` for one account, then remember the id the server gave. */
export async function registerDevice(input: RegisterInput): Promise<DeviceRecord> {
  const result = await api.post<{ id: string }>(
    '/devices',
    { pushToken: input.pushToken, platform: input.platform, appVersion: input.appVersion },
    { token: input.sessionToken },
  );
  const record: DeviceRecord = { deviceId: result.id, pushToken: input.pushToken };
  await SecureStore.setItemAsync(deviceKey(input.accountId), JSON.stringify(record), OPTIONS);
  await SecureStore.setItemAsync(
    OWNER_KEY,
    JSON.stringify({ accountId: input.accountId, pushToken: input.pushToken } satisfies TokenOwner),
    OPTIONS,
  );
  return record;
}

/**
 * Sign-out: tell the server to stop pushing to this phone for this account (`DELETE /devices/:id`),
 * then forget it here. A failure (offline, or the token was already moved to another account on
 * this phone, which answers 404) never blocks signing out.
 */
export async function unregisterDevice(accountId: string, sessionToken: string): Promise<void> {
  const record = await readDevice(accountId);
  if (record) {
    await api.delete(`/devices/${record.deviceId}`, { token: sessionToken }).catch(() => undefined);
  }
  await forgetDevice(accountId);
}
