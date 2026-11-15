import { useApiQuery } from '@/api';
import type { DivisionOption } from './rosterLogic';

/** `GET /attendance/overview?date=`: how far each of my divisions has got on a day. */
export interface OverviewDivision {
  id: string;
  name: string;
  class: { id: string; name: string };
  enrolled: number;
  marked: number;
  counts: { present: number; absent: number; late: number; onLeave: number };
  done: boolean;
}

export interface Overview {
  date: string;
  divisions: OverviewDivision[];
}

/** The divisions I can take attendance for (the API decides: those I teach this year). */
export function useMyDivisions() {
  return useApiQuery<DivisionOption[]>('/attendance/divisions', { staleTime: 5 * 60_000 });
}

/** Register state of each of my divisions on a day. */
export function useOverview(date: string, enabled = true) {
  return useApiQuery<Overview>('/attendance/overview', { query: { date }, enabled, staleTime: 30_000 });
}
