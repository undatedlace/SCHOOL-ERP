import type { QueryClient } from '@tanstack/react-query';

/**
 * Marks every cached read whose API path starts with `prefix` as out of date, for every account,
 * so the screens showing it fetch again (after a hand-in, or after reading a notification).
 * Cache keys look like `['acct', accountId, '/homework', query]` (see `useApiQuery`).
 */
export function invalidatePrefix(client: QueryClient, prefix: string) {
  return client.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'acct' && typeof q.queryKey[2] === 'string' && q.queryKey[2].startsWith(prefix),
  });
}
