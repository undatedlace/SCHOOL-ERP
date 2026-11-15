import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { api, bindApi, type Session } from '@/api/client';
import { isApiError } from '@/api/errors';
import { queryClient } from '@/api/queryClient';
import {
  authenticate,
  biometricSupport,
  readBiometricPreference,
  RELOCK_AFTER_MS,
  writeBiometricPreference,
  type BiometricSupport,
} from './biometric';
import { forgetDevice, unregisterDevice } from '@/features/push/devices';
import { roleKindFromMe, roleLabelFromMe } from './roles';
import {
  getActiveId,
  getToken,
  loadAccounts,
  removeAccount,
  saveAccount,
  setActiveId,
  setToken,
  updateAccount,
} from './storage';
import type { Account, ChangePasswordResponse, LoginResponse, MeResponse } from './types';

export interface SignInInput {
  identifier: string;
  password: string;
  schoolCode?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AuthContextValue {
  /** `loading` while the saved accounts are read; `signedOut` when there is none. */
  status: 'loading' | 'signedOut' | 'ready';
  accounts: Account[];
  active: Account | null;
  /** The signed-in account's permissions, from `GET /auth/me`. Null until it has been asked. */
  me: MeResponse | null;
  /** True while the first check of the saved session is under way. */
  checking: boolean;
  mustChangePassword: boolean;
  /** The biometric lock is up: show nothing until the person passes it. */
  locked: boolean;
  biometricEnabled: boolean;
  /** A message for the sign-in screen ("Your session ended"). */
  notice: string | null;
  signIn: (input: SignInInput) => Promise<void>;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
  switchAccount: (accountId: string) => Promise<void>;
  /** Signs out one account (default: the active one): tells the server, then forgets it on this phone. */
  signOut: (accountId?: string) => Promise<void>;
  setBiometric: (on: boolean) => Promise<'ok' | 'failed' | BiometricSupport>;
  unlock: () => Promise<boolean>;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** The signed-in account's id, or null. Used to keep cached data apart per account. */
export function useActiveAccountId(): string | null {
  return useContext(AuthContext)?.active?.id ?? null;
}

const CHECK_TIMEOUT_MS = 6000;
const SESSION_ENDED = 'Your session ended. Please sign in again.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [active, setActive] = useState<Account | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [mustChange, setMustChange] = useState(false);
  const [locked, setLocked] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The API client reads these without waiting for a render.
  const sessionRef = useRef<Session | null>(null);
  const activeRef = useRef<Account | null>(null);
  const biometricRef = useRef(false);
  activeRef.current = active;
  biometricRef.current = biometricEnabled;

  const applyAccounts = useCallback((next: Account[]) => setAccounts(next), []);

  /** Checks the session with the server and learns what the account may do. */
  const validate = useCallback(async (accountId: string) => {
    try {
      const result = await api.get<MeResponse>('/auth/me');
      if (sessionRef.current?.accountId !== accountId) return;
      setMe(result);
      setMustChange(result.mustChangePassword);
      const current = activeRef.current;
      if (current && current.id === accountId) {
        const kind = roleKindFromMe(result);
        const roleLabel = roleLabelFromMe(result, kind);
        if (current.kind !== kind || current.fullName !== result.fullName || current.roleLabel !== roleLabel) {
          const updated = { ...current, kind, fullName: result.fullName, roleLabel };
          setActive(updated);
          applyAccounts(await updateAccount(updated));
        }
      }
    } catch {
      // A 401 already dropped the account. Offline or a server error: carry on with what is saved.
    } finally {
      if (sessionRef.current?.accountId === accountId) setChecking(false);
    }
  }, [applyAccounts]);

  /** Makes a saved account the one on screen. */
  const activate = useCallback(
    async (account: Account, knownToken?: string) => {
      const token = knownToken ?? (await getToken(account.id));
      if (!token) {
        // A saved account without its token cannot be used. Forget it.
        const remaining = await removeAccount(account.id);
        applyAccounts(remaining);
        const next = remaining[0];
        if (next) await activate(next);
        else {
          sessionRef.current = null;
          setActive(null);
          setMe(null);
          setStatus('signedOut');
          setChecking(false);
        }
        return;
      }
      queryClient.clear();
      sessionRef.current = { accountId: account.id, token };
      await setActiveId(account.id);
      setActive(account);
      setMe(null);
      setMustChange(false);
      setChecking(true);
      setStatus('ready');
      void validate(account.id);
      // Offline or slow server: do not keep the splash screen up; carry on with what is saved.
      setTimeout(() => {
        if (sessionRef.current?.accountId === account.id) setChecking(false);
      }, CHECK_TIMEOUT_MS);
    },
    [applyAccounts, validate],
  );

  /** Forgets an account on this phone (token and entry). Moves to another saved account, or to sign-in. */
  const dropAccount = useCallback(
    async (accountId: string, message?: string) => {
      const wasActive = activeRef.current?.id === accountId;
      void forgetDevice(accountId); // push (wave 2, G): this phone's device record for the account
      const remaining = await removeAccount(accountId);
      applyAccounts(remaining);
      if (message) setNotice(message);
      if (!wasActive) return;
      queryClient.clear();
      sessionRef.current = null;
      const next = remaining[0];
      if (next) {
        await activate(next);
      } else {
        setActive(null);
        setMe(null);
        setMustChange(false);
        setLocked(false);
        setChecking(false);
        setStatus('signedOut');
      }
    },
    [activate, applyAccounts],
  );

  // Connect the API client: whose session to use, and what to do when the server says 401.
  const dropRef = useRef(dropAccount);
  dropRef.current = dropAccount;
  useEffect(() => {
    bindApi({
      getSession: () => sessionRef.current,
      onUnauthorized: (accountId, token) => {
        // An answer to a token that has since been replaced (a password change) means nothing.
        const current = sessionRef.current;
        if (current && current.accountId === accountId && current.token !== token) return;
        void dropRef.current(accountId, SESSION_ENDED);
      },
    });
    return () => bindApi({ getSession: () => null, onUnauthorized: () => undefined });
  }, []);

  // Start-up: read the saved accounts and the lock setting.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [saved, activeId, lockOn] = await Promise.all([
        loadAccounts().catch(() => [] as Account[]),
        getActiveId().catch(() => null),
        readBiometricPreference(),
      ]);
      if (cancelled) return;
      setAccounts(saved);
      setBiometricEnabled(lockOn);
      if (saved.length === 0) {
        setChecking(false);
        setStatus('signedOut');
        return;
      }
      setLocked(lockOn);
      await activate(saved.find((a) => a.id === activeId) ?? saved[0]!);
    })().catch(() => {
      if (!cancelled) {
        setChecking(false);
        setStatus('signedOut');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activate]);

  // Ask for the lock again after the app has been away for a while.
  useEffect(() => {
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt = Date.now();
      } else if (state === 'active') {
        if (biometricRef.current && leftAt !== null && Date.now() - leftAt > RELOCK_AFTER_MS && activeRef.current) {
          setLocked(true);
        }
        leftAt = null;
      }
    });
    return () => sub.remove();
  }, []);

  // A student's photo and class for the account switcher (not known from /auth/me).
  const profileFor = useRef<string | null>(null);
  useEffect(() => {
    if (!active || active.kind !== 'family' || !me || me.mustChangePassword || mustChange) return;
    if (profileFor.current === active.id) return;
    profileFor.current = active.id;
    const id = active.id;
    (async () => {
      const page = await api.get<{
        items: {
          photoFileId: string | null;
          current: { class: { name: string }; division: { name: string } } | null;
        }[];
      }>('/students', { query: { page: 1, pageSize: 1 } });
      const student = page.items[0];
      if (!student || activeRef.current?.id !== id) return;
      const subtitle = student.current ? `${student.current.class.name} · ${student.current.division.name}` : null;
      const current = activeRef.current;
      if (!current || (current.photoFileId === student.photoFileId && current.subtitle === subtitle)) return;
      const updated = { ...current, photoFileId: student.photoFileId, subtitle };
      setActive(updated);
      applyAccounts(await updateAccount(updated));
    })().catch(() => undefined);
  }, [active, me, mustChange, applyAccounts]);

  const signIn = useCallback(
    async ({ identifier, password, schoolCode }: SignInInput) => {
      const login = await api.post<LoginResponse>(
        '/auth/login',
        {
          identifier: identifier.trim(),
          password,
          ...(schoolCode?.trim() ? { schoolCode: schoolCode.trim().toLowerCase() } : {}),
        },
        { auth: 'none' },
      );
      const result = await api.get<MeResponse>('/auth/me', { token: login.token });
      const kind = roleKindFromMe(result);
      const account: Account = {
        id: result.id,
        fullName: result.fullName,
        kind,
        roleLabel: roleLabelFromMe(result, kind),
        photoFileId: null,
        subtitle: null,
      };
      const saved = await saveAccount(account, login.token);
      applyAccounts(saved);
      profileFor.current = null;
      setNotice(null);
      await activate(account, login.token);
      setMe(result);
      setMustChange(login.mustChangePassword || result.mustChangePassword);
      setChecking(false);
    },
    [activate, applyAccounts],
  );

  const changePassword = useCallback(
    async (input: ChangePasswordInput) => {
      const current = activeRef.current;
      if (!current) return;
      const next = await api.post<ChangePasswordResponse>('/auth/change-password', input);
      // The server swaps the session for a new one and ends the old token.
      await setToken(current.id, next.token);
      sessionRef.current = { accountId: current.id, token: next.token };
      setMustChange(false);
      setMe((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
      queryClient.clear();
    },
    [],
  );

  const switchAccount = useCallback(
    async (accountId: string) => {
      if (activeRef.current?.id === accountId) return;
      const target = accounts.find((a) => a.id === accountId);
      if (target) await activate(target);
    },
    [accounts, activate],
  );

  const signOut = useCallback(
    async (accountId?: string) => {
      const id = accountId ?? activeRef.current?.id;
      if (!id) return;
      const token = sessionRef.current?.accountId === id ? sessionRef.current.token : await getToken(id);
      if (token) {
        // Push (wave 2, G): stop pushes to this phone for this account before the session ends.
        await unregisterDevice(id, token).catch(() => undefined);
        // Best effort: even if the phone is offline, the account is still removed from it.
        await api.post<void>('/auth/logout', undefined, { token }).catch((e) => {
          if (!isApiError(e)) throw e;
        });
      }
      await dropAccount(id);
    },
    [dropAccount],
  );

  const setBiometric = useCallback(async (on: boolean) => {
    if (on) {
      const support = await biometricSupport();
      if (support !== 'ready') return support;
      const ok = await authenticate('Confirm to switch on the app lock');
      if (!ok) return 'failed' as const;
    }
    await writeBiometricPreference(on);
    setBiometricEnabled(on);
    if (!on) setLocked(false);
    return 'ok' as const;
  }, []);

  const unlock = useCallback(async () => {
    const ok = await authenticate('Unlock School ERP');
    if (ok) setLocked(false);
    return ok;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      accounts,
      active,
      me,
      checking,
      mustChangePassword: mustChange,
      locked,
      biometricEnabled,
      notice,
      signIn,
      changePassword,
      switchAccount,
      signOut,
      setBiometric,
      unlock,
      clearNotice: () => setNotice(null),
    }),
    [
      status, accounts, active, me, checking, mustChange, locked, biometricEnabled, notice,
      signIn, changePassword, switchAccount, signOut, setBiometric, unlock,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
