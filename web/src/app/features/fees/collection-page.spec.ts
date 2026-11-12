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
      total: '2500.00',
      byMode: [{ mode: 'CASH', total: '2500.00', count: 1 }],
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
});
