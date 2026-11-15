import { useApiQuery } from '@/api';
import { useMyStudent } from '@/features/mystudent/useMyStudent';
import type { AttendanceHistory } from './attendanceLogic';

/**
 * The signed-in student's attendance from the start of the school year up to `today`.
 * Home and the Attendance screen share this one request (same cache entry).
 */
export function useAttendance(today: string) {
  const student = useMyStudent();
  const studentId = student.data?.id ?? null;
  const history = useApiQuery<AttendanceHistory>(`/attendance/students/${studentId ?? 'none'}`, {
    query: { to: today },
    enabled: studentId !== null,
  });
  return {
    data: history.data,
    isLoading: student.isLoading || (studentId !== null && history.isLoading),
    isError: student.isError || history.isError,
    error: student.error ?? history.error,
    isFetching: student.isFetching || history.isFetching,
    noStudent: student.isSuccess && studentId === null,
    refetch: () => Promise.all([student.refetch(), studentId ? history.refetch() : Promise.resolve()]),
  };
}
