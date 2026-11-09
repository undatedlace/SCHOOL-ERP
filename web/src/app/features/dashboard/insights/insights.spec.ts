import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AdmissionsInsight,
  AttendanceInsight,
  FeesInsight,
  StaffInsight,
} from '../../../core/models';
import { AdmissionsInsightCard } from './admissions-insight';
import { AttendanceInsightCard } from './attendance-insight';
import { FeesInsightCard } from './fees-insight';
import { StaffInsightCard } from './staff-insight';

function mount<T>(component: new () => T) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return {
    fixture,
    http: TestBed.inject(HttpTestingController),
    el: fixture.nativeElement as HTMLElement,
  };
}

describe('dashboard insight cards', () => {
  it('admissions: newest year first, with the change on the year before', async () => {
    const { fixture, http, el } = mount(AdmissionsInsightCard);
    const year = (id: string, name: string, applications: number, over = {}) => ({
      id,
      name,
      isCurrent: false,
      applications,
      received: 0,
      granted: applications,
      refused: 0,
      withdrawn: 0,
      admitted: applications,
      enrolled: applications,
      ...over,
    });
    http.expectOne('/api/insights/admissions').flush({
      years: [year('a', '2025-26', 100), year('b', '2026-27', 120, { isCurrent: true })],
    } satisfies AdmissionsInsight);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text.indexOf('2026-27')).toBeLessThan(text.indexOf('2025-26'));
    expect(text).toContain('120 applications');
    expect(text).toContain('+20%');
    expect(text).toContain('(this year)');
  });

  it('staff: shows who joined and left, and how many work there now', async () => {
    const { fixture, http, el } = mount(StaffInsightCard);
    http.expectOne('/api/insights/staff').flush({
      years: [
        { id: 'a', name: '2025-26', joined: 4, left: 1, atYearEnd: 20 },
        { id: 'b', name: '2026-27', joined: 0, left: 0, atYearEnd: 20 },
      ],
      currentlyWorking: 21,
    } satisfies StaffInsight);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('21 working now');
    expect(text).toContain('2025-26');
    expect(text).not.toContain('2026-27'); // nothing happened that year
  });

  it('fees: totals in rupees, bars by class, and a bar for every month', async () => {
    const { fixture, http, el } = mount(FeesInsightCard);
    const sums = { billed: '20000.00', collected: '5000.00', pending: '15000.00', overdue: '0.00' };
    http.expectOne('/api/insights/fees').flush({
      academicYear: { id: 'y', name: '2026-27' },
      totals: { students: 2, owing: 2, ...sums },
      byClass: [{ id: 'c', label: 'Std 1', students: 2, owing: 2, ...sums }],
      collectedByMonth: ['2026-04', '2026-05', '2026-06'].map((month, i) => ({
        month,
        total: i === 1 ? '5000.00' : '0.00',
        payments: i === 1 ? 1 : 0,
      })),
    } satisfies FeesInsight);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('₹20,000.00');
    expect(text).toContain('₹15,000.00 pending');
    expect(text).toContain('Std 1');
    expect(el.querySelectorAll('ol li').length).toBe(3);
    const bar = el.querySelector('ul li .bg-primary') as HTMLElement;
    expect(bar.style.width).toBe('25%');
  });

  it('fees: says so when there is no current year', async () => {
    const { fixture, http, el } = mount(FeesInsightCard);
    http.expectOne('/api/insights/fees').flush(null);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Set up the current academic year');
  });

  it('attendance: coverage today, a trend, and the lowest divisions with low ones called out', async () => {
    const { fixture, http, el } = mount(AttendanceInsightCard);
    http
      .expectOne((r) => r.url === '/api/insights/attendance')
      .flush({
        from: '2026-10-10',
        to: '2026-11-08',
        days: 30,
        today: { divisions: 5, marked: 3 },
        trend: [
          { date: '2026-11-06', percent: 90, present: 9, late: 0, absent: 1, onLeave: 0 },
          { date: '2026-11-07', percent: 80, present: 8, late: 0, absent: 2, onLeave: 0 },
        ],
        divisions: [
          { id: 'a', label: 'Std 2-B', percent: 70.5, markedDays: 5 },
          { id: 'b', label: 'Std 1-A', percent: 92, markedDays: 5 },
        ],
      } satisfies AttendanceInsight);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('3 of 5');
    expect(text).toContain('2 still to do');
    expect(el.querySelector('svg path')?.getAttribute('d')).toContain('M0');
    expect(el.querySelector('svg')?.getAttribute('aria-label')).toContain('80%');
    const rows = Array.from(el.querySelectorAll('li'));
    expect(rows[0].textContent).toContain('Std 2-B');
    expect(rows[0].querySelector('.text-destructive')).not.toBeNull();
    expect(rows[1].querySelector('.text-destructive')).toBeNull();
  });

  it('attendance: nothing to show for someone with no divisions', async () => {
    const { fixture, http, el } = mount(AttendanceInsightCard);
    http
      .expectOne((r) => r.url === '/api/insights/attendance')
      .flush({
        from: 'a',
        to: 'b',
        days: 30,
        today: { divisions: 0, marked: 0 },
        trend: [],
        divisions: [],
      } satisfies AttendanceInsight);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('no divisions to show');
  });

  it('a card that cannot load says so instead of breaking the page', async () => {
    const { fixture, http, el } = mount(StaffInsightCard);
    http.expectOne('/api/insights/staff').flush('no', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve)); // let the failed request settle
    fixture.detectChanges();
    expect(el.textContent).toContain('Not available');
  });
});
