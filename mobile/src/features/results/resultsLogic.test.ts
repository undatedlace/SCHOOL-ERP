import { averageOf, chartPoints, groupBySubject, markText, trendDescription, trendPoints, type ResultItem } from './resultsLogic';

const result = (
  id: string,
  subject: string,
  conductedOn: string,
  marks: number | null,
  max = 20,
  absent = false,
): ResultItem => ({
  assessment: { id, name: `Test ${id}`, kind: 'UNIT', subject: { id: subject.toLowerCase(), name: subject }, conductedOn, maxMarks: max },
  marks,
  absent,
  remark: null,
  percent: marks === null ? null : Math.round((marks / max) * 1000) / 10,
  classAverage: null,
  classHighest: null,
});

const all = [
  result('1', 'Maths', '2026-09-10', 15),
  result('2', 'English', '2026-09-15', 18),
  result('3', 'Maths', '2026-10-20', 19),
  result('4', 'English', '2026-11-02', null, 20, true),
];

describe('groupBySubject', () => {
  const groups = groupBySubject(all);

  it('orders subjects A to Z and tests newest first', () => {
    expect(groups.map((g) => g.subject.name)).toEqual(['English', 'Maths']);
    expect(groups[1]!.items.map((i) => i.assessment.id)).toEqual(['3', '1']);
  });

  it('averages the scored tests and ignores absences', () => {
    expect(groups[0]!.averagePercent).toBe(90); // English: 18/20 scored, one absent
    expect(groups[1]!.averagePercent).toBe(85); // (75 + 95) / 2
  });
});

describe('averageOf and markText', () => {
  it('is null with nothing scored', () => {
    expect(averageOf([null, null])).toBeNull();
    expect(averageOf([])).toBeNull();
  });
  it('rounds to one decimal', () => {
    expect(averageOf([66.7, 50])).toBe(58.4);
  });
  it('shows marks without trailing zeros', () => {
    expect(markText(18)).toBe('18');
    expect(markText(17.5)).toBe('17.5');
    expect(markText(17.25)).toBe('17.25');
  });
});

describe('trend', () => {
  it('lists scored tests oldest first and leaves out absences', () => {
    const points = trendPoints(all);
    expect(points.map((p) => p.id)).toEqual(['1', '2', '3']);
    expect(points.map((p) => p.percent)).toEqual([75, 90, 95]);
  });

  it('places 0% on the bottom and 100% on the top of the plot, evenly across', () => {
    const pad = { left: 30, right: 10, top: 10, bottom: 20 };
    const placed = chartPoints(
      [
        { id: 'a', date: '2026-09-01', percent: 0, name: 'a', subject: 's' },
        { id: 'b', date: '2026-09-02', percent: 100, name: 'b', subject: 's' },
        { id: 'c', date: '2026-09-03', percent: 50, name: 'c', subject: 's' },
      ],
      200,
      100,
      pad,
    );
    expect(placed.map((p) => p.x)).toEqual([30, 110, 190]);
    expect(placed.map((p) => p.y)).toEqual([80, 10, 45]);
  });

  it('centres a single point and clamps out-of-range values', () => {
    const [one] = chartPoints([{ id: 'a', date: '2026-09-01', percent: 130, name: 'a', subject: 's' }], 100, 100, { left: 0, right: 0, top: 0, bottom: 0 });
    expect(one).toMatchObject({ x: 50, y: 0 });
  });

  it('describes every point for a screen reader', () => {
    const text = trendDescription(trendPoints(all));
    expect(text).toContain('3 tests');
    expect(text).toContain('Maths Test 1, 10 Sep: 75 percent');
    expect(trendDescription([])).toBe('No scored tests yet.');
  });
});
