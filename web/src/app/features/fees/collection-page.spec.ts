import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Collection, Page, PaymentRow } from '../../core/models';
import { CollectionPage } from './collection-page';

const row = (over: Partial<PaymentRow>): PaymentRow => ({
  id: 'p1',
  receiptNo: '2026-27/00001',
  studentId: 's1',
  admissionNo: '7',
  studentName: 'Noor Khan',
  amount: '2500.00',
  mode: 'CASH',
  reference: null,
  paidOn: '2026-11-09',
  reversed: false,
  ...over,
});

describe('CollectionPage', () => {
  it("shows today's totals by mode and each receipt, with reversed payments marked", async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(CollectionPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const list: Page<PaymentRow> = {
      items: [
        row({}),
        row({
          id: 'p2',
          receiptNo: '2026-27/00002',
          amount: '1000.00',
          mode: 'UPI',
          reference: 'UPI-77',
          reversed: true,
        }),
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    };
    const collection: Collection = {
      from: '2026-11-09',
      to: '2026-11-09',
      gender: null,
      total: '2500.00',
      byMode: [{ mode: 'CASH', total: '2500.00', count: 1 }],
      byGender: [
        { gender: 'MALE', total: '1500.00', count: 1, students: 1 },
        { gender: 'FEMALE', total: '1000.00', count: 1, students: 1 },
      ],
    };
    const payments = http.expectOne((r) => r.url === '/api/payments');
    expect(payments.request.params.get('from')).toBe(payments.request.params.get('to'));
    payments.flush(list);
    http.expectOne((r) => r.url === '/api/payments/collection').flush(collection);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve)); // both requests settle
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('₹2,500.00');
    expect(text).toMatch(/Cash.*1 payment/);
    expect(text).toContain('2026-27/00002');
    expect(text).toContain('UPI-77');
    expect(text).toContain('Reversed');
    expect(el.querySelector('a[href="/api/payments/p1/receipt"]')).not.toBeNull();
  });

  it('shows boys and girls as cards, and choosing one limits the totals and the receipts', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(CollectionPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const empty: Page<PaymentRow> = { items: [], total: 0, page: 1, pageSize: 20 };
    const collection: Collection = {
      from: '2026-11-09',
      to: '2026-11-09',
      gender: null,
      total: '2500.00',
      byMode: [{ mode: 'CASH', total: '2500.00', count: 2 }],
      byGender: [
        { gender: 'MALE', total: '1500.00', count: 1, students: 1 },
        { gender: 'FEMALE', total: '1000.00', count: 1, students: 1 },
      ],
    };
    http.expectOne((r) => r.url === '/api/payments').flush(empty);
    http.expectOne((r) => r.url === '/api/payments/collection').flush(collection);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const cards = Array.from(
      el.querySelectorAll(
        '[aria-label="Show money received from everyone, boys or girls"] [role="button"]',
      ),
    );
    // Each card: its label, the amount, and the line under it.
    const lines = (c: Element) =>
      Array.from(c.querySelectorAll('.app-eyebrow, .text-xl, .text-xs')).map((x) =>
        x.textContent?.replace(/\s+/g, ' ').trim(),
      );
    expect(cards.map(lines)).toEqual([
      ['Everyone', '₹2,500.00', '2 students · 2 payments'],
      ['Boys', '₹1,500.00', '1 student · 1 payment'],
      ['Girls', '₹1,000.00', '1 student · 1 payment'],
    ]);
    expect(cards[0].getAttribute('aria-pressed')).toBe('true');

    (cards[2] as HTMLElement).click();
    const list = http.expectOne((r) => r.url === '/api/payments');
    expect(list.request.params.get('gender')).toBe('FEMALE');
    list.flush(empty);
    const totals = http.expectOne((r) => r.url === '/api/payments/collection');
    expect(totals.request.params.get('gender')).toBe('FEMALE');
    totals.flush({ ...collection, gender: 'FEMALE', total: '1000.00' });
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(el.textContent).toContain('Collected, girls');
  });
});
