/**
 * Pure rules for the teacher's notices: who a notice can be written to, the form's checks, and
 * the bodies sent to the API. A teacher may write only to the divisions they teach; the API
 * checks that again and decides who may change or remove a notice (`canChange`).
 */

export type NoticeAudience = 'ALL' | 'STAFF' | 'CLASSES' | 'DIVISIONS';

export const TITLE_MAX = 150;
export const BODY_MAX = 5000;

/** `GET /notices` and `GET /notices/:id` as a staff account receives them. */
export interface StaffNotice {
  id: string;
  title: string;
  /** Plain text, shown exactly as written. */
  body: string;
  audience: NoticeAudience;
  classes: { id: string; name: string }[];
  divisions: { id: string; label: string }[];
  createdBy: { id: string; fullName: string };
  createdAt: string;
  /** "YYYY-MM-DD" or null. */
  expiresOn: string | null;
  expired: boolean;
  canChange: boolean;
}

export interface NoticePage {
  items: StaffNotice[];
  total: number;
  page: number;
  pageSize: number;
}

/** `GET /notices/audiences` */
export interface Audiences {
  canAddressAnyone: boolean;
  classes: { id: string; name: string }[];
  divisions: { id: string; classId: string; label: string }[];
}

export const AUDIENCE_LABEL: Record<NoticeAudience, string> = {
  ALL: 'Everyone',
  STAFF: 'Staff only',
  CLASSES: 'Whole classes',
  DIVISIONS: 'Divisions',
};

/** The audiences this person may choose: a teacher writes to divisions; the office can write to anyone. */
export function audienceChoices(a: Pick<Audiences, 'canAddressAnyone'> | undefined): NoticeAudience[] {
  return a?.canAddressAnyone ? ['ALL', 'STAFF', 'CLASSES', 'DIVISIONS'] : ['DIVISIONS'];
}

/** "Everyone", "Staff only", "Nursery, Std 1" or "Nursery-A, Nursery-B". */
export function audienceSummary(n: Pick<StaffNotice, 'audience' | 'classes' | 'divisions'>): string {
  if (n.audience === 'ALL') return 'Everyone';
  if (n.audience === 'STAFF') return 'Staff only';
  if (n.audience === 'CLASSES') return n.classes.map((c) => c.name).join(', ') || 'Classes';
  return n.divisions.map((d) => d.label).join(', ') || 'Divisions';
}

export interface NoticeDraft {
  title: string;
  body: string;
  audience: NoticeAudience;
  classIds: string[];
  divisionIds: string[];
  /** "YYYY-MM-DD", or "" for no last day. */
  expiresOn: string;
}

export const emptyNoticeDraft = (audience: NoticeAudience = 'DIVISIONS'): NoticeDraft => ({
  title: '',
  body: '',
  audience,
  classIds: [],
  divisionIds: [],
  expiresOn: '',
});

export function draftFromNotice(n: StaffNotice): NoticeDraft {
  return {
    title: n.title,
    body: n.body,
    audience: n.audience,
    classIds: n.classes.map((c) => c.id),
    divisionIds: n.divisions.map((d) => d.id),
    expiresOn: n.expiresOn ?? '',
  };
}

export type NoticeErrors = Partial<Record<'title' | 'body' | 'audience' | 'expiresOn', string>>;

/** What is wrong with a notice before it is sent. `editing` leaves the audience alone (it is not changed on edit). */
export function validateNotice(d: NoticeDraft, today: string, editing: boolean): NoticeErrors {
  const errors: NoticeErrors = {};
  if (!d.title.trim()) errors.title = 'Give the notice a title';
  else if (d.title.trim().length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} letters`;
  if (!d.body.trim()) errors.body = 'Write the notice';
  else if (d.body.trim().length > BODY_MAX) errors.body = `Keep the notice under ${BODY_MAX} letters`;
  if (!editing) {
    if (d.audience === 'DIVISIONS' && d.divisionIds.length === 0) errors.audience = 'Choose at least one class';
    if (d.audience === 'CLASSES' && d.classIds.length === 0) errors.audience = 'Choose at least one class';
  }
  if (d.expiresOn && d.expiresOn < today) errors.expiresOn = 'The last day cannot be in the past';
  return errors;
}

export const hasErrors = (e: object): boolean => Object.keys(e).length > 0;

/** Adds the id if it is not there, takes it out if it is. */
export const toggleId = (ids: readonly string[], id: string): string[] => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/** The body of `POST /notices`. Only the targets of the chosen audience are sent. */
export function createBody(d: NoticeDraft) {
  return {
    title: d.title.trim(),
    body: d.body.trim(),
    audience: d.audience,
    ...(d.audience === 'DIVISIONS' ? { divisionIds: d.divisionIds } : {}),
    ...(d.audience === 'CLASSES' ? { classIds: d.classIds } : {}),
    ...(d.expiresOn ? { expiresOn: d.expiresOn } : {}),
  };
}

/** The body of `PATCH /notices/:id`: the words and the last day. A cleared last day is sent as null. */
export function updateBody(d: NoticeDraft) {
  return { title: d.title.trim(), body: d.body.trim(), expiresOn: d.expiresOn || null };
}

export type NoticeList = 'active' | 'all';

export const LIST_TABS: readonly { value: NoticeList; label: string }[] = [
  { value: 'active', label: 'Showing now' },
  { value: 'all', label: 'Written by me' },
];
