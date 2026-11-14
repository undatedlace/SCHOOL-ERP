import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './errors';

/**
 * Cache in memory only. Nothing about a child is ever written to disk: there is no persister
 * here and there must not be one. The cache is cleared whenever the account changes.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          // A "no" from the server will not change on a retry; a dropped connection might.
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

export const queryClient = createQueryClient();
