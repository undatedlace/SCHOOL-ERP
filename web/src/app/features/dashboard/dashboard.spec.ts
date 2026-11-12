import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Assignment } from '../../core/models';
import { Dashboard, greeting } from './dashboard';

const row = (over: Partial<Assignment> & { id: string }): Assignment => ({
  kind: 'SUBJECT',
  academicYear: { id: 'y', name: '2026-27' },
  division: { id: 'd', name: 'A', class: { id: 'c', name: 'Std 5' } },
  subject: { id: 's', name: 'Maths' },
  staff: { id: 't', fullName: 'Asha Rao', status: 'ACTIVE' },
  ...over,
});

function setup(permissions: string[]) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const auth = TestBed.inject(AuthService);
  auth.clear();
  auth.me.set({
    id: 'u',
    fullName: 'Asha Rao',
    roles: ['TEACHER'],
    permissions,
    mustChangePassword: false,
  });
  const fixture = TestBed.createComponent(Dashboard);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

describe("Dashboard: a teacher's classes", () => {
  it('lists the classes and subjects the teacher teaches this year', async () => {
    const { fixture, http } = setup(['academics.read', 'students.read']);
    http
      .expectOne('/api/teaching-assignments/mine')
      .flush([row({ id: '1', kind: 'CLASS_TEACHER', subject: null }), row({ id: '2' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Your classes this year');
    expect(text).toContain('Std 5-A');
    expect(text).toContain('Class teacher');
    expect(text).toContain('Maths');
  });

  it('shows nothing extra when there are no assignments', async () => {
    const { fixture, http } = setup(['academics.read']);
    http.expectOne('/api/teaching-assignments/mine').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Your classes this year');
  });

  it('does not ask for classes when the user may not read academic setup', () => {
    const { http } = setup(['notices.read']);
    http.expectNone('/api/teaching-assignments/mine');
  });
});

describe('Dashboard: insights follow permissions', () => {
  const asked = (http: HttpTestingController) =>
    http
      .match(() => true)
      .map((r) => r.request.url)
      .filter((u) => u.startsWith('/api/insights'));

  it('an accountant sees only fees and attendance, and nothing is asked for the rest', () => {
    const { http } = setup(['fees.read_all', 'attendance.read', 'dashboard.view']);
    expect(asked(http).sort()).toEqual(['/api/insights/attendance', '/api/insights/fees']);
  });

  it('a teacher asks only for attendance', () => {
    const { http } = setup(['academics.read', 'attendance.read', 'dashboard.view']);
    expect(asked(http)).toEqual(['/api/insights/attendance']);
  });

  it('the admin asks for all four', () => {
    const { http } = setup([
      'fees.read_all',
      'attendance.read',
      'insights.admissions',
      'insights.staff',
      'dashboard.view',
    ]);
    expect(asked(http)).toHaveLength(4);
  });

  it('someone with none of them asks for none', () => {
    const { http } = setup(['staff.read']);
    expect(asked(http)).toEqual([]);
  });
});

describe('Dashboard: tiles at a glance', () => {
  it('shows the office the students, waiting applications and recent forms; no fees or staff', async () => {
    const { fixture, http } = setup(['students.read_all', 'admissions.read']);
    http
      .expectOne((r) => r.url === '/api/students')
      .flush({ items: [], total: 185, page: 1, pageSize: 1 });
    http.expectOne('/api/admissions/applications/summary').flush({
      academicYearId: 'y',
      total: 12,
      counts: { RECEIVED: 3, UNDER_REVIEW: 2, GRANTED: 6, REFUSED: 1, WITHDRAWN: 0 },
    });
    http
      .expectOne((r) => r.url === '/api/admissions/applications')
      .flush({
        items: [
          {
            id: 'a1',
            formNo: '41',
            seq: 41,
            status: 'RECEIVED',
            studentName: 'Ayaan Shaikh',
            dateOfBirth: null,
            receivedOn: '2026-11-10',
            class: { id: 'c', name: 'Nursery' },
            academicYear: { id: 'y', name: '2026-27' },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 5,
      });
    http.expectNone((r) => r.url === '/api/fees/dues' || r.url === '/api/staff');
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Students');
    expect(text).toContain('185');
    expect(text).toContain('Applications waiting');
    expect(text).toContain('12 received this year, 6 granted');
    expect(text).toContain('Recent applications');
    expect(text).toContain('Ayaan Shaikh');
    expect(text).not.toContain('Fees collected');
  });

  it('greets by the time of day in India', () => {
    expect(greeting(new Date('2026-11-12T03:00:00Z'))).toBe('Good morning'); // 8:30 am
    expect(greeting(new Date('2026-11-12T08:00:00Z'))).toBe('Good afternoon'); // 1:30 pm
    expect(greeting(new Date('2026-11-12T14:00:00Z'))).toBe('Good evening'); // 7:30 pm
  });
});
