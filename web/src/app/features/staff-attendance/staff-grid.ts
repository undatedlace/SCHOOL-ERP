import {
  AttendanceDivisionReport,
  AttendanceStatus,
  StaffAttendanceReport,
  StaffAttendanceRoster,
} from '../../core/models';

/** Shapes a staff report like a division report so the same grid can draw it. */
export function asGridReport(r: StaffAttendanceReport): AttendanceDivisionReport {
  return {
    from: r.from,
    to: r.to,
    daysMarked: r.daysMarked,
    markedDates: r.markedDates,
    students: r.people.map((p) => ({
      ...p,
      studentId: p.staffId,
      admissionNo: p.employeeNo,
      rollNo: null,
    })),
  };
}

export type StaffDrafts = Record<string, { status: AttendanceStatus | null; note: string }>;

/** What each person is marked as now (nothing chosen yet where there is no mark). */
export const staffDraftsFrom = (roster: StaffAttendanceRoster): StaffDrafts =>
  Object.fromEntries(
    roster.staff.map((s) => [s.staffId, { status: s.status, note: s.note ?? '' }]),
  );

/** The marks to save: people with a status chosen whose status or note differs from what is saved. */
export function staffChanges(roster: StaffAttendanceRoster, drafts: StaffDrafts) {
  return roster.staff.flatMap((s) => {
    const d = drafts[s.staffId];
    if (!d?.status) return [];
    const note = d.status === 'PRESENT' ? '' : d.note.trim();
    if (d.status === s.status && note === (s.note ?? '')) return [];
    return [{ staffId: s.staffId, status: d.status, ...(note ? { note } : {}) }];
  });
}
