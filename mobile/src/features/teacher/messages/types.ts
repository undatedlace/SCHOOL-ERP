/** `GET /messages/contacts?as=teacher`: the students of the divisions a teacher teaches this year. */
export interface StudentContact {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string;
  divisionId: string;
  divisionName: string;
  photoFileId: string | null;
}

export interface StudentContacts {
  kind: 'teacher';
  items: StudentContact[];
  total: number;
  page: number;
  pageSize: number;
}

/** "Nursery-A · DS0003" */
export const studentLine = (s: Pick<StudentContact, 'className' | 'divisionName' | 'admissionNo'>): string =>
  `${s.className}-${s.divisionName} · ${s.admissionNo}`;
