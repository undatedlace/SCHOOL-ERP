import { TestBed } from '@angular/core/testing';
import { AttendanceDivisionReport } from '../../core/models';
import { AttendanceGrid } from './attendance-grid';
import { gridDays, monthBounds } from './attendance-utils';

const base = {
  present: 0,
  late: 0,
  absent: 0,
  onLeave: 0,
  percent: null,
  total: 0,
  attended: 0,
} as unknown as AttendanceDivisionReport['students'][number];

const report = (over: Partial<AttendanceDivisionReport> = {}): AttendanceDivisionReport => ({
  from: '2026-11-02',
  to: '2026-11-08',
  daysMarked: 2,
  markedDates: ['2026-11-02', '2026-11-03'],
  students: [
    {
      ...base,
      studentId: 's1',
      admissionNo: '11',
      name: 'Noor Khan',
      rollNo: 1,
      percent: 50,
      days: { '2026-11-02': 'PRESENT', '2026-11-03': 'ABSENT' },
    },
    {
      ...base,
      studentId: 's2',
      admissionNo: '12',
      name: 'Imran Shaikh',
      rollNo: 2,
      percent: 100,
      days: { '2026-11-02': 'LATE' },
    },
  ],
  ...over,
});

describe('gridDays', () => {
  it('shows every day of a short range and marks Sundays and untaken days', () => {
    const days = gridDays(report());
    expect(days.map((d) => d.iso)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(days[0]).toMatchObject({ day: '02', weekday: 'Mon', taken: true, sunday: false });
    expect(days[2].taken).toBe(false);
    expect(days[6].sunday).toBe(true); // 8 Nov 2026 is a Sunday
  });

  it('shows only the days taken when the range is too long', () => {
    const days = gridDays(report({ from: '2026-08-01', to: '2026-11-08' }));
    expect(days.map((d) => d.iso)).toEqual(['2026-11-02', '2026-11-03']);
  });
});

describe('monthBounds', () => {
  it('gives the first and last day of this month and of last month', () => {
    expect(monthBounds('2026-11-09')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthBounds('2026-01-15', 1)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('AttendanceGrid', () => {
  function render(r = report()) {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(AttendanceGrid);
    fixture.componentRef.setInput('report', r);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll('tbody tr'));

  it('has a column for each day and a row for each student', () => {
    const el = render();
    expect(el.querySelectorAll('thead th').length).toBe(1 + 7 + 1);
    expect(rows(el).length).toBe(2);
    expect(rows(el)[0].textContent).toContain('Noor Khan');
  });

  it('draws each status as a labelled mark, never by colour alone', () => {
    const el = render();
    const first = rows(el)[0];
    const marks = Array.from(first.querySelectorAll('[role="img"]')).map((m) => [
      m.getAttribute('aria-label'),
      m.textContent?.trim(),
    ]);
    expect(marks).toEqual([
      ['Present, 02 Nov 2026', '✓'],
      ['Absent, 03 Nov 2026', '✕'],
    ]);
    const second = Array.from(rows(el)[1].querySelectorAll('[role="img"]'));
    expect(second[0].getAttribute('aria-label')).toContain('Late');
    expect(second[0].textContent?.trim()).toBe('L');
  });

  it('shows a dash where attendance was not taken, and the percentage with Low under 75', () => {
    const el = render();
    const cells = Array.from(rows(el)[0].querySelectorAll('td'));
    expect(cells[2].textContent?.trim()).toBe('-');
    expect(cells[cells.length - 1].textContent).toContain('50%');
    expect(cells[cells.length - 1].textContent).toContain('Low');
    const last = Array.from(rows(el)[1].querySelectorAll('td')).pop()!;
    expect(last.textContent).not.toContain('Low');
  });

  it('says so when there are no students', () => {
    const el = render(report({ students: [] }));
    expect(el.textContent).toContain('No students.');
  });
});
