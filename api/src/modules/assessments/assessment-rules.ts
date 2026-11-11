/** Pure rules for tests and results (no database), so they are easy to test. */

export interface MarkLike {
  marks: number | null;
  absent: boolean;
}

/** Marks as a percentage of the maximum, to one decimal place; null for absent or not marked. */
export function percentOf(marks: number | null, max: number): number | null {
  if (marks === null || max <= 0) return null;
  return Math.round((marks / max) * 1000) / 10;
}

export interface Stats {
  /** Students with marks or marked absent. */
  entered: number;
  /** Students with marks counted in the average. */
  scored: number;
  absent: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
}

/** Class statistics over the marks of those who sat the test (absent students are left out of the average). */
export function statsOf(rows: MarkLike[]): Stats {
  const scores = rows.flatMap((r) =>
    !r.absent && r.marks !== null ? [r.marks] : [],
  );
  const absent = rows.filter((r) => r.absent).length;
  const sum = scores.reduce((a, b) => a + b, 0);
  return {
    entered: scores.length + absent,
    scored: scores.length,
    absent,
    average: scores.length ? Math.round((sum / scores.length) * 10) / 10 : null,
    highest: scores.length ? Math.max(...scores) : null,
    lowest: scores.length ? Math.min(...scores) : null,
  };
}

export interface MarkProblem {
  studentId: string;
  message: string;
}

/** What is wrong with a marks entry against the maximum, or null. Absent wins over marks. */
export function markProblem(
  e: { marks?: number | null; absent?: boolean },
  max: number,
): string | null {
  if (e.absent && e.marks !== undefined && e.marks !== null) {
    return 'A student marked absent cannot also have marks';
  }
  if (e.marks !== undefined && e.marks !== null && e.marks > max) {
    return `Marks cannot be more than ${max}`;
  }
  return null;
}
