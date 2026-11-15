import { useInfiniteQuery } from '@tanstack/react-query';
import { api, type ApiError } from '@/api';
import type { QueryValue } from '@/api/client';
import { useActiveAccountId } from '@/auth';

/** The shape of a page from the API: `{ items, total, page, pageSize }`. */
export interface PageOf<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * A list read a page at a time ("Show more"). Like `useApiQuery`, the cache key carries the
 * signed-in account, so one account's list never shows under another.
 */
export function usePagedList<T, P extends PageOf<T> = PageOf<T>>(
  path: string,
  query: Record<string, QueryValue> = {},
  pageSize = 20,
) {
  const accountId = useActiveAccountId();
  const result = useInfiniteQuery<P, ApiError>({
    queryKey: ['acct', accountId, path, query, 'paged'],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api.get<P>(path, { query: { ...query, page: pageParam as number, pageSize }, signal }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? all.length + 1 : undefined;
    },
    enabled: Boolean(accountId),
  });
  const pages = result.data?.pages ?? [];
  return {
    ...result,
    items: pages.flatMap((p) => p.items),
    total: pages[0]?.total ?? 0,
    /** The last page fetched, for fields the API adds next to the items (a count). */
    last: pages.length ? pages[pages.length - 1]! : null,
  };
}
