import { useApiQuery } from '@/api';
import type { TeacherWeek } from './teacherDay';

/** The signed-in teacher's own week: their lessons in every class, covers and cancellations. */
export function useTeacherWeek(weekOf: string) {
  return useApiQuery<TeacherWeek>('/timetable/mine', { query: { weekOf }, staleTime: 60_000, refetchInterval: 5 * 60_000 });
}
