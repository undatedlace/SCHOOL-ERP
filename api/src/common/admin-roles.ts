/** Roles that hold administrative power over the school. */
export const ADMIN_ROLES = ['SUPER_ADMIN', 'SCHOOL_ADMIN'] as const;

/** The one role that must always have an active holder. */
export const TOP_ROLE = 'SUPER_ADMIN';

/** Whether any of these role codes is an admin role. */
export const hasAdminRole = (codes: readonly string[]): boolean =>
  codes.some((c) => (ADMIN_ROLES as readonly string[]).includes(c));

/** Permission that allows creating, changing or resetting admin accounts and giving admin roles. */
export const ADMINS_MANAGE = 'admins.manage';
