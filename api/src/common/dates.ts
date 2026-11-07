/**
 * The school's time zone. Dates such as "received on" mean a calendar day in
 * India, not in UTC. Move this to school settings when a second school is added.
 */
export const SCHOOL_TIME_ZONE = 'Asia/Kolkata';

/** Today's calendar date in the school's time zone, as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** A "YYYY-MM-DD" string as a Date for a @db.Date column. */
export const dateOnly = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
