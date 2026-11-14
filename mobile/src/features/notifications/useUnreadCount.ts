import { useApiQuery } from '@/api/hooks';

/** How many notifications the signed-in account has not read. Checked every minute. */
export function useUnreadCount(): number {
  const { data } = useApiQuery<{ unread: number }, number>('/notifications/unread-count', {
    refetchInterval: 60_000,
    select: (r) => r.unread,
  });
  return data ?? 0;
}
