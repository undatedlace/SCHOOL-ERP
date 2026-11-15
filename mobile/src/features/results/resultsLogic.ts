/** Pure helpers for the Results screen: grouping by subject, averages, and the trend line. */
import { formatDay } from '@/lib/dates';

export type AssessmentKind = 'UNIT' | 'MOCK' | 'TERM' | 'OTHER';

export interface ResultItem {
  assessment: {
    id: string;
    name: string;
    kind: AssessmentKind;
    subject: { id: string; name: string };
    /** "YYYY-MM-DD" */
    conductedOn: string;
    maxMarks: number;
  };
  marks: number | null;
  absent: boolean;
  remark: string | null;
  /** Marks as a percentage of the maximum, one decimal; null when absent or not scored. */
  percent: number | null;
  classAverage: number | null;
  classHighest: number | null;
}

/** `GET /results/students/:studentId` */
export interface StudentResults {
  student: { id: string; name: string };
  results: ResultItem[];
}

export const KIND_LABEL: Record<AssessmentKind, string> = {
  UNIT: 'Unit test',
  MOCK: 'Mock test',
  TERM: 'Term exam',
  OTHER: 'Test',
};

/** A mark without trailing zeros: 18 -> "18", 17.5 -> "17.5". */
export const markText = (n: number): string => String(Math.round(n * 100) / 100);

export interface SubjectGroup {
  subject: { id: string; name: string };
  /** Oldest first. */
  items: ResultItem[];
  /** Average of the scored tests' percentages, one decimal; null when none was scored. */
  averagePercent: number | null;
}

export function averageOf(percents: readonly (number | null)[]): number | null {
  const scored = percents.filter((p): p is number => p !== null);
  if (scored.length === 0) return null;
  return Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10;
}

const byDate = (a: ResultItem, b: ResultItem) =>
  a.assessment.conductedOn < b.assessment.conductedOn ? -1 : a.assessment.conductedOn > b.assessment.conductedOn ? 1 : 0;

/** Results grouped by subject (subject names A to Z), each group's tests newest first. */
export function groupBySubject(results: readonly ResultItem[]): SubjectGroup[] {
  const groups = new Map<string, SubjectGroup>();
  for (const r of results) {
    const g = groups.get(r.assessment.subject.id) ?? { subject: r.assessment.subject, items: [], averagePercent: null };
    g.items.push(r);
    groups.set(r.assessment.subject.id, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, items: g.items.sort(byDate).reverse(), averagePercent: averageOf(g.items.map((i) => i.percent)) }))
    .sort((a, b) => a.subject.name.localeCompare(b.subject.name));
}

export interface TrendPoint {
  id: string;
  date: string;
  percent: number;
  name: string;
  subject: string;
}

/** Scored tests (not absent) in date order, for the trend line. */
export function trendPoints(results: readonly ResultItem[]): TrendPoint[] {
  return [...results]
    .sort(byDate)
    .flatMap((r) =>
      r.percent === null
        ? []
        : [{ id: r.assessment.id, date: r.assessment.conductedOn, percent: r.percent, name: r.assessment.name, subject: r.assessment.subject.name }],
    );
}

export interface ChartPoint extends TrendPoint {
  x: number;
  y: number;
}

/**
 * Pixel positions for the points inside a chart of `width` x `height`, with `pad` kept clear on
 * every side. 0% sits on the bottom edge of the plot and 100% on the top. A single point is
 * centred; points are spread evenly in time order (not by date, so close tests stay readable).
 */
export function chartPoints(
  points: readonly TrendPoint[],
  width: number,
  height: number,
  pad: { left: number; right: number; top: number; bottom: number },
): ChartPoint[] {
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);
  return points.map((p, i) => ({
    ...p,
    x: points.length === 1 ? pad.left + plotW / 2 : pad.left + (plotW * i) / (points.length - 1),
    y: pad.top + plotH * (1 - Math.max(0, Math.min(100, p.percent)) / 100),
  }));
}

/** What a screen reader says for the chart: every point in words, since the picture is not read. */
export function trendDescription(points: readonly TrendPoint[]): string {
  if (points.length === 0) return 'No scored tests yet.';
  const list = points.map((p) => `${p.subject} ${p.name}, ${formatDay(p.date, 'dayMonth')}: ${p.percent} percent`).join('. ');
  return `Percentage across ${points.length} ${points.length === 1 ? 'test' : 'tests'}, oldest first. ${list}.`;
}
