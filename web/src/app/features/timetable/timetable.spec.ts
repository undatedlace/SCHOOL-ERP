import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NAV_ENTRIES, visibleEntries } from '../../core/nav';
import { PortalTimetable } from './portal-timetable';
import { CellPick, TimetableGrid } from './timetable-grid';
import { DivisionWeek, WeekView, addDays, weekTitle, weekdayOf } from './timetable-models';

const days = [
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14',
].map((date, i) => ({
  date,
  weekday: i + 1,
  name: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i],
  holiday: null as string | null,
}));

const view = (over: Partial<WeekView> = {}): WeekView => ({
  academicYear: { id: 'y', name: '2026-27' },
  today: '2026-11-10',
  weekOf: '2026-11-09',
  days,
  rows: [
    {
      key: 'p1',
      kind: 'PERIOD',
      label: 'Period 1',
      startsAt: '08:30',
      endsAt: '09:10',
      days: [1, 2, 3, 4, 5],
    },
    {
      key: 'b1',
      kind: 'BREAK',
      label: 'Recess',
      startsAt: '09:10',
      endsAt: '09:30',
      days: [1, 2, 3, 4, 5],
    },
  ],
  cells: [
    {
      id: 'c1',
      rowKey: 'p1',
      slotId: 'p1',
      weekday: 1,
      subject: { id: 's1', name: 'Mathematics' },
      staff: { id: 't1', fullName: 'Meera Rao' },
      room: 'Room 3',
      division: { id: 'd1', label: 'Std 5-A' },
    },
    {
      id: 'c2',
      rowKey: 'p1',
      slotId: 'p1',
      weekday: 2,
      subject: { id: 's2', name: 'English' },
      staff: { id: 't2', fullName: 'Esha Shah' },
      room: null,
      division: { id: 'd1', label: 'Std 5-A' },
    },
  ],
  changes: [],
  ...over,
});

function grid(
  v: WeekView,
  opts: { editable?: boolean; mode?: 'division' | 'staff'; staffId?: string } = {},
) {
  const fixture = TestBed.createComponent(TimetableGrid);
  fixture.componentRef.setInput('view', v);
  if (opts.editable) fixture.componentRef.setInput('editable', true);
  if (opts.mode) fixture.componentRef.setInput('mode', opts.mode);
  if (opts.staffId) fixture.componentRef.setInput('staffId', opts.staffId);
  fixture.detectChanges();
  return fixture;
}

describe('TimetableGrid', () => {
  it('shows Monday to Friday, the lessons, a break as one row and today marked', () => {
    const el: HTMLElement = grid(view()).nativeElement;
    const heads = [...el.querySelectorAll('thead th')].map((th) => th.textContent ?? '');
    expect(heads).toHaveLength(6); // Period + Mon..Fri (no Saturday rows)
    expect(heads[2]).toContain('Today');
    expect(el.querySelector('thead th[aria-current="date"]')?.textContent).toContain('Tuesday');
    expect(el.textContent).toContain('Mathematics');
    expect(el.textContent).toContain('Meera Rao');
    expect(el.textContent).toContain('Room 3');
    const recess = [...el.querySelectorAll('td[colspan]')].find((td) =>
      td.textContent?.includes('Recess'),
    );
    expect(recess?.getAttribute('colspan')).toBe('5');
  });

  it('shows Saturday only when a row runs on it', () => {
    const v = view();
    v.rows.push({
      key: 's1',
      kind: 'PERIOD',
      label: 'Sat 1',
      startsAt: '08:30',
      endsAt: '09:00',
      days: [6],
    });
    const el: HTMLElement = grid(v).nativeElement;
    expect(el.querySelectorAll('thead th')).toHaveLength(7);
  });

  it('marks a cancelled period and a substitute on their day, with words not only colour', () => {
    const el: HTMLElement = grid(
      view({
        changes: [
          {
            id: 'x1',
            date: '2026-11-09',
            rowKey: 'p1',
            slotId: 'p1',
            kind: 'CANCELLED',
            division: { id: 'd1', label: 'Std 5-A' },
            substitute: null,
            subject: null,
            reason: null,
          },
          {
            id: 'x2',
            date: '2026-11-10',
            rowKey: 'p1',
            slotId: 'p1',
            kind: 'SUBSTITUTE',
            division: { id: 'd1', label: 'Std 5-A' },
            substitute: { id: 't3', fullName: 'Sara Ali' },
            subject: null,
            reason: 'On leave',
          },
        ],
      }),
    ).nativeElement;
    expect(el.textContent).toContain('Cancelled');
    expect(el.textContent).toContain('Substitute: Sara Ali');
    expect(el.textContent).toContain('On leave');
    expect(el.querySelector('.line-through')?.textContent).toContain('Mathematics');
  });

  it('in a teacher’s week, names the class and shows periods they cover', () => {
    const v = view({
      cells: [view().cells[0]],
      changes: [
        {
          id: 'x3',
          date: '2026-11-11',
          rowKey: 'p1',
          slotId: 'p1',
          kind: 'SUBSTITUTE',
          division: { id: 'd2', label: 'Std 6-B' },
          substitute: { id: 't1', fullName: 'Meera Rao' },
          subject: { id: 's1', name: 'Mathematics' },
          reason: null,
        },
      ],
    });
    const el: HTMLElement = grid(v, { mode: 'staff', staffId: 't1' }).nativeElement;
    expect(el.textContent).toContain('Std 5-A');
    expect(el.textContent).toContain('Std 6-B');
    expect(el.textContent).toContain('You cover this');
  });

  it('lets an administrator press a box, and not a break', () => {
    const fixture = grid(view(), { editable: true });
    const picks: CellPick[] = [];
    fixture.componentInstance.pick.subscribe((p) => picks.push(p));
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody button');
    expect(buttons).toHaveLength(5); // Period 1, Monday to Friday; the break has none
    (buttons[0] as HTMLButtonElement).click();
    expect(picks[0]).toMatchObject({ row: { key: 'p1' }, day: { weekday: 1 }, cell: { id: 'c1' } });
    expect(buttons[0].getAttribute('aria-label')).toContain('Monday Period 1: Mathematics');
  });

  it('shows a holiday instead of lessons', () => {
    const v = view();
    v.days = v.days.map((d) => (d.weekday === 1 ? { ...d, holiday: 'Diwali' } : d));
    const el: HTMLElement = grid(v, { editable: true }).nativeElement;
    expect(el.textContent).toContain('Holiday: Diwali');
    expect(el.querySelectorAll('tbody button')).toHaveLength(4);
  });
});

describe('timetable dates', () => {
  it('works out weekdays and week titles', () => {
    expect(weekdayOf('2026-11-15')).toBe(7);
    expect(addDays('2026-11-09', 7)).toBe('2026-11-16');
    expect(weekTitle(days)).toBe('9–14 Nov 2026');
  });
});

describe('timetable menu', () => {
  const has =
    (...permissions: string[]) =>
    (p: string) =>
      permissions.includes(p);
  const timetable = (...p: string[]) =>
    visibleEntries(NAV_ENTRIES, has(...p))
      .find((e) => e.label === 'Timetable')
      ?.items?.map((i) => i.label);

  it('gives administrators the class view, daily changes and timings', () => {
    expect(timetable('timetable.read', 'timetable.read_all', 'timetable.manage')).toEqual([
      'Timetable',
      'Daily changes',
      'Timings',
    ]);
  });

  it('gives teachers any class and their own week', () => {
    expect(timetable('timetable.read', 'timetable.read_all')).toEqual([
      'Timetable',
      'My timetable',
    ]);
  });

  it('gives office staff nothing', () => {
    expect(timetable('students.read_all')).toBeUndefined();
  });
});

describe('PortalTimetable', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('shows the child’s class week', async () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PortalTimetable);
    fixture.detectChanges();
    http.expectOne('/api/timetable/divisions').flush([
      {
        id: 'd1',
        name: 'A',
        label: 'Std 5-A',
        class: { id: 'c', name: 'Std 5' },
        students: [{ id: 'k', fullName: 'Zara Khan' }],
      },
    ]);
    await fixture.whenStable();
    const week: DivisionWeek = {
      ...view(),
      division: { id: 'd1', name: 'A', label: 'Std 5-A', class: { id: 'c', name: 'Std 5' } },
      schedule: { id: 's', name: 'Primary' },
      classTeacher: { id: 't1', fullName: 'Meera Rao' },
      periodsPerWeek: [],
      team: [],
    };
    http.expectOne((r) => r.url === '/api/timetable/divisions/d1').flush(week);
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Class Std 5-A');
    expect(el.textContent).toContain('Class teacher Meera Rao');
    expect(el.querySelectorAll('tbody button')).toHaveLength(0);
    http.verify();
  });
});
