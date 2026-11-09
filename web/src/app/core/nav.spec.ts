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
    const entries = visibleEntries(NAV_ENTRIES, has('attendance.read', 'students.read'));
    expect(entries.find((e) => e.label === 'Attendance')?.item?.path).toBe('/app/attendance');
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
});
