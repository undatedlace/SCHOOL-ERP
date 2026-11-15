/** `GET /notices` and `GET /notices/:id` as a family account receives them. */
export interface Notice {
  id: string;
  title: string;
  /** Plain text, shown exactly as written. */
  body: string;
  audience: 'ALL' | 'STAFF' | 'CLASSES' | 'DIVISIONS';
  createdBy: { id: string; fullName: string };
  /** A moment (ISO). */
  createdAt: string;
  /** The last day it shows, "YYYY-MM-DD", or null. */
  expiresOn: string | null;
}
