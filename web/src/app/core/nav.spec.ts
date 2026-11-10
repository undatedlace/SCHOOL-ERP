import { NAV, NAV_ENTRIES, visibleEntries } from './nav';

const has =
  (...permissions: string[]) =>
  (p: string) =>
    permissions.includes(p);

describe('visibleEntries', () => {
  it('shows a group only with the pages the person may open', () => {
    const entries = visibleEntries(NAV_ENTRIES, has('fees.read_all'));
    const finance = entries.find((e) => e.label === 'Finance');
    expect(finance?.items?.map((i) => i.label)).toEqual([
      'Fee dues',
      'Fee collection',
      'Fee setup',
    ]);
    // Dashboard has no permission, so everyone gets it.
    expect(entries.some((e) => e.label === 'Dashboard')).toBe(true);
  });

  it('drops a group with no openable page', () => {
    const labels = visibleEntries(NAV_ENTRIES, has()).map((e) => e.label);
    expect(labels).toEqual(['Dashboard']);
  });

  it('keeps single links as links and groups as groups', () => {
    const entries = visibleEntries(NAV_ENTRIES, has('calendar.read', 'students.read'));
    expect(entries.find((e) => e.label === 'Calendar')?.item?.path).toBe('/app/calendar');
    const students = entries.find((e) => e.label === 'Students');
    expect(students?.items?.map((i) => i.label)).toEqual(['All students']);
  });

  it('shows the calendar to anyone who may read it', () => {
    const entries = visibleEntries(NAV_ENTRIES, has('calendar.read'));
    expect(entries.map((e) => e.label)).toEqual(['Dashboard', 'Calendar']);
  });

  it('lists every page once for the dashboard shortcuts', () => {
    const paths = NAV.map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('/app/calendar');
  });

  it('groups attendance: students for teachers, staff for admin and office, "My attendance" for staff only', () => {
    const titles = (...p: string[]) =>
      visibleEntries(NAV_ENTRIES, has(...p))
        .find((e) => e.label === 'Attendance')
        ?.items?.map((i) => i.label);
    // A teacher: students' attendance and their own.
    expect(titles('attendance.read', 'staff_attendance.read')).toEqual([
      'Students',
      'My attendance',
    ]);
    // Admin and office hold the wider permission, so their own page is hidden.
    expect(titles('attendance.read', 'staff_attendance.read', 'staff_attendance.read_all')).toEqual(
      ['Students', 'Staff'],
    );
    // A parent sees the portal, not this menu.
    expect(titles('calendar.read')).toBeUndefined();
  });

  it('shows leave to the people it is for: requests for admins, "My leave" for staff, set-up under Settings', () => {
    const staff = (...p: string[]) =>
      visibleEntries(NAV_ENTRIES, has(...p))
        .find((e) => e.label === 'Staff')
        ?.items?.map((i) => i.label);
    expect(staff('leave.apply')).toEqual(['My leave']);
    expect(staff('leave.apply', 'leave.manage')).toEqual(['Leave requests']);
    const settings = visibleEntries(NAV_ENTRIES, has('leave.manage'))
      .find((e) => e.label === 'Settings')
      ?.items?.map((i) => i.label);
    expect(settings).toEqual(['Leave']);
  });
});
