export interface NavItem {
  label: string;
  path: string;
  description: string;
  /** Hidden unless the user holds this permission. */
  permission?: string;
}

/** A sidebar entry: a single link (`item`) or a group that opens to show its pages (`items`). */
export interface NavEntry {
  label: string;
  icon: string;
  section: 'menu' | 'other';
  /** Set for a single link. */
  item?: NavItem;
  /** Set for a group; the group is hidden when the user may open none of its pages. */
  items?: NavItem[];
}

const dashboard: NavItem = {
  label: 'Dashboard',
  path: '/app/dashboard',
  description: 'Your overview',
};
const calendar: NavItem = {
  label: 'Calendar',
  path: '/app/calendar',
  description: 'School events, holidays and exams, and what is coming up',
  permission: 'calendar.read',
};
const academicSetup: NavItem = {
  label: 'Academic setup',
  path: '/app/academic-setup',
  description: 'Academic years, classes, divisions and subjects',
  permission: 'academics.read',
};
const admissions: NavItem = {
  label: 'Applications',
  path: '/app/admissions',
  description: 'Admission applications and decisions',
  permission: 'admissions.read',
};
const forms: NavItem = {
  label: 'Admission form',
  path: '/app/settings/forms',
  description: 'Change the questions on the admission form',
  permission: 'forms.manage',
};
const students: NavItem = {
  label: 'All students',
  path: '/app/students',
  description: 'Enrolled students, their classes and families',
  permission: 'students.read',
};
const promotion: NavItem = {
  label: 'Year-end promotion',
  path: '/app/promotion',
  description: 'Move each class into the next academic year',
  permission: 'students.promote',
};
const staff: NavItem = {
  label: 'All staff',
  path: '/app/staff',
  description: 'Teachers and other staff, their joining and leaving dates',
  permission: 'staff.read_all',
};
const attendance: NavItem = {
  label: 'Attendance',
  path: '/app/attendance',
  description: 'Mark the day for a division, and see attendance totals',
  permission: 'attendance.read',
};
const feeDues: NavItem = {
  label: 'Fee dues',
  path: '/app/fees/dues',
  description: 'Who owes what, by class and student',
  permission: 'fees.read_all',
};
const feeCollection: NavItem = {
  label: 'Fee collection',
  path: '/app/fees/collection',
  description: 'Money received today or between two dates, with receipts',
  permission: 'fees.read_all',
};
const feeSetup: NavItem = {
  label: 'Fee setup',
  path: '/app/fees/setup',
  description: 'Kinds of fee, what each class pays, and when',
  permission: 'fees.read_all',
};
const notices: NavItem = {
  label: 'Notices',
  path: '/app/notices',
  description: 'Messages from the school to staff, parents and students',
  permission: 'notices.read',
};
const users: NavItem = {
  label: 'Users',
  path: '/app/settings/users',
  description: 'Staff and parent accounts, roles and passwords',
  permission: 'users.manage',
};
const schoolSettings: NavItem = {
  label: 'School settings',
  path: '/app/settings/school',
  description: 'School name, address and contact details',
  permission: 'settings.manage',
};
const auditLog: NavItem = {
  label: 'Audit log',
  path: '/app/audit-log',
  description: 'Who did what, and when',
  permission: 'audit.read',
};

/** The staff menu, grouped. Each page is also protected by a route guard and, above all, by the API. */
export const NAV_ENTRIES: NavEntry[] = [
  { label: 'Dashboard', icon: 'home', section: 'menu', item: dashboard },
  { label: 'Calendar', icon: 'calendar', section: 'menu', item: calendar },
  { label: 'Admissions', icon: 'clipboard', section: 'menu', items: [admissions, forms] },
  { label: 'Students', icon: 'students', section: 'menu', items: [students, promotion] },
  { label: 'Staff', icon: 'teachers', section: 'menu', items: [staff] },
  { label: 'Attendance', icon: 'attendance', section: 'menu', item: attendance },
  { label: 'Academics', icon: 'book', section: 'menu', items: [academicSetup] },
  { label: 'Finance', icon: 'finance', section: 'menu', items: [feeDues, feeCollection, feeSetup] },
  { label: 'Notices', icon: 'notice', section: 'menu', item: notices },
  {
    label: 'Settings',
    icon: 'settings',
    section: 'other',
    items: [schoolSettings, users, auditLog],
  },
];

/** Every page, flat (used for the dashboard shortcuts). */
export const NAV: NavItem[] = NAV_ENTRIES.flatMap((e) => (e.item ? [e.item] : (e.items ?? [])));

/** The entries a user may see: pages they may not open are dropped, and so are empty groups. */
export function visibleEntries(
  entries: NavEntry[],
  has: (permission: string) => boolean,
): NavEntry[] {
  const ok = (i: NavItem) => !i.permission || has(i.permission);
  return entries.flatMap((e) => {
    if (e.item) return ok(e.item) ? [e] : [];
    const items = (e.items ?? []).filter(ok);
    return items.length ? [{ ...e, items }] : [];
  });
}
