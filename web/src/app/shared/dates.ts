/** Calendar dates travel as "YYYY-MM-DD" and are never shifted by time zones. */
export const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fromIsoDate = (s: string): Date => new Date(`${s.slice(0, 10)}T00:00:00`);

export const formatDate = (s: string): string =>
  fromIsoDate(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
