import { AttendanceRoster, AttendanceStatus, AttendanceSummary } from '../../core/models';

export const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LATE', label: 'Late' },
  { value: 'ON_LEAVE', label: 'Leave' },
];

export const statusLabel = (s: AttendanceStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;

/** What the teacher has chosen so far, by student. */
export type Drafts = Record<string, { status: AttendanceStatus | null; note: string }>;

export const draftsFrom = (roster: AttendanceRoster): Drafts =>
  Object.fromEntries(
    roster.students.map((s) => [s.studentId, { status: s.status, note: s.note ?? '' }]),
  );

/** The students whose mark differs from what is saved: only these are sent. */
export function changes(roster: AttendanceRoster, drafts: Drafts) {
  const out: { studentId: string; status: AttendanceStatus; note?: string }[] = [];
  for (const s of roster.students) {
    const d = drafts[s.studentId];
    if (!d?.status) continue;
    const note = d.note.trim();
    if (d.status === s.status && note === (s.note ?? '')) continue;
    out.push({ studentId: s.studentId, status: d.status, ...(note ? { note } : {}) });
  }
  return out;
}

export const unmarkedCount = (roster: AttendanceRoster, drafts: Drafts) =>
  roster.students.filter((s) => !drafts[s.studentId]?.status).length;

/** "92.5%", or a dash before anything has been counted. */
export const percentText = (s: Pick<AttendanceSummary, 'percent'>) =>
  s.percent === null ? '-' : `${s.percent}%`;

/** Below this a child's attendance is called out. */
export const LOW_PERCENT = 75;
export const isLow = (s: Pick<AttendanceSummary, 'percent'>) =>
  s.percent !== null && s.percent < LOW_PERCENT;
