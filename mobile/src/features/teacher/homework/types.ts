/** `GET /homework`, `GET /homework/:id`, `GET /homework/:id/hand-ins` and `GET /homework/audiences` as a teacher receives them. */
import type { Homework, Submission } from '@/features/homework/types';

export type { Submission, SubmissionStatus, HomeworkFile } from '@/features/homework/types';

export interface TeacherHomework extends Homework {
  divisions: { id: string; label: string }[];
  students: { id: string; name: string }[];
  /** The author, or an administrator: may change and remove it. */
  canChange: boolean;
}

export interface TeacherHomeworkPage {
  items: TeacherHomework[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HandInEntry {
  studentId: string;
  name: string;
  admissionNo: string;
  division: string;
  submission: Submission | null;
}

export interface HandInRoster {
  handIn: boolean;
  maxMarks: string | null;
  counts: { students: number; handedIn: number; marked: number };
  students: HandInEntry[];
}

export interface Audiences {
  divisions: { id: string; classId: string; label: string }[];
}
