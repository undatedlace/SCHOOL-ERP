/** `GET /homework` and `GET /homework/:id` as a family account receives them. */

export type SubmissionStatus = 'SUBMITTED' | 'REVIEWED' | 'REDO';

export interface HomeworkFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface Submission {
  id: string;
  studentId: string;
  status: SubmissionStatus;
  note: string | null;
  submittedAt: string;
  /** Handed in after the due day (India time). */
  late: boolean;
  files: HomeworkFile[];
  /** Marks as text ("8.00"), or null when the teacher gave none. */
  marks: string | null;
  /** The teacher's comment, or the reason it was sent back. */
  feedback: string | null;
  reviewedAt: string | null;
}

export interface HomeworkChild {
  studentId: string;
  name: string;
  submission: Submission | null;
}

export interface Homework {
  id: string;
  title: string;
  /** Plain text. */
  instructions: string;
  subject: { id: string; name: string } | null;
  /** "YYYY-MM-DD" or null. */
  dueOn: string | null;
  overdue: boolean;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  /** Whether students hand work in through the app. */
  handIn: boolean;
  /** Marks are out of this ("10.00"), when hand-in is on. */
  maxMarks: string | null;
  attachments: HomeworkFile[];
  children: HomeworkChild[];
  forChildren: string[];
}

export interface HomeworkPage {
  items: Homework[];
  total: number;
  page: number;
  pageSize: number;
}
