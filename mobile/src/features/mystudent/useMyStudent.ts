import { useApiQuery } from '@/api';

/** The parts of `GET /students` that the family screens use. */
export interface MyStudent {
  id: string;
  fullName: string;
  firstName: string;
  surname: string;
  admissionNo: string;
  photoFileId: string | null;
  current: {
    academicYear: { id: string; name: string };
    class: { name: string };
    division: { id: string; name: string };
  } | null;
}

interface StudentPage {
  items: MyStudent[];
}

/**
 * The signed-in family account's student. The API scopes `/students` to what the token may see,
 * so for a student's login this is exactly one child (the same call the account pill uses).
 * The app never chooses a student for itself.
 */
export function useMyStudent() {
  return useApiQuery<StudentPage, MyStudent | null>('/students', {
    query: { page: 1, pageSize: 1 },
    select: (page) => page.items[0] ?? null,
    staleTime: 5 * 60_000,
  });
}
