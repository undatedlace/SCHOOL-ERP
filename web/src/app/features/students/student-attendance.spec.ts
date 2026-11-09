import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth.service';
import { StudentAttendance } from '../../core/models';
import { StudentAttendanceSection } from './student-attendance';

const data = (): StudentAttendance => ({
  studentId: 's1',
  from: '2026-04-01',
  to: '2026-11-08',
  summary: {
    present: 8,
    absent: 1,
    late: 1,
    onLeave: 1,
    markedDays: 11,
    countedDays: 10,
    attendedDays: 9,
    percent: 90,
  },
  records: [
    { date: '2026-11-05', status: 'ABSENT', note: 'Fever' },
    { date: '2026-11-04', status: 'PRESENT', note: null },
    { date: '2026-11-03', status: 'ON_LEAVE', note: null },
  ],
});

function setup(permissions: string[]) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const auth = TestBed.inject(AuthService);
  auth.clear();
  auth.me.set({ id: 'u', fullName: 'U', roles: [], permissions, mustChangePassword: false });
  const fixture = TestBed.createComponent(StudentAttendanceSection);
  fixture.componentRef.setInput('studentId', 's1');
  fixture.detectChanges();
  return {
    fixture,
    http: TestBed.inject(HttpTestingController),
    el: fixture.nativeElement as HTMLElement,
  };
}

describe('StudentAttendanceSection', () => {
  it('shows the percentage and the days the child was not simply present', async () => {
    const { fixture, http, el } = setup(['attendance.read']);
    http.expectOne('/api/attendance/students/s1').flush(data());
    await fixture.whenStable();
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('90%');
    expect(text).toContain('Fever');
    expect(text).toContain('Leave');
    expect(text).not.toContain('04 Nov'); // a plain present day is not listed
  });

  it('says so before anything has been marked', async () => {
    const { fixture, http, el } = setup(['attendance.read']);
    http.expectOne('/api/attendance/students/s1').flush({
      ...data(),
      summary: { ...data().summary, markedDays: 0, percent: null },
      records: [],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('No attendance has been marked yet');
  });

  it('is not shown, and asks for nothing, without the permission', () => {
    const { http, el } = setup(['fees.read']);
    http.expectNone('/api/attendance/students/s1');
    expect(el.textContent?.trim()).toBe('');
  });
});
