/** Small pure helpers for the dashboard numbers. */

/** "2026-04" for each month from the start date to the end date, inclusive. */
export function monthsBetween(startIso: string, endIso: string): string[] {
  let [y, m] = startIso.slice(0, 7).split('-').map(Number);
  const [ey, em] = endIso.slice(0, 7).split('-').map(Number);
  const out: string[] = [];
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** How much a number changed against the one before it, as a whole-number percent. Null when there is nothing to compare with. */
export function changePercent(
  now: number,
  before: number | null | undefined,
): number | null {
  if (before === null || before === undefined || before === 0) return null;
  return Math.round(((now - before) * 100) / before);
}
