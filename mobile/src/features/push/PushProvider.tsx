import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api } from '@/api/client';
import { useAuth } from '@/auth';
import { getToken } from '@/auth/storage';
import { invalidateApiPaths } from '@/features/messages/hooks';
import { createHandledSet } from './decision';
import { appVersion, askPushPermission, configureNotifications, devicePlatform, getPushPermission, getPushToken, type PushPermission } from './token';
import { readDevice, readOwner, registerDevice } from './devices';
import { parsePushData, type PushPayload } from './payload';
import { PrimerSheet } from './PrimerSheet';
import { PushBanner, type BannerContent } from './PushBanner';
import { syncRegistrations } from './sync';
import { handleNotificationTap } from './tap';

/** Whether the "why we would like to send notifications" card has been shown on this phone. A preference only. */
const PRIMER_KEY = 'push.primerShown.v1';

configureNotifications();

/**
 * Push for the whole app, mounted once inside the auth provider:
 *  - asks permission once, after a primer card, once someone is signed in;
 *  - registers this phone with the server for each saved account (see decision.ts);
 *  - opens the right screen when a push is tapped, also on a cold start;
 *  - shows a small banner (not a system alert) when a push arrives while the app is open.
 */
export function PushProvider({ children }: { children: ReactNode }) {
  const { status, accounts, active, locked, mustChangePassword, checking, switchAccount } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const navReady = Boolean(useRootNavigationState()?.key);

  const open = status === 'ready' && !checking && !locked && !mustChangePassword && Boolean(active);

  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [primerOpen, setPrimerOpen] = useState(false);
  const [banner, setBanner] = useState<(BannerContent & { payload: PushPayload | null }) | null>(null);

  // The latest values, for listeners that are set up once.
  const latest = useRef({ accounts, activeId: active?.id ?? null });
  latest.current = { accounts, activeId: active?.id ?? null };
  const handled = useRef(createHandledSet());
  const pending = useRef<{ payload: PushPayload; key: string } | null>(null);

  const refreshCounts = useCallback(() => {
    void invalidateApiPaths(client, ['/notifications', '/messages']);
  }, [client]);

  // --- permission -------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const read = () =>
      getPushPermission().then((p) => {
        if (!cancelled) setPermission(p);
      });
    void read();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void read();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [open]);

  // The primer: once per phone, only while the system has not been asked yet.
  useEffect(() => {
    if (!open || permission !== 'undetermined') return;
    let cancelled = false;
    AsyncStorage.getItem(PRIMER_KEY)
      .then((shown) => {
        if (!cancelled && !shown) setPrimerOpen(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, permission]);

  const closePrimer = useCallback(() => {
    setPrimerOpen(false);
    void AsyncStorage.setItem(PRIMER_KEY, '1').catch(() => undefined);
  }, []);

  const acceptPrimer = useCallback(() => {
    closePrimer();
    // Let the sheet finish closing before the system question appears.
    setTimeout(() => {
      void askPushPermission().then(setPermission);
    }, 450);
  }, [closePrimer]);

  // --- registration -----------------------------------------------------------------------
  // One registration run at a time; a change that arrives meanwhile queues another run.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const accountKey = accounts.map((a) => a.id).join(',');
  const activeId = active?.id ?? null;
  useEffect(() => {
    if (!open || permission !== 'granted') return;
    queue.current = queue.current.then(async () => {
      try {
        const pushToken = await getPushToken();
        if (!pushToken) return;
        await syncRegistrations(
          { accounts: latest.current.accounts, activeId: latest.current.activeId, pushToken },
          {
            readRecord: readDevice,
            readOwner,
            register: async (accountId, token) => {
              const sessionToken = await getToken(accountId);
              if (!sessionToken) return null;
              return registerDevice({
                accountId,
                sessionToken,
                pushToken: token,
                platform: devicePlatform(),
                appVersion: appVersion(),
              });
            },
            log: (m) => console.log(m),
          },
        );
      } catch (e) {
        console.log(`push: registration failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    // accountKey and activeId are listed so that a new or switched account is registered.
  }, [open, permission, accountKey, activeId]);

  // --- taps -------------------------------------------------------------------------------
  const tap = useCallback(
    async (payload: PushPayload) => {
      await handleNotificationTap(payload, {
        accounts: latest.current.accounts,
        activeId: latest.current.activeId,
        switchAccount,
        markRead: async (id) => {
          await api.post(`/notifications/${id}/read`);
        },
        refreshCounts,
        navigate: (stack) => {
          const [first, ...rest] = stack;
          if (!first) return;
          router.navigate(first);
          for (const next of rest) router.push(next);
        },
      });
    },
    [router, switchAccount, refreshCounts],
  );

  const onResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const payload = parsePushData(response.notification.request.content.data);
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (!payload || handled.current.has(key)) return;
      handled.current.add(key);
      if (open && navReady) void tap(payload);
      else pending.current = { payload, key };
    },
    [open, navReady, tap],
  );

  // A tap that arrived before sign-in, the lock or the navigator was ready.
  useEffect(() => {
    if (!open || !navReady || !pending.current) return;
    const { payload } = pending.current;
    pending.current = null;
    void tap(payload);
  }, [open, navReady, tap]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(onResponse);
    return () => sub.remove();
  }, [onResponse]);

  // Cold start: the push that opened the app.
  const coldChecked = useRef(false);
  useEffect(() => {
    if (coldChecked.current) return;
    coldChecked.current = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) onResponse(response);
      })
      .catch(() => undefined);
  }, [onResponse]);

  // --- foreground ---------------------------------------------------------------------------
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      refreshCounts();
      setBanner({
        key: notification.request.identifier,
        title: content.title ?? 'School update',
        body: content.body ?? 'Open the app to read it.',
        payload: parsePushData(content.data),
      });
    });
    return () => sub.remove();
  }, [refreshCounts]);

  const dismissBanner = useCallback(() => setBanner(null), []);
  const openBanner = useCallback(() => {
    const current = banner;
    setBanner(null);
    if (current?.payload) void tap(current.payload);
  }, [banner, tap]);

  return (
    <>
      {children}
      <PushBanner banner={open ? banner : null} onOpen={openBanner} onDismiss={dismissBanner} />
      <PrimerSheet visible={open && primerOpen} onAccept={acceptPrimer} onDecline={closePrimer} />
    </>
  );
}
