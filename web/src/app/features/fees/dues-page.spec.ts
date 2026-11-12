import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { MessageService } from '@openng/optimus-ui/api';
import { AuthService } from '../../core/auth.service';
import { DuesReport, DuesStudent } from '../../core/models';
import { DuesPage } from './dues-page';

const sums = { billed: '3000.00', collected: '1250.50', pending: '1749.50', overdue: '1749.50' };
const student = (over: Partial<DuesStudent> = {}): DuesStudent => ({
  studentId: 's1',
  admissionNo: '7',
  fullName: 'Noor Khan',
  class: 'Nursery',
  division: 'A',
  billed: '1000.00',
  collected: '0.00',
  pending: '1000.00',
  overdue: '1000.00',
  previousYearsPending: '200.00',
  status: 'OVERDUE',
  oldestOverdueOn: '2020-01-10',
  nextDueOn: null,
  lastPaidOn: null,
  ...over,
});
const report: DuesReport = {
  academicYearId: 'y',
  counts: { PAID: 1, PARTIAL: 0, UNPAID: 0, OVERDUE: 2, NONE: 0 },
  longestOverdue: [student()],
  byGender: [
    {
      gender: 'MALE',
      students: 1,
      owing: 1,
      billed: '1000.00',
      collected: '250.50',
      pending: '749.50',
      overdue: '749.50',
    },
    {
      gender: 'FEMALE',
      students: 2,
      owing: 1,
      billed: '2000.00',
      collected: '1000.00',
      pending: '1000.00',
      overdue: '1000.00',
    },
  ],
  totals: { students: 3, owing: 2, ...sums },
  byClass: [{ id: 'c1', label: 'Nursery', students: 3, owing: 2, ...sums }],
  byDivision: [{ id: 'd1', label: 'Nursery-A', students: 3, owing: 2, ...sums }],
  students: {
    items: [
      student(),
      student({
        studentId: 's2',
        fullName: 'Zara Ali',
        pending: '0.00',
        overdue: '0.00',
        collected: '1000.00',
        previousYearsPending: '0.00',
        status: 'PAID',
        oldestOverdueOn: null,
        lastPaidOn: '2026-10-02',
      }),
    ],
    total: 2,
    page: 1,
    pageSize: 20,
  },
};

async function setup(permissions = ['fees.read_all', 'fees.payment.create']) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), MessageService],
  });
  const auth = TestBed.inject(AuthService);
  auth.me.set({
    id: 'u',
    fullName: 'Accountant',
    roles: ['ACCOUNTANT'],
    permissions,
    mustChangePassword: false,
  });
  const fixture = TestBed.createComponent(DuesPage);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/api/classes').flush([]);
  http.expectOne((r) => r.url === '/api/fees/dues').flush(report);
  http.expectOne('/api/academic-years').flush([
    {
      id: 'y',
      name: '2026-27',
      startDate: '2026-04-01',
      endDate: '2027-03-31',
      isCurrent: true,
    },
  ]);
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r));
  http
    .expectOne((r) => r.url === '/api/payments/collection')
    .flush({
      from: '2026-04-01',
      to: '2026-11-12',
      total: '1250.50',
      byMode: [
        { mode: 'CASH', total: '1000.00', count: 1 },
        { mode: 'UPI', total: '250.50', count: 1 },
      ],
    });
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('DuesPage', () => {
  it('shows the totals, the status tabs with counts, and divisions under their class', async () => {
    const { el } = await setup();
    const text = el.textContent ?? '';
    expect(text).toContain('₹1,749.50');
    expect(text).toContain('42% of what was billed');
    expect(text).toContain('2 students past a due date');
    const tabs = Array.from(
      el.querySelectorAll('[aria-label="Show students by fee status"] [role="button"]'),
    ).map((b) => b.textContent?.replace(/\s+/g, ' ').trim());
    // Each option is the label followed by its count.
    expect(tabs).toEqual(['All3', 'Overdue2', 'Part paid0', 'Not paid0', 'Paid1']);
    expect(text).toContain('Nursery-A');
    expect(text).toContain('2 of 3');
  });

  it('says how late each student is, what came from earlier years, and when the paid ones paid', async () => {
    const { el } = await setup();
    const rows = Array.from(el.querySelectorAll('tbody tr'));
    const noor = rows.find((r) => r.textContent?.includes('Noor Khan'))!.textContent!;
    expect(noor).toMatch(/\d+ days late/);
    expect(noor).toContain('₹200.00 from earlier years');
    expect(noor).toContain('Overdue');
    const zara = rows.find((r) => r.textContent?.includes('Zara Ali'))!.textContent!;
    expect(zara).toMatch(/Paid 0?2 Oct 2026/);
    expect(zara).not.toContain('Record payment');
  });

  it('shows how money came in this year and who has waited longest', async () => {
    const { el } = await setup();
    const text = el.textContent ?? '';
    expect(text).toContain('How money came in');
    expect(text).toMatch(/Cash\s*80%/);
    expect(text).toMatch(/UPI\s*20%/);
    expect(text).toContain('Longest overdue');
    expect(el.querySelector('[aria-label="Record a payment for Noor Khan"]')).not.toBeNull();
  });

  it('asks the server for one status when its tab is chosen', async () => {
    const { fixture, http } = await setup();
    fixture.debugElement
      .query(By.css('[aria-label="Show students by fee status"]'))
      .triggerEventHandler('ngModelChange', 'OVERDUE');
    const req = http.expectOne((r) => r.url === '/api/fees/dues');
    expect(req.request.params.get('status')).toBe('OVERDUE');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(report);
  });

  it('opens the student with the payment form ready', async () => {
    const { el } = await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (
      el.querySelector(
        'tbody button[aria-label="Record a payment for Noor Khan"]',
      ) as HTMLButtonElement
    ).click();
    expect(navigate).toHaveBeenCalledWith(['/app/students', 's1'], { queryParams: { pay: 1 } });
  });

  it('offers no payment buttons to someone who may only look', async () => {
    const { el } = await setup(['fees.read_all']);
    expect(el.textContent).not.toContain('Record payment');
  });

  it('shows boys and girls as cards that filter the page', async () => {
    const { fixture, http, el } = await setup();
    const cards = Array.from(
      el.querySelectorAll('[aria-label="Show fees for everyone, boys or girls"] [role="button"]'),
    );
    // Each card: its label, the amount, and the line under it.
    const lines = (c: Element) =>
      Array.from(c.querySelectorAll('.app-eyebrow, .text-xl, .text-xs')).map((x) =>
        x.textContent?.replace(/\s+/g, ' ').trim(),
      );
    expect(cards.map(lines)).toEqual([
      ['Everyone', '₹1,250.50 collected', '3 students · ₹1,749.50 still to collect'],
      ['Boys', '₹250.50 collected', '1 student · ₹749.50 still to collect'],
      ['Girls', '₹1,000.00 collected', '2 students · ₹1,000.00 still to collect'],
    ]);
    (cards[1] as HTMLElement).click();
    const req = http.expectOne((r) => r.url === '/api/fees/dues');
    expect(req.request.params.get('gender')).toBe('MALE');
    req.flush(report);
    await fixture.whenStable();
  });
});
