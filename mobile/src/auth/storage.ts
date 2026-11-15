import * as SecureStore from 'expo-secure-store';
import type { Account, RoleKind } from './types';

/**
 * Saved accounts. Everything here lives in the phone's secure storage (Keychain on iOS,
 * Keystore on Android), never in AsyncStorage:
 *   - `accounts.v1`        the list of accounts (id, name, role kind, photo id)
 *   - `activeAccount.v1`   which account is showing
 *   - `token.<userId>`     each account's session token, under its own key
 */
export const ACCOUNTS_KEY = 'accounts.v1';
export const ACTIVE_KEY = 'activeAccount.v1';
export const tokenKey = (accountId: string) => `token.${accountId}`;

/** Only this device, only while it is unlocked, and not copied to a new phone by a backup. */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const KINDS: readonly RoleKind[] = ['family', 'teacher', 'other'];

function parseAccount(value: unknown): Account | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.fullName !== 'string') return null;
  if (!KINDS.includes(v.kind as RoleKind)) return null;
  return {
    id: v.id,
    fullName: v.fullName,
    kind: v.kind as RoleKind,
    roleLabel: typeof v.roleLabel === 'string' ? v.roleLabel : 'Account',
    photoFileId: typeof v.photoFileId === 'string' ? v.photoFileId : null,
    subtitle: typeof v.subtitle === 'string' ? v.subtitle : null,
  };
}

// The list is read, changed and written back; one change at a time so two never overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export async function loadAccounts(): Promise<Account[]> {
  const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY, OPTIONS);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseAccount).filter((a): a is Account => a !== null);
  } catch {
    return [];
  }
}

const writeAccounts = (accounts: Account[]) =>
  SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(accounts), OPTIONS);

/** Adds the account (or replaces the saved one with the same id) and stores its token. */
export function saveAccount(account: Account, token: string): Promise<Account[]> {
  return serial(async () => {
    const accounts = await loadAccounts();
    const next = [...accounts.filter((a) => a.id !== account.id), account];
    await SecureStore.setItemAsync(tokenKey(account.id), token, OPTIONS);
    await writeAccounts(next);
    return next;
  });
}

/** Changes the details of a saved account (name, photo). Does nothing if it is not saved. */
export function updateAccount(account: Account): Promise<Account[]> {
  return serial(async () => {
    const accounts = await loadAccounts();
    if (!accounts.some((a) => a.id === account.id)) return accounts;
    const next = accounts.map((a) => (a.id === account.id ? account : a));
    await writeAccounts(next);
    return next;
  });
}

/** Forgets an account: its entry in the list and its token. */
export function removeAccount(accountId: string): Promise<Account[]> {
  return serial(async () => {
    const accounts = await loadAccounts();
    const next = accounts.filter((a) => a.id !== accountId);
    await SecureStore.deleteItemAsync(tokenKey(accountId), OPTIONS);
    await writeAccounts(next);
    const active = await SecureStore.getItemAsync(ACTIVE_KEY, OPTIONS);
    if (active === accountId) await SecureStore.deleteItemAsync(ACTIVE_KEY, OPTIONS);
    return next;
  });
}

export const getToken = (accountId: string) => SecureStore.getItemAsync(tokenKey(accountId), OPTIONS);
export const setToken = (accountId: string, token: string) =>
  SecureStore.setItemAsync(tokenKey(accountId), token, OPTIONS);

export const getActiveId = () => SecureStore.getItemAsync(ACTIVE_KEY, OPTIONS);
export const setActiveId = (accountId: string) => SecureStore.setItemAsync(ACTIVE_KEY, accountId, OPTIONS);
