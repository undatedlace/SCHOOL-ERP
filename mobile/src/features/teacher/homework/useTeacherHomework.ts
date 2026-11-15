import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { api, useApiQuery } from '@/api';
import { useActiveAccountId } from '@/auth';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { statsFromRoster, type HomeworkStats } from './homeworkLogic';
import type { HandInRoster, TeacherHomework, TeacherHomeworkPage } from './types';

/** The most hand-in rosters fetched for the lists (the newest tasks that take work in). */
const MAX_ROSTERS = 50;

/**
 * Everything the teacher has set, with how much of each is handed in and marked.
 *
 * The list endpoint does not say how many students handed in, so each task that takes hand-ins
 * has its roster (`GET /homework/:id/hand-ins`) fetched too. They share the cache with the detail
 * screen, so opening a task shows it at once.
 */
export function useTeacherHomework() {
  const accountId = useActiveAccountId();
  const client = useQueryClient();
  const list = useApiQuery<TeacherHomeworkPage>('/homework', { query: { status: 'all', page: 1, pageSize: 100 } });

  const items: TeacherHomework[] = useMemo(() => list.data?.items ?? [], [list.data]);
  const withHandIn = useMemo(
    () =>
      items
        .filter((h) => h.handIn)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, MAX_ROSTERS),
    [items],
  );

  const rosters = useQueries({
    queries: withHandIn.map((h) => ({
      queryKey: ['acct', accountId, `/homework/${h.id}/hand-ins`, null],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.get<HandInRoster>(`/homework/${h.id}/hand-ins`, { signal }),
      enabled: Boolean(accountId),
      staleTime: 30_000,
    })),
  });

  const stats = useMemo(() => {
    const map = new Map<string, HomeworkStats>();
    withHandIn.forEach((h, i) => {
      const roster = rosters[i]?.data;
      if (roster) map.set(h.id, statsFromRoster(roster));
    });
    return map;
    // `rosters` is a new array every render; the times its data last changed are what matter.
  }, [withHandIn, rosters.map((r) => r.dataUpdatedAt).join(',')]);

  const rostersLoading = rosters.some((r) => r.isLoading);
  const refetch = useCallback(() => invalidatePrefix(client, '/homework'), [client]);

  return {
    list,
    items,
    stats,
    rostersLoading,
    isLoading: list.isLoading,
    isError: list.isError,
    error: list.error,
    isRefetching: list.isRefetching || rosters.some((r) => r.isRefetching),
    refetch,
  };
}
