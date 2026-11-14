import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { AppInfo } from '@/auth/types';

/** What the server says about itself before anyone signs in: test-copy label, feedback link, school code. */
export function useAppInfo() {
  return useQuery<AppInfo>({
    queryKey: ['app-info'],
    queryFn: ({ signal }) => api.get<AppInfo>('/app-info', { auth: 'none', signal }),
    staleTime: 10 * 60_000,
    retry: 1,
  });
}
