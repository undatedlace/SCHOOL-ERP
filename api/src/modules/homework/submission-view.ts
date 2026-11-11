import { Prisma } from '../../generated/prisma/client.js';
import { toIso, todayInIndia } from '../attendance/attendance-rules.js';

export const SUBMISSION_INCLUDE = {
  files: {
    include: {
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.HomeworkSubmissionInclude;

export type SubmissionRow = Prisma.HomeworkSubmissionGetPayload<{
  include: typeof SUBMISSION_INCLUDE;
}>;

export interface FileView {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export const fileView = (f: {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}): FileView => ({
  id: f.id,
  name: f.originalName,
  mimeType: f.mimeType,
  sizeBytes: f.sizeBytes,
});

/** A hand-in as people see it. `late` means it was handed in after the due day (India time). */
export function submissionView(s: SubmissionRow, dueOn: Date | null) {
  const due = dueOn ? toIso(dueOn) : null;
  return {
    id: s.id,
    studentId: s.studentId,
    status: s.status,
    note: s.note,
    submittedAt: s.submittedAt,
    late: due !== null && todayInIndia(s.submittedAt) > due,
    files: s.files.map((f) => fileView(f.file)),
    marks: s.marks === null ? null : s.marks.toString(),
    feedback: s.feedback,
    reviewedAt: s.reviewedAt,
  };
}
export type SubmissionView = ReturnType<typeof submissionView>;
