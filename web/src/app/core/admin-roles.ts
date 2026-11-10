/** Roles that hold administrative power. Only a Super Admin may give or change them. */
export const ADMIN_ROLE_CODES = ['SUPER_ADMIN', 'SCHOOL_ADMIN'];

/** Keeps admin roles out of a list when the person may not hand them out. */
export function grantableRoles<T extends { code: string }>(
  roles: T[],
  mayManageAdmins: boolean,
): T[] {
  return mayManageAdmins ? roles : roles.filter((r) => !ADMIN_ROLE_CODES.includes(r.code));
}
