import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useApiQuery } from '@/api/hooks';
import type { UnreadCounts } from './types';

/**
 * Marks every cached query whose API path starts with one of `prefixes` as stale, so it is
 * fetched again (the inbox, the thread, the tab badge). Query keys are ['acct', id, path, query].
 */
export function invalidateApiPaths(client: QueryClient, prefixes: string[]) {
  return client.invalidateQueries({
    predicate: (q) => {
      const path = q.queryKey[2];
      return typeof path === 'string' && prefixes.some((p) => path.startsWith(p));
    },
  });
}

/** After anything changes in a conversation: the inbox, threads and the badge are fetched again. */
export function useRefreshMessages() {
  const client = useQueryClient();
  return useCallback(() => invalidateApiPaths(client, ['/messages']), [client]);
}

/**
 * How many conversations have unread messages, for the badge on the Messages tab. Checked every
 * 60 seconds, and again whenever the app comes back to the front.
 */
export function useMessagesUnread(): number {
  const { data, refetch } = useApiQuery<UnreadCounts, number>('/messages/unread-count', {
    refetchInterval: 60_000,
    select: (r) => r.unread,
  });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => sub.remove();
  }, [refetch]);
  return data ?? 0;
}
