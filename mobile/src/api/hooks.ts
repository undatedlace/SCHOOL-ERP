import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { api, type QueryValue } from './client';
import { useActiveAccountId } from '@/auth/AuthProvider';
import type { ApiError } from './errors';

interface ApiQueryOptions<T, S> {
  query?: Record<string, QueryValue>;
  enabled?: boolean;
  select?: (data: T) => S;
  staleTime?: number;
  refetchInterval?: number | false;
  placeholderData?: UseQueryOptions<T, ApiError, S>['placeholderData'];
}

/**
 * A GET request as a cached query. The cache key includes the signed-in account, so one
 * account's data can never show up under another.
 *
 *   const { data, isLoading, error, refetch } = useApiQuery<Notice[]>('/notices', { query: { page: 1 } });
 */
export function useApiQuery<T, S = T>(
  path: string,
  options: ApiQueryOptions<T, S> = {},
): UseQueryResult<S, ApiError> {
  const accountId = useActiveAccountId();
  return useQuery<T, ApiError, S>({
    queryKey: ['acct', accountId, path, options.query ?? null],
    queryFn: ({ signal }) => api.get<T>(path, { query: options.query, signal }),
    enabled: Boolean(accountId) && (options.enabled ?? true),
    select: options.select,
    staleTime: options.staleTime,
    refetchInterval: options.refetchInterval,
    placeholderData: options.placeholderData,
  });
}
