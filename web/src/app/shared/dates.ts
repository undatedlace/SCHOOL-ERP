/** Calendar dates travel as "YYYY-MM-DD" and are never shifted by time zones. */
export const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fromIsoDate = (s: string): Date => new Date(`${s.slice(0, 10)}T00:00:00`);

export const formatDate = (s: string): string =>
  fromIsoDate(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** "5 years 3 months" as of a date (today by default). Replaces "Age as on" on the paper form. */
export function ageText(dobIso: string, asOf: Date = new Date()): string {
  const dob = fromIsoDate(dobIso);
  let months = (asOf.getFullYear() - dob.getFullYear()) * 12 + (asOf.getMonth() - dob.getMonth());
  if (asOf.getDate() < dob.getDate()) months--;
  if (months < 0) return '';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  return years === 0 ? part(rest, 'month') : `${part(years, 'year')} ${part(rest, 'month')}`;
}
