import { useApiQuery } from '@/api';
import type { DivisionOption, DivisionWeek } from './types';

/**
 * A class week for the signed-in family account. The API lists the divisions the account may
 * open (a student's own class), then sends that division's week; the app never picks an id itself.
 *
 * `week` is null when the account has no class this year, undefined while loading.
 */
export function useClassWeek(weekOf: string) {
  const divisions = useApiQuery<DivisionOption[]>('/timetable/divisions', { staleTime: 5 * 60_000 });
  const divisionId = divisions.data?.[0]?.id ?? null;
  const week = useApiQuery<DivisionWeek>(`/timetable/divisions/${divisionId ?? 'none'}`, {
    query: { weekOf },
    enabled: divisionId !== null,
    refetchInterval: 5 * 60_000,
  });

  const noClass = divisions.isSuccess && divisionId === null;
  return {
    week: noClass ? null : week.data,
    isLoading: divisions.isLoading || (divisionId !== null && week.isLoading),
    isError: divisions.isError || week.isError,
    error: divisions.error ?? week.error,
    isFetching: divisions.isFetching || week.isFetching,
    noClass,
    refetch: () => Promise.all([divisions.refetch(), divisionId ? week.refetch() : Promise.resolve()]),
  };
}
