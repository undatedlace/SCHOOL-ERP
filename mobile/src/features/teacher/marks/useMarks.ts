import { useApiQuery } from '@/api';
import type { TestOptions } from './marksLogic';

/** `GET /assessments/options`: the classes and subjects this teacher may set a test for. */
export function useTestOptions() {
  return useApiQuery<TestOptions>('/assessments/options', { staleTime: 5 * 60_000 });
}
