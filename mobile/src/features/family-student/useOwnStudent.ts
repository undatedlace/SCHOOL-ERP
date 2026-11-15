import { useApiQuery } from '@/api';

/** The row of `GET /students` that matters here. */
export interface OwnStudent {
  id: string;
  admissionNo: string;
  fullName: string;
  firstName: string;
  status: string;
  photoFileId: string | null;
  current: {
    academicYear: { id: string; name: string };
    class: { id: string; name: string };
    division: { id: string; name: string };
  } | null;
}

interface StudentPage {
  items: OwnStudent[];
}

/**
 * The student this account belongs to. A family account is a student's own login, so the API
 * lists just that one student; the app never picks a student id for itself.
 */
export function useOwnStudent() {
  return useApiQuery<StudentPage, OwnStudent | null>('/students', {
    query: { page: 1, pageSize: 5 },
    staleTime: 5 * 60_000,
    select: (page) => page.items.find((s) => s.status === 'ACTIVE') ?? page.items[0] ?? null,
  });
}
