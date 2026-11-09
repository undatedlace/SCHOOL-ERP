import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Assignment } from '../../core/models';
import { Dashboard } from './dashboard';

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
