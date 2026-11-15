/**
 * Pure helpers for the teacher's read-only student list and profile: the list's query, the class
 * and division chips, and the words for what the API sends. A teacher reads every student; what
 * they may see of attendance and results is decided by the API, and the screens only say so
 * quietly when it refuses.
 */
import { dayOf } from '@/lib/dates';

export type StudentStatus = 'ACTIVE' | 'LEFT' | 'REMOVED';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type Relationship = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER';

/** `GET /students` item. */
export interface StudentListItem {
  id: string;
  admissionNo: string;
  fullName: string;
  firstName: string;
  surname: string;
  gender: Gender;
  dateOfBirth: string;
  status: StudentStatus;
  photoFileId: string | null;
  current: {
    academicYear: { id: string; name: string };
    class: { id: string; name: string };
    division: { id: string; name: string };
  } | null;
}

export interface StudentPage {
  items: StudentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** `GET /classes`: a class with its divisions. */
export interface ClassWithDivisions {
  id: string;
  name: string;
  divisions: { id: string; name: string }[];
}

/** `GET /students/:id` (what a teacher receives; there are no documents or admission papers in it). */
export interface StudentProfile {
  id: string;
  admissionNo: string;
  fullName: string;
  firstName: string;
  fatherName: string | null;
  surname: string;
  gender: Gender;
  dateOfBirth: string;
  status: StudentStatus;
  joinedOn: string | null;
  leftOn: string | null;
  hasLogin: boolean;
  schoolEmail: string | null;
  guardians: {
    id: string;
    fullName: string;
    mobile: string | null;
    email: string | null;
    occupation: string | null;
    relationship: Relationship;
    isPrimary: boolean;
    hasLogin: boolean;
  }[];
  enrollments: {
    id: string;
    academicYear: { id: string; name: string };
    class: { id: string; name: string };
    division: { id: string; name: string };
    startedOn: string;
    endedOn: string | null;
  }[];
}

export const GENDER_LABEL: Record<Gender, string> = { MALE: 'Boy', FEMALE: 'Girl', OTHER: 'Other' };
export const RELATIONSHIP_LABEL: Record<Relationship, string> = { FATHER: 'Father', MOTHER: 'Mother', GUARDIAN: 'Guardian', OTHER: 'Other' };

/** "Nursery-A", or a plain line for a student with no class this year. */
export function classLine(s: Pick<StudentListItem, 'current'>): string {
  return s.current ? `${s.current.class.name}-${s.current.division.name}` : 'No class this year';
}

/** The class a division belongs to, for opening the list already narrowed to one division. */
export function classOfDivision(classes: readonly ClassWithDivisions[], divisionId: string | undefined): string {
  if (!divisionId) return 'all';
  return classes.find((c) => c.divisions.some((d) => d.id === divisionId))?.id ?? 'all';
}

export interface ListFilters {
  search: string;
  classId: string;
  divisionId: string;
  status: 'ACTIVE' | 'LEFT';
}

/** The query for `GET /students`: filters that are not set are left out; a division wins over its class. */
export function listQuery(f: ListFilters): Record<string, string> {
  const q: Record<string, string> = { status: f.status };
  const search = f.search.trim();
  if (search.length >= 2) q.search = search;
  if (f.divisionId !== 'all') q.divisionId = f.divisionId;
  else if (f.classId !== 'all') q.classId = f.classId;
  return q;
}

/** "5 years 3 months" from a date of birth, or null when it is not a date. */
export function ageText(dob: string | null | undefined, today: string): string | null {
  const born = dayOf(dob);
  if (!born) return null;
  let months = (Number(today.slice(0, 4)) - Number(born.slice(0, 4))) * 12 + (Number(today.slice(5, 7)) - Number(born.slice(5, 7)));
  if (Number(today.slice(8, 10)) < Number(born.slice(8, 10))) months--;
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} ${years === 1 ? 'year' : 'years'}`;
  return rest === 0 ? y : `${y} ${rest} ${rest === 1 ? 'month' : 'months'}`;
}

/** `tel:` link for a mobile number, keeping only digits and a leading plus; null when there is nothing to dial. */
export function telHref(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  const cleaned = mobile.trim().replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return /\d{6,}/.test(cleaned) ? `tel:${cleaned}` : null;
}

/** Guardians with the primary contact first, then fathers and mothers before others. */
export function orderedGuardians<T extends { isPrimary: boolean; relationship: Relationship }>(guardians: readonly T[]): T[] {
  const rank: Record<Relationship, number> = { FATHER: 0, MOTHER: 1, GUARDIAN: 2, OTHER: 3 };
  return [...guardians].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || rank[a.relationship] - rank[b.relationship]);
}
