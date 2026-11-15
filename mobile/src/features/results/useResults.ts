import { useApiQuery } from '@/api';
import { useMyStudent } from '@/features/mystudent/useMyStudent';
import type { StudentResults } from './resultsLogic';

/** Published results for the signed-in student (this academic year). Home and Results share it. */
export function useResults() {
  const student = useMyStudent();
  const studentId = student.data?.id ?? null;
  const results = useApiQuery<StudentResults>(`/results/students/${studentId ?? 'none'}`, {
    enabled: studentId !== null,
  });
  return {
    data: results.data,
    isLoading: student.isLoading || (studentId !== null && results.isLoading),
    isError: student.isError || results.isError,
    error: student.error ?? results.error,
    isFetching: student.isFetching || results.isFetching,
    noStudent: student.isSuccess && studentId === null,
    refetch: () => Promise.all([student.refetch(), studentId ? results.refetch() : Promise.resolve()]),
  };
}
