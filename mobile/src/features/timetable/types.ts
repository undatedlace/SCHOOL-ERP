/** The parts of `GET /timetable/divisions` and `GET /timetable/divisions/:id` the app uses. */

export type SlotKind = 'PERIOD' | 'BREAK' | 'ASSEMBLY';

export interface PersonRef {
  id: string;
  fullName: string;
}

export interface SubjectRef {
  id: string;
  name: string;
}

export interface GridRow {
  key: string;
  kind: SlotKind;
  label: string;
  /** "HH:mm", India time. */
  startsAt: string;
  endsAt: string;
  /** ISO weekdays this row runs on: 1 Monday to 6 Saturday. */
  days: number[];
}

export interface GridCell {
  id: string;
  rowKey: string;
  /** ISO weekday, 1 Monday to 6 Saturday. */
  weekday: number;
  subject: SubjectRef | null;
  staff: PersonRef | null;
  room: string | null;
}

export interface GridChange {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  rowKey: string;
  kind: 'SUBSTITUTE' | 'CANCELLED';
  substitute: PersonRef | null;
  subject: SubjectRef | null;
}

export interface WeekDay {
  date: string;
  weekday: number;
  name: string;
  holiday: string | null;
}

export interface DivisionWeek {
  today: string;
  /** The Monday of the week. */
  weekOf: string;
  days: WeekDay[];
  rows: GridRow[];
  cells: GridCell[];
  changes: GridChange[];
  division: { id: string; label: string };
  schedule: { id: string; name: string } | null;
  classTeacher: PersonRef | null;
}

export interface DivisionOption {
  id: string;
  label: string;
  students: PersonRef[];
}
