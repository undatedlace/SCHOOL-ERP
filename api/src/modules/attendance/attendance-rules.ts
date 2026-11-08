/**
 * Pure rules for attendance: dates and the percentage. No clock or database in here
 * (the caller passes "today"), so they are easy to test.
 */

export type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'ON_LEAVE';

/** A teacher may mark or correct a day this many days back. Only the admin may go further. */
export const TEACHER_EDIT_DAYS = 7;

/** The longest report range, in days. */
export const MAX_RANGE_DAYS = 366;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written "YYYY-MM-DD" (so 2026-02-30 is not). */
export function isIsoDate(value: string): boolean {
  const m = ISO.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return (
    d.getUTCFullYear() === +m[1] &&
    d.getUTCMonth() === +m[2] - 1 &&
    d.getUTCDate() === +m[3]
  );
}

/** A date at midnight UTC, which is how Postgres DATE columns are read and written. */
export const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export const toIso = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export const daysBetween = (fromIso: string, toIsoDate: string) =>
  Math.round(
    (toDate(toIsoDate).getTime() - toDate(fromIso).getTime()) / 86400000,
  );

/** Today's date in India, whatever time zone the server runs in. */
export function todayInIndia(now: Date = new Date()): string {
  return toIso(new Date(now.getTime() + 330 * 60_000));
}

export interface Counts {
  present: number;
  absent: number;
  late: number;
  onLeave: number;
}

export const emptyCounts = (): Counts => ({
  present: 0,
  absent: 0,
  late: 0,
  onLeave: 0,
});

export function tally(statuses: Iterable<Status>): Counts {
  const c = emptyCounts();
  for (const s of statuses) {
    if (s === 'PRESENT') c.present++;
    else if (s === 'ABSENT') c.absent++;
    else if (s === 'LATE') c.late++;
    else c.onLeave++;
  }
  return c;
}

export interface Summary extends Counts {
  /** Days that were marked at all. */
  markedDays: number;
  /** Days that count towards the percentage: every marked day except approved leave. */
  countedDays: number;
  /** Present or late. */
  attendedDays: number;
  /** attended / counted as a percentage with one decimal; null when nothing counts yet. */
  percent: number | null;
}

/**
 * Present and late count as attended. Approved leave is left out of both sides, so a child
 * on leave is not penalised. 18 attended of 20 counted days is 90.0%.
 */
export function summarise(counts: Counts): Summary {
  const attendedDays = counts.present + counts.late;
  const countedDays = attendedDays + counts.absent;
  return {
    ...counts,
    markedDays: countedDays + counts.onLeave,
    countedDays,
    attendedDays,
    percent:
      countedDays === 0
        ? null
        : Math.round((attendedDays * 1000) / countedDays) / 10,
  };
}
