/** Small pure helpers for the dashboard charts. */

/** A width for a bar: part of the whole as a percentage between 0 and 100. */
export function widthPercent(part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0;
  return Math.min(100, Math.round((part * 1000) / whole) / 10);
}

/**
 * An SVG path through the values, left to right. A missing value (null) leaves a gap rather
 * than a line to zero. Values are scaled between min and max.
 */
export function linePath(
  values: (number | null)[],
  width: number,
  height: number,
  min = 0,
  max = 100,
): string {
  if (values.length === 0 || max <= min) return '';
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  let path = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    const clamped = Math.min(max, Math.max(min, v));
    const x = Math.round(i * step * 10) / 10;
    const y = Math.round((height - ((clamped - min) / (max - min)) * height) * 10) / 10;
    path += `${pen ? 'L' : 'M'}${x} ${y} `;
    pen = true;
  });
  return path.trim();
}

/** "+20%" or "-5%" against the year before; empty when there is nothing to compare. */
export function changeText(now: number, before: number | null | undefined): string {
  if (before === null || before === undefined || before === 0) return '';
  const change = Math.round(((now - before) * 100) / before);
  return `${change > 0 ? '+' : ''}${change}%`;
}

/** "Apr" for "2026-04". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    timeZone: 'UTC',
  });
}
