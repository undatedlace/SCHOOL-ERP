import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { AuthService } from '../../core/auth.service';
import { ApplicationDetail } from '../../core/models';
import { ApplicationPage } from './application-page';

const granted = (): ApplicationDetail => ({
  id: 'app-1',
  formNo: '7',
  seq: 7,
  status: 'GRANTED',
  studentName: 'Ayaan Imran Shaikh',
  dateOfBirth: '2021-06-15',
  receivedOn: '2026-06-01',
  class: { id: 'c1', name: 'Nursery' },
  academicYear: { id: 'y1', name: '2026-27' },
  answers: {},
  form: { id: 'f1', version: 2, name: 'Application', schema: { sections: [] } },
  decision: {
    decidedAt: '2026-06-02T10:00:00Z',
    note: null,
    grantedClass: { id: 'c1', name: 'Nursery' },
    grantedDivision: null,
  },
  allowedDecisions: [],
  editable: false,
  createdAt: '2026-06-01T10:00:00Z',
  studentId: null,
  admittedAt: null,
  eligibility: null,
  suggestedGuardians: [
    { fullName: 'Imran Shaikh', relationship: 'FATHER', mobile: '9876543210', isPrimary: true },
    { fullName: 'Ayesha Shaikh', relationship: 'MOTHER', mobile: '9876543210', isPrimary: false },
  ],
});

/** The parts of the component these tests use (they are protected in the component itself). */
interface PageInternals {
  openAdmit(): void;
  admit(): Promise<void>;
  guardianRows: { getRawValue(): { fullName: string; relationship: string; mobile: string }[] };
  primaryIndex: { (): number; set(i: number): void };
  admitForm: { patchValue(v: Record<string, unknown>): void };
  admitError: () => string | null;
  admitFieldError: () => string | null;
}

async function setup(app: ApplicationDetail) {
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
  auth.me.set({
    id: 'u1',
    fullName: 'Office',
    roles: ['OFFICE_STAFF'],
    permissions: ['admissions.read', 'admissions.manage', 'students.manage', 'students.read_all'],
    mustChangePassword: false,
  });

  const fixture = TestBed.createComponent(ApplicationPage);
  fixture.componentRef.setInput('id', app.id);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(`/api/admissions/applications/${app.id}`).flush(app);
  http.expectOne('/api/classes').flush([
    {
      id: 'c1',
      name: 'Nursery',
      sortOrder: 1,
      divisions: [
        { id: 'dA', name: 'A' },
        { id: 'dB', name: 'B' },
      ],
    },
  ]);
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Loading...');
  });
  return { fixture, http, page: fixture.componentInstance as unknown as PageInternals };
}

describe('ApplicationPage: admitting a granted application', () => {
  it('offers to admit only a granted application that has no student yet', async () => {
    const { fixture } = await setup(granted());
    expect(fixture.nativeElement.textContent).toContain('Admit as student');

    TestBed.resetTestingModule();
    const done = await setup({
      ...granted(),
      studentId: 's1',
      admittedAt: '2026-06-03T10:00:00Z',
      suggestedGuardians: [],
    });
    expect(done.fixture.nativeElement.textContent).not.toContain('Admit as student');
    expect(done.fixture.nativeElement.textContent).toContain('View student');
  });

  it('fills the guardians in from the suggestions, with the first as primary contact', async () => {
    const { page } = await setup(granted());
    page.openAdmit();
    const rows = page.guardianRows.getRawValue();
    expect(rows.map((r: { fullName: string }) => r.fullName)).toEqual([
      'Imran Shaikh',
      'Ayesha Shaikh',
    ]);
    expect(rows[0]).toMatchObject({ relationship: 'FATHER', mobile: '9876543210' });
    expect(page.primaryIndex()).toBe(0);
  });

  it('sends the division, the guardians and the primary contact, then opens the new student', async () => {
    const { page, http } = await setup(granted());
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    page.openAdmit();
    page.admitForm.patchValue({ divisionId: 'dB', admissionNo: ' ADM-9 ' });
    page.primaryIndex.set(1);
    const done = page.admit();

    const req = http.expectOne('/api/admissions/applications/app-1/admit');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({
      divisionId: 'dB',
      admissionNo: 'ADM-9',
      guardians: [
        {
          fullName: 'Imran Shaikh',
          relationship: 'FATHER',
          mobile: '9876543210',
          isPrimary: false,
        },
        {
          fullName: 'Ayesha Shaikh',
          relationship: 'MOTHER',
          mobile: '9876543210',
          isPrimary: true,
        },
      ],
    });
    expect(req.request.body.joinedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    req.flush({ studentId: 's-new', admissionNo: 'ADM-9' });
    await done;

    expect(navigate).toHaveBeenCalledWith(['/app/students', 's-new']);
    http.verify();
  });

  it('will not send the request without a division', async () => {
    const { page, http } = await setup(granted());
    page.openAdmit();
    await page.admit();
    http.expectNone('/api/admissions/applications/app-1/admit');
    expect(page.admitError()).toMatch(/Choose a division/);
  });

  it('shows a taken admission number on that field, and other errors in the dialog', async () => {
    const { page, http } = await setup(granted());
    page.openAdmit();
    page.admitForm.patchValue({ divisionId: 'dA', admissionNo: '12' });

    let done = page.admit();
    http
      .expectOne('/api/admissions/applications/app-1/admit')
      .flush(
        { message: 'Admission number 12 is already used' },
        { status: 409, statusText: 'Conflict' },
      );
    await done;
    expect(page.admitFieldError()).toContain('Admission number 12');
    expect(page.admitError()).toBeNull();

    done = page.admit();
    http
      .expectOne('/api/admissions/applications/app-1/admit')
      .flush(
        { message: 'Choose a division of the class the student was granted' },
        { status: 400, statusText: 'Bad Request' },
      );
    await done;
    expect(page.admitError()).toContain('Choose a division');
  });

  it('shows a warning when the child is not eligible for the class, and nothing when they are', async () => {
    const warned = await setup({
      ...granted(),
      status: 'RECEIVED',
      suggestedGuardians: [],
      eligibility: {
        eligible: false,
        issues: [
          'Admissions are not open for Nursery.',
          'The child is 2 years 11 months old as on 2026-07-31, and Nursery needs at least 3 years.',
        ],
        ageMonths: 35,
        ageText: '2 years 11 months',
        asOn: '2026-07-31',
      },
    });
    const text = warned.fixture.nativeElement.textContent as string;
    expect(text).toContain('Admissions are not open for Nursery.');
    expect(text).toContain('needs at least 3 years');

    TestBed.resetTestingModule();
    const fine = await setup({
      ...granted(),
      status: 'RECEIVED',
      suggestedGuardians: [],
      eligibility: {
        eligible: true,
        issues: [],
        ageMonths: 60,
        ageText: '5 years 0 months',
        asOn: '2026-07-31',
      },
    });
    expect(fine.fixture.nativeElement.textContent).not.toContain('needs at least');
  });
});
