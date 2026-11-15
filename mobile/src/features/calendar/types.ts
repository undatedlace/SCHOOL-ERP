/** `GET /calendar?from=&to=` returns a plain array of these. */
export type CalendarCategory = 'EVENT' | 'HOLIDAY' | 'EXAM' | 'MEETING';

export interface CalendarEvent {
  id: string;
  title: string;
  /** Plain text. */
  description: string | null;
  category: CalendarCategory;
  /** "YYYY-MM-DD", inclusive. */
  startsOn: string;
  endsOn: string;
  /** "HH:mm" in India time, or null for an all-day event. */
  startTime: string | null;
  endTime: string | null;
  audience: 'ALL' | 'STAFF' | 'CLASSES' | 'DIVISIONS';
}
