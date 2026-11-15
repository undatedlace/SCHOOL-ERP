import type { MeResponse, RoleKind } from './types';

const FAMILY_ROLES = new Set(['STUDENT', 'PARENT']);

/**
 * Which tabs an account gets:
 * - a student or parent account (only those roles) -> family tabs;
 * - an account that may take attendance (`attendance.mark`) or enter marks (`marks.enter`) -> teacher tabs;
 * - anything else (office, accountant, other staff) -> "use the web app".
 * The server still decides what each call may do; this only picks the screens.
 */
export function roleKindFromMe(me: Pick<MeResponse, 'roles' | 'permissions'>): RoleKind {
  if (me.roles.length > 0 && me.roles.every((r) => FAMILY_ROLES.has(r))) return 'family';
  if (me.permissions.includes('attendance.mark') || me.permissions.includes('marks.enter')) {
    return 'teacher';
  }
  return 'other';
}

const titleCase = (code: string) =>
  code
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** "Student", "Parent", "Teacher", "Office Staff"... */
export function roleLabelFromMe(me: Pick<MeResponse, 'roles'>, kind: RoleKind): string {
  if (me.roles.includes('STUDENT')) return 'Student';
  if (me.roles.includes('PARENT')) return 'Parent';
  if (kind === 'teacher') return 'Teacher';
  return me.roles[0] ? titleCase(me.roles[0]) : 'Staff';
}
