import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from '@openng/optimus-ui/api';
import { AttendanceDivision, AttendanceOverview, AttendanceRoster } from '../../core/models';
import { AttendancePage } from './attendance-page';

const division: AttendanceDivision = {
  id: 'd1',
  name: 'A',
  class: { id: 'c1', name: 'Std 1' },
  canMark: true,
};
const overview: AttendanceOverview = {
  date: '2026-11-08',
  divisions: [
    {
      id: 'd1',
      name: 'A',
      class: { id: 'c1', name: 'Std 1' },
      enrolled: 2,
      marked: 0,
      counts: { present: 0, absent: 0, late: 0, onLeave: 0 },
      done: false,
    },
  ],
};
const roster = (canMark = true): AttendanceRoster => ({
  date: '2026-11-08',
  academicYear: { id: 'y', name: '2026-27' },
  division: { id: 'd1', name: 'A', class: { id: 'c1', name: 'Std 1' } },
  canMark,
  marked: false,
  markedBy: null,
  markedAt: null,
  counts: {} as AttendanceRoster['counts'],
  students: [
    { studentId: 's1', admissionNo: '1', name: 'Noor Khan', rollNo: 1, status: null, note: null },
    {
      studentId: 's2',
      admissionNo: '2',
      name: 'Imran Shaikh',
      rollNo: 2,
      status: null,
      note: null,
    },
  ],
});

async function setup(divisions: AttendanceDivision[] = [division], canMark = true) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), MessageService],
  });
  const fixture = TestBed.createComponent(AttendancePage);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/api/attendance/divisions').flush(divisions);
  await fixture.whenStable();
  http.expectOne((r) => r.url === '/api/attendance/overview').flush(overview);
  await fixture.whenStable();
  if (divisions.length === 1) {
    http.expectOne((r) => r.url === '/api/attendance/divisions/d1').flush(roster(canMark));
    await fixture.whenStable();
  }
  fixture.detectChanges();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

// Buttons, and the options of Optimus select buttons (each a role="button" toggle).
const button = (el: HTMLElement, text: string, within?: Element) =>
  Array.from((within ?? el).querySelectorAll('button, [role="button"]')).find((b) =>
    (b.textContent ?? '').trim().startsWith(text),
  ) as HTMLButtonElement | undefined;

describe('AttendancePage', () => {
  it('a teacher with one division sees the roster at once and the overview of today', async () => {
    const { el } = await setup();
    const text = el.textContent ?? '';
    expect(text).toContain('Noor Khan');
    expect(text).toContain('Imran Shaikh');
    expect(text).toContain('Not marked yet');
  });

  it('marks everyone present, changes one to absent, and sends only what is on screen', async () => {
    const { fixture, http, el } = await setup();
    button(el, 'Mark everyone present')!.click();
    fixture.detectChanges();
    const rows = Array.from(el.querySelectorAll('li'));
    button(el, 'Absent', rows[1])!.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('2 to save');

    button(el, 'Save attendance')!.click();
    const put = http.expectOne(
      (r) => r.method === 'PUT' && r.url === '/api/attendance/divisions/d1',
    );
    expect(put.request.body.entries).toEqual([
      { studentId: 's1', status: 'PRESENT' },
      { studentId: 's2', status: 'ABSENT' },
    ]);
    expect(put.request.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps marks already saved when marking the blanks present', async () => {
    const { fixture, el } = await setup();
    const rows = Array.from(el.querySelectorAll('li'));
    button(el, 'Late', rows[0])!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    button(el, 'Mark everyone present')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const pressed = (row: Element, label: string) =>
      button(el, label, row)!.getAttribute('aria-pressed');
    expect(pressed(rows[0], 'Late')).toBe('true');
    expect(pressed(rows[0], 'Present')).toBe('false');
    expect(pressed(rows[1], 'Present')).toBe('true');
  });

  it('cannot save before anything is marked', async () => {
    const { el } = await setup();
    expect(button(el, 'Save attendance')!.disabled).toBe(true);
  });

  it('a day that can only be looked at has no buttons to change it', async () => {
    const { el } = await setup([{ ...division, canMark: false }], false);
    expect(button(el, 'Mark everyone present')).toBeUndefined();
    expect(button(el, 'Save attendance')).toBeUndefined();
    expect(el.textContent).toContain('look at this day but not change it');
    const marks = Array.from(el.querySelectorAll('li p-togglebutton'));
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((b) => b.getAttribute('data-p-disabled') === 'true')).toBe(true);
  });

  it('says so when the person has no divisions', async () => {
    const { el } = await setup([]);
    expect(el.textContent).toContain('no divisions to take attendance for');
  });
});
