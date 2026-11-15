import { useApiQuery } from '@/api';
import { useMyStudent } from '@/features/mystudent/useMyStudent';
import { addDays } from '@/lib/dates';
import type { CalendarEvent, FeeLedger, HomeworkItem } from './homeLogic';

interface Page<T> {
  items: T[];
  total: number;
}

export interface NoticeItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  createdBy: { id: string; fullName: string };
}

/** Open homework (not past its due day) for the signed-in student. */
export function useHomeHomework() {
  return useApiQuery<Page<HomeworkItem>, HomeworkItem[]>('/homework', {
    query: { pageSize: 100 },
    select: (page) => page.items,
  });
}

/** The three newest notices that are still showing. */
export function useHomeNotices() {
  return useApiQuery<Page<NoticeItem>, NoticeItem[]>('/notices', {
    query: { pageSize: 3 },
    select: (page) => page.items,
  });
}

/** Events touching the next 60 days. */
export function useHomeEvents(today: string) {
  return useApiQuery<CalendarEvent[]>('/calendar', { query: { from: today, to: addDays(today, 60) } });
}

/** The fee ledger of the signed-in student. */
export function useHomeFees() {
  const student = useMyStudent();
  const studentId = student.data?.id ?? null;
  const ledger = useApiQuery<FeeLedger>(`/students/${studentId ?? 'none'}/fees`, { enabled: studentId !== null });
  return {
    data: ledger.data,
    isLoading: student.isLoading || (studentId !== null && ledger.isLoading),
    isError: student.isError || ledger.isError,
    error: student.error ?? ledger.error,
    isFetching: ledger.isFetching,
    refetch: () => (studentId ? ledger.refetch() : student.refetch()),
  };
}
