export interface NavItem {
  label: string;
  path: string;
  description: string;
  /** Hidden unless the user holds this permission. */
  permission?: string;
}

/** The staff menu. Each page is also protected by a route guard and, above all, by the API. */
export const NAV: NavItem[] = [
  { label: 'Dashboard', path: '/app/dashboard', description: 'Your overview' },
  {
    label: 'Academic setup',
    path: '/app/academic-setup',
    description: 'Academic years, classes, divisions and subjects',
    permission: 'academics.read',
  },
  {
    label: 'Users',
    path: '/app/settings/users',
    description: 'Staff and parent accounts, roles and passwords',
    permission: 'users.manage',
  },
  {
    label: 'School settings',
    path: '/app/settings/school',
    description: 'School name, address and contact details',
    permission: 'settings.manage',
  },
  {
    label: 'Audit log',
    path: '/app/audit-log',
    description: 'Who did what, and when',
    permission: 'audit.read',
  },
];
