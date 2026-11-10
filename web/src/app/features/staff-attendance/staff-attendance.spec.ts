import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from '@openng/optimus-ui/api';
import { AuthService } from '../../core/auth.service';
import { MyStaffAttendance, StaffAttendanceReport, StaffAttendanceRoster } from '../../core/models';
import { MyAttendancePage } from './my-attendance-page';
import { StaffAttendancePage } from './staff-attendance-page';
import { asGridReport, staffChanges, staffDraftsFrom } from './staff-grid';

const counts = { present: 0, late: 0, absent: 0, onLeave: 0, percent: null } as never;
const roster = (canMark = true): StaffAttendanceRoster => ({
  date: '2026-11-09',
  canMark,
  marked: true,
  counts: { present: 1, late: 0, absent: 0, onLeave: 1, percent: 100 } as never,
  staff: [
    {
      staffId: 'a',
      employeeNo: '1',
      name: 'Asha Rao',
      designation: 'Teacher',
      status: 'PRESENT',
      note: null,
      markedBy: 'Admin',
    },
    {
      staffId: 'b',
      employeeNo: '2',
      name: 'Meera Iyer',
      designation: 'Teacher',
      status: null,
      note: null,
      markedBy: null,
    },
  ],
});
const report = (): StaffAttendanceReport => ({
  from: '2026-11-01',
  to: '2026-11-09',
  daysMarked: 1,
  markedDates: ['2026-11-02'],
  people: [
    {
      staffId: 'a',
      employeeNo: '1',
      name: 'Asha Rao',
      designation: 'Teacher',
      ...(counts as object),
      days: { '2026-11-02': 'ON_LEAVE' },
    } as never,
  ],
});

function setup(permissions: string[]) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), MessageService],
  });
  const auth = TestBed.inject(AuthService);
  auth.clear();
  auth.me.set({ id: 'u', fullName: 'U', roles: [], permissions, mustChangePassword: false });
  return TestBed.inject(HttpTestingController);
}

describe('staff attendance helpers', () => {
  it('starts from what is saved and offers only real changes', () => {
    const r = roster();
    const drafts = staffDraftsFrom(r);
    expect(staffChanges(r, drafts)).toEqual([]);
    drafts['b'] = { status: 'ON_LEAVE', note: ' Medical ' };
    drafts['a'] = { status: 'PRESENT', note: 'ignored for present' };
    expect(staffChanges(r, drafts)).toEqual([
      { staffId: 'b', status: 'ON_LEAVE', note: 'Medical' },
    ]);
    drafts['a'] = { status: 'ABSENT', note: '' };
    expect(staffChanges(r, drafts).map((c) => c.staffId)).toEqual(['a', 'b']);
  });

  it('shapes a staff report like a division report for the grid', () => {
    const g = asGridReport(report());
    expect(g.students[0]).toMatchObject({ studentId: 'a', admissionNo: '1', name: 'Asha Rao' });
    expect(g.markedDates).toEqual(['2026-11-02']);
  });
});

describe('StaffAttendancePage', () => {
  it('lets the admin mark, save and remove', async () => {
    const http = setup(['staff_attendance.read_all', 'staff_attendance.manage']);
    const fixture = TestBed.createComponent(StaffAttendancePage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/staff-attendance').flush(roster());
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Asha Rao');
    // Remove is offered only where a mark is saved.
    expect(el.querySelectorAll('button[aria-label^="Remove the saved mark"]').length).toBe(1);

    const group = el.querySelector('[aria-label="Attendance for Meera Iyer"]')!;
    const leave = Array.from(group.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Leave',
    ) as HTMLButtonElement;
    leave.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('1 change to save.');
    const save = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save attendance'),
    ) as HTMLButtonElement;
    save.click();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/staff-attendance');
    expect(req.request.body.entries).toEqual([{ staffId: 'b', status: 'ON_LEAVE' }]);
    req.flush(roster());
    await fixture.whenStable();
  });

  it('shows office staff the day without any way to change it', async () => {
    const http = setup(['staff_attendance.read_all']);
    const fixture = TestBed.createComponent(StaffAttendancePage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/staff-attendance').flush(roster(false));
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('You can look at this day but not change it');
    expect(el.textContent).not.toContain('Save attendance');
    expect(el.textContent).not.toContain('Mark everyone present');
    expect(el.querySelectorAll('button[aria-label^="Remove the saved mark"]').length).toBe(0);
    expect(
      Array.from(el.querySelectorAll('[aria-label="Attendance for Asha Rao"] button')).every(
        (b) => (b as HTMLButtonElement).disabled,
      ),
    ).toBe(true);
  });

  it('shows the report as a grid on the Report tab', async () => {
    const http = setup(['staff_attendance.read_all']);
    const fixture = TestBed.createComponent(StaffAttendancePage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/staff-attendance').flush(roster());
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (
      Array.from(el.querySelectorAll('[role="tab"]')).find(
        (b) => b.textContent?.trim() === 'Report',
      ) as HTMLButtonElement
    ).click();
    http.expectOne((r) => r.url === '/api/staff-attendance/report').flush(report());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('app-attendance-grid table')).not.toBeNull();
    expect(el.querySelector('thead')!.textContent).toContain('Name');
    expect(el.querySelector('[role="img"]')!.getAttribute('aria-label')).toContain('On leave');
  });
});

describe('MyAttendancePage', () => {
  it('shows a person their own totals and notes', async () => {
    const http = setup(['staff_attendance.read']);
    const fixture = TestBed.createComponent(MyAttendancePage);
    fixture.detectChanges();
    const mine: MyStaffAttendance = {
      ...report(),
      people: [
        {
          ...report().people[0],
          present: 7,
          late: 1,
          absent: 0,
          onLeave: 1,
          percent: 100,
        } as never,
      ],
      records: [{ date: '2026-11-02', status: 'ON_LEAVE', note: 'Medical' }],
    };
    http.expectOne((r) => r.url === '/api/staff-attendance/me').flush(mine);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('100%');
    expect(text).toContain('Medical');
    expect(text).not.toContain('Save attendance');
  });

  it('says so when there is no staff record', async () => {
    const http = setup(['staff_attendance.read']);
    const fixture = TestBed.createComponent(MyAttendancePage);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/staff-attendance/me')
      .flush({ message: 'You have no staff record' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'You have no staff record',
    );
  });
});
