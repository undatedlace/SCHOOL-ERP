import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from '@openng/optimus-ui/api';
import { LeaveSettings } from './leave-settings';

/** Waits for requests to finish and for the page to catch up (several requests settle in a row). */
const settle = async (f: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  await f.whenStable();
  await new Promise((r) => setTimeout(r));
  f.detectChanges();
};

const types = [
  { id: 'c', name: 'Casual leave', unlimited: false, active: true },
  { id: 'u', name: 'Unpaid leave', unlimited: true, active: true },
  { id: 'o', name: 'Old kind', unlimited: false, active: false },
];
const staffTypes = [
  { id: 't', name: 'Teacher', isTeaching: true, active: true, staffCount: 3, formKey: 'staff-t' },
  { id: 'k', name: 'Clerk', isTeaching: false, active: true, staffCount: 1, formKey: 'staff-k' },
];
const years = [
  {
    id: 'y2',
    name: '2027-28',
    startDate: '2027-04-01',
    endDate: '2028-03-31',
    isCurrent: false,
    ageCutoffDate: null,
  },
  {
    id: 'y1',
    name: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    isCurrent: true,
    ageCutoffDate: null,
  },
];

async function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), MessageService],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(LeaveSettings);
  fixture.detectChanges();
  http.expectOne((r) => r.url === '/api/leave/types').flush(types);
  http.expectOne((r) => r.url === '/api/staff-types').flush(staffTypes);
  http.expectOne('/api/academic-years').flush(years);
  await settle(fixture);
  http
    .expectOne((r) => r.url === '/api/leave/entitlements')
    .flush({
      academicYear: { id: 'y1', name: '2026-27' },
      items: [{ leaveTypeId: 'c', staffTypeId: null, days: 12 }],
    });
  await settle(fixture);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const box = (label: string) =>
    el.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  const type = (label: string, value: string) => {
    const b = box(label);
    b.value = value;
    b.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  return { fixture, http, el, box, type };
}

describe('LeaveSettings', () => {
  it('opens on the current year with the saved allowance, a column for each staff type, and only kinds in use', async () => {
    const { el, box } = await setup();
    expect((el.querySelector('#ls-year') as HTMLSelectElement).value).toBe('y1');
    expect(box('Casual leave, everyone').value).toBe('12');
    expect(box('Casual leave, Teacher').value).toBe('');
    expect(box('Unpaid leave, Clerk')).not.toBeNull();
    expect(el.querySelector('input[aria-label="Old kind, everyone"]')).toBeNull();
    expect(el.textContent).toContain('No limit: days are not checked');
  });

  it('saves whole and half days, with a number for a staff type, leaving empty boxes out', async () => {
    const { fixture, http, el, type } = await setup();
    type('Casual leave, Teacher', '15');
    type('Unpaid leave, everyone', '');
    type('Casual leave, Clerk', '7.5');
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Save the allowance'),
      ) as HTMLButtonElement
    ).click();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/leave/entitlements');
    expect(req.request.body.academicYearId).toBe('y1');
    expect(req.request.body.items).toEqual(
      expect.arrayContaining([
        { leaveTypeId: 'c', staffTypeId: null, days: 12 },
        { leaveTypeId: 'c', staffTypeId: 't', days: 15 },
        { leaveTypeId: 'c', staffTypeId: 'k', days: 7.5 },
      ]),
    );
    expect(req.request.body.items).toHaveLength(3);
    req.flush({ academicYear: { id: 'y1', name: '2026-27' }, items: [] });
    await settle(fixture);
  });

  it('refuses a number that is not whole or half days, without asking the server', async () => {
    const { fixture, http, el, type } = await setup();
    type('Casual leave, Teacher', '2.3');
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Save the allowance'),
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    http.expectNone((r) => r.method === 'PUT');
    expect(el.textContent).toContain('"2.3" is not a number of days');
  });

  it('shows another year when picked, and copies into this year from another', async () => {
    const { fixture, http, el } = await setup();
    const copy = el.querySelector('#ls-copy') as HTMLSelectElement;
    copy.value = 'y2';
    copy.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    (
      Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Copy',
      ) as HTMLButtonElement
    ).click();
    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url === '/api/leave/entitlements/copy',
    );
    expect(req.request.body).toEqual({ fromAcademicYearId: 'y2', toAcademicYearId: 'y1' });
    req.flush({ items: [] });
    await settle(fixture);
    http
      .expectOne((r) => r.url === '/api/leave/entitlements')
      .flush({ academicYear: { id: 'y1', name: '2026-27' }, items: [] });
    await settle(fixture);
  });

  it('says what to do when there are no kinds yet', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), MessageService],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(LeaveSettings);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/leave/types').flush([]);
    http.expectOne((r) => r.url === '/api/staff-types').flush([]);
    http.expectOne('/api/academic-years').flush(years);
    await settle(fixture);
    http
      .expectOne((r) => r.url === '/api/leave/entitlements')
      .flush({ academicYear: { id: 'y1', name: '2026-27' }, items: [] });
    await settle(fixture);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Add a kind of leave above first.',
    );
  });
});
