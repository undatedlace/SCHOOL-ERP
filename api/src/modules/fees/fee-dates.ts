/**
 * Moves a "YYYY-MM-DD" date forward or back by whole years, keeping the month and day.
 * 29 February in a year with no 29 February becomes 28 February.
 */
export function shiftYears(iso: string, years: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = y + years;
  const lastDay = new Date(Date.UTC(target, m, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(target).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
