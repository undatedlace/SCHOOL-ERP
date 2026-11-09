export interface FilePurpose {
  /** Permission to upload for this purpose. */
  write: string;
  /** Permission to view files of this purpose. */
  read: string;
  maxBytes: number;
  /** 'image': photographs only. 'document': a PDF or a picture of a paper. */
  kind: 'image' | 'document';
}

const MB = 1024 * 1024;

/**
 * Every file is uploaded for a purpose, and the purpose decides who may add
 * and who may see it. New kinds of file (for example, report cards) are added here.
 */
export const FILE_PURPOSES: Record<string, FilePurpose> = {
  'staff-photo': {
    write: 'staff.manage',
    read: 'staff.read',
    maxBytes: 5 * MB,
    kind: 'image',
  },
  'application-photo': {
    write: 'admissions.manage',
    read: 'admissions.read',
    maxBytes: 5 * MB,
    kind: 'image',
  },
  // Birth certificates and the like. Staff only: a parent does not see the school's paperwork.
  'student-document': {
    write: 'students.manage',
    read: 'students.read_all',
    maxBytes: 10 * MB,
    kind: 'document',
  },
};

export const MAX_UPLOAD_BYTES = Math.max(
  ...Object.values(FILE_PURPOSES).map((p) => p.maxBytes),
);
