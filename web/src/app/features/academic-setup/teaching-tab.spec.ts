import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { AuthService } from '../../core/auth.service';
import { TeachingTab } from './teaching-tab';

interface Internals {
  openAssign(): void;
  openChange(a: unknown): void;
  save(): Promise<void>;
  form: { patchValue(v: Record<string, unknown>): void };
  error: () => string | null;
  divisionOptions: () => { id: string; label: string }[];
  roleOptions: () => { id: string; label: string }[];
}

async function setup() {
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
    id: 'u',
    fullName: 'Admin',
    roles: ['SCHOOL_ADMIN'],
    permissions: ['academics.read', 'academics.manage'],
    mustChangePassword: false,
  });
  const fixture = TestBed.createComponent(TeachingTab);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne((r) => r.url === '/api/teaching-assignments').flush([]);
  http.expectOne('/api/classes').flush([
    {
      id: 'c1',
      name: 'Std 5',
      sortOrder: 1,
      minAgeYears: null,
      admissionsOpen: true,
      divisions: [{ id: 'dA', name: 'A' }],
    },
  ]);
  http.expectOne('/api/subjects').flush([{ id: 'sM', name: 'Maths', code: null }]);
  http
    .expectOne((r) => r.url === '/api/staff')
    .flush({ items: [], total: 0, page: 1, pageSize: 100 });
  await fixture.whenStable();
  return { page: fixture.componentInstance as unknown as Internals, http };
}

/** After a save the list reloads, a moment later (once the save's promise has resolved). */
async function reloaded(http: HttpTestingController) {
  await vi.waitFor(() => {
    http.expectOne((r) => r.url === '/api/teaching-assignments').flush([]);
  });
}

describe('TeachingTab', () => {
  it('offers each division as "Class-Division", and "Class teacher" first among the roles', async () => {
    const { page } = await setup();
    expect(page.divisionOptions()).toEqual([{ id: 'dA', label: 'Std 5-A' }]);
    expect(page.roleOptions().map((r) => r.label)).toEqual(['Class teacher', 'Maths']);
  });

  it('assigns a class teacher without a subject, and a subject teacher with one', async () => {
    const { page, http } = await setup();
    page.openAssign();
    page.form.patchValue({ divisionId: 'dA', subjectId: '', staffId: 't1' });
    let done = page.save();
    let req = http.expectOne('/api/teaching-assignments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ staffId: 't1', divisionId: 'dA' });
    req.flush({});
    await reloaded(http);
    await done;

    page.openAssign();
    page.form.patchValue({ divisionId: 'dA', subjectId: 'sM', staffId: 't2' });
    done = page.save();
    req = http.expectOne('/api/teaching-assignments');
    expect(req.request.body).toEqual({ staffId: 't2', divisionId: 'dA', subjectId: 'sM' });
    req.flush({});
    await reloaded(http);
    await done;
  });

  it('shows who already holds the place when it is taken', async () => {
    const { page, http } = await setup();
    page.openAssign();
    page.form.patchValue({ divisionId: 'dA', subjectId: '', staffId: 't1' });
    const done = page.save();
    http.expectOne('/api/teaching-assignments').flush(
      {
        message:
          'Std 5-A already has Asha Rao as class teacher. Change or remove that assignment first.',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await done;
    expect(page.error()).toContain('already has Asha Rao as class teacher');
  });

  it('will not send an incomplete form', async () => {
    const { page, http } = await setup();
    page.openAssign();
    await page.save();
    http.expectNone('/api/teaching-assignments');
  });

  it('hands an assignment to another teacher with a PATCH', async () => {
    const { page, http } = await setup();
    page.openChange({
      id: 'a1',
      division: { id: 'dA', name: 'A', class: { id: 'c1', name: 'Std 5' } },
      subject: null,
      staff: { id: 't1', fullName: 'Asha Rao', status: 'ACTIVE' },
    });
    page.form.patchValue({ staffId: 't9' });
    const done = page.save();
    const req = http.expectOne('/api/teaching-assignments/a1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ staffId: 't9' });
    req.flush({});
    await reloaded(http);
    await done;
  });
});
