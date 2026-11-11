import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { AuthService } from '../../core/auth.service';
import { StudentDetail } from '../../core/models';
import { StudentPage } from './student-page';

const detail = (over: Partial<StudentDetail> = {}): StudentDetail => ({
  id: 's1',
  admissionNo: 'hesj0001',
  fullName: 'Noor Khan',
  firstName: 'Noor',
  fatherName: null,
  surname: 'Khan',
  gender: 'FEMALE',
  dateOfBirth: '2021-06-15',
  status: 'ACTIVE',
  joinedOn: '2026-06-01',
  leftOn: null,
  photoFileId: null,
  hasLogin: false,
  schoolEmail: 'hesj0001@school.in',
  removal: null,
  guardians: [],
  enrollments: [
    {
      id: 'e1',
      academicYear: { id: 'y', name: '2026-27' },
      class: { id: 'c1', name: 'Std 1' },
      division: { id: 'd1', name: 'A' },
      startedOn: '2026-06-01',
      endedOn: null,
    },
  ],
  application: null,
  ...over,
});

async function setup(permissions: string[], student: StudentDetail) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      MessageService,
      ConfirmationService,
    ],
  });
  const auth = TestBed.inject(AuthService);
  auth.clear();
  auth.me.set({ id: 'u', fullName: 'U', roles: [], permissions, mustChangePassword: false });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(StudentPage);
  fixture.componentRef.setInput('id', 's1');
  fixture.detectChanges();
  http.expectOne('/api/students/s1').flush(student);
  await fixture.whenStable();
  // The page loads other things in its sections; none of them matter here.
  http.match(() => true).forEach((r) => r.flush([]));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as
      HTMLButtonElement | undefined;
  return { fixture, el, http, button };
}

describe('StudentPage removal and moving', () => {
  it('shows the student ID and school e-mail', async () => {
    const { el } = await setup(['students.read'], detail());
    expect(el.textContent).toContain('Student ID hesj0001');
    expect(el.textContent).toContain('hesj0001@school.in');
  });

  it('offers Remove only to people who may remove, and Move to people who manage students', async () => {
    const a = await setup(['students.read', 'students.manage'], detail());
    expect(a.button('Remove student')).toBeUndefined();
    expect(a.button('Move to another division')).toBeDefined();
    TestBed.resetTestingModule();
    const b = await setup(['students.read'], detail());
    expect(b.button('Remove student')).toBeUndefined();
    expect(b.button('Move to another division')).toBeUndefined();
    TestBed.resetTestingModule();
    const c = await setup(['students.read', 'students.remove'], detail());
    expect(c.button('Remove student')).toBeDefined();
  });

  it('needs a reason before removing, then sends it and shows the removed banner', async () => {
    const { fixture, el, http, button } = await setup(
      ['students.read', 'students.manage', 'students.remove'],
      detail(),
    );
    button('Remove student')!.click();
    fixture.detectChanges();
    const confirm = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Remove student' && b.closest('p-dialog, .p-dialog'),
    ) as HTMLButtonElement | undefined;
    expect(confirm?.disabled).toBe(true);

    const box = document.getElementById('remove-reason') as HTMLTextAreaElement;
    box.value = 'Admitted twice by mistake';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(confirm?.disabled).toBe(false);
    confirm!.click();
    const req = http.expectOne('/api/students/s1/remove');
    expect(req.request.body).toEqual({ reason: 'Admitted twice by mistake' });
    req.flush(
      detail({
        status: 'REMOVED',
        removal: {
          at: '2026-11-10T10:00:00.000Z',
          reason: 'Admitted twice by mistake',
          by: 'Linda',
        },
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Removed');
    expect(el.textContent).toContain('Reason: Admitted twice by mistake');
    expect(button('Restore student')).toBeDefined();
    expect(button('Edit')).toBeUndefined();
  });

  it('restores a removed student', async () => {
    const { fixture, http, button } = await setup(
      ['students.read', 'students.remove'],
      detail({
        status: 'REMOVED',
        removal: { at: '2026-11-10T10:00:00.000Z', reason: 'Duplicate', by: null },
      }),
    );
    button('Restore student')!.click();
    http.expectOne('/api/students/s1/restore').flush(detail());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button('Remove student')).toBeDefined();
  });

  it('moves to another division and warns when fees were billed for the old class', async () => {
    const { fixture, el, http, button } = await setup(
      ['students.read', 'students.manage'],
      detail(),
    );
    button('Move to another division')!.click();
    fixture.detectChanges();
    http.expectOne('/api/classes').flush([
      { id: 'c1', name: 'Std 1', divisions: [{ id: 'd1', name: 'A' }] },
      { id: 'c2', name: 'Std 2', divisions: [{ id: 'd2', name: 'B' }] },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const selects = fixture.debugElement.queryAll(By.css('p-select'));
    selects[0].triggerEventHandler('ngModelChange', 'c2');
    fixture.detectChanges();
    fixture.debugElement.queryAll(By.css('p-select'))[1].triggerEventHandler('ngModelChange', 'd2');
    fixture.detectChanges();
    const go = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Move student',
    ) as HTMLButtonElement;
    go.click();
    const req = http.expectOne('/api/students/s1/move');
    expect(req.request.body).toEqual({ divisionId: 'd2' });
    req.flush({
      ...detail(),
      moved: { from: 'Std 1-A', to: 'Std 2-B', feesNeedReview: true },
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Fees were billed for the old class');
  });
});
