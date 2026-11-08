import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { AuthService } from '../../core/auth.service';
import { StudentLedger } from '../../core/models';
import { StudentFees } from './student-fees';

const ledger = (pending = '26200.50'): StudentLedger => ({
  student: { id: 's1', admissionNo: '12', fullName: 'Noor Khan' },
  totals: { gross: '31200.50', concessions: '0.00', paid: '5000.00', pending },
  invoices: [
    {
      id: 'i1',
      kind: 'FEE_STRUCTURE',
      note: null,
      academicYear: { id: 'y', name: '2026-27' },
      lines: [{ description: 'Tuition', amount: '30000.00' }],
      concessions: [],
      instalments: [
        {
          seq: 1,
          label: 'Term 1',
          dueDate: '2020-01-10',
          due: '12480.20',
          paid: '5000.00',
          pending: '7480.20',
          overdue: true,
        },
      ],
      gross: '31200.50',
      concessionTotal: '0.00',
      paid: '5000.00',
      pending,
    },
  ],
  payments: [
    {
      id: 'p1',
      receiptNo: '2026-27/00001',
      amount: '5000.00',
      mode: 'CASH',
      reference: null,
      bank: null,
      paidOn: '2026-11-01',
      note: null,
      reversed: null,
      allocations: [],
    },
  ],
});

interface Internals {
  openPay(): void;
  submitPay(): Promise<void>;
  payForm: { patchValue(v: Record<string, unknown>): void };
  formError: () => string | null;
}

function setup(permissions: string[]) {
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
  const fixture = TestBed.createComponent(StudentFees);
  fixture.componentRef.setInput('studentId', 's1');
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  return {
    fixture,
    http,
    el: fixture.nativeElement as HTMLElement,
    c: fixture.componentInstance as unknown as Internals,
  };
}

describe('StudentFees', () => {
  it('shows what is owed in rupees, with overdue instalments marked', async () => {
    const { fixture, http, el } = setup(['fees.read']);
    http.expectOne('/api/students/s1/fees').flush(ledger());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('₹26,200.50');
    expect(el.textContent).toContain('₹31,200.50');
    expect(el.textContent).toContain('2026-27/00001');
    expect(el.textContent).toContain('Overdue');
  });

  it('a parent (fees.read only) has no way to record, reverse or give concessions', async () => {
    const { fixture, http, el } = setup(['fees.read']);
    http.expectOne('/api/students/s1/fees').flush(ledger());
    await fixture.whenStable();
    fixture.detectChanges();
    const buttons = Array.from(el.querySelectorAll('button')).map((b) => b.textContent ?? '');
    for (const word of ['Record payment', 'Reverse', 'Concession', 'Previous dues']) {
      expect(buttons.join('|'), word).not.toContain(word);
    }
    const text = el.textContent ?? '';
    expect(text).toContain('Receipt'); // but may download a receipt
  });

  it('the accountant records a payment, sending the amount as text and asking for the reference of a cheque', async () => {
    const { fixture, http, c } = setup(['fees.read', 'fees.payment.create']);
    http.expectOne('/api/students/s1/fees').flush(ledger());
    await fixture.whenStable();

    c.openPay();
    c.payForm.patchValue({ amount: '1500.50', mode: 'CHEQUE', reference: '' });
    await c.submitPay();
    http.expectNone((r) => r.method === 'POST'); // cheque number missing: nothing is sent

    c.payForm.patchValue({ reference: '000123' });
    const sent = c.submitPay();
    const req = http.expectOne('/api/students/s1/payments');
    expect(req.request.body).toMatchObject({
      amount: '1500.50',
      mode: 'CHEQUE',
      reference: '000123',
    });
    expect(typeof req.request.body.amount).toBe('string');
    req.flush({});
    await vi.waitFor(() => http.expectOne('/api/students/s1/fees').flush(ledger('24700.00')));
    await sent;
  });

  it('refuses an amount with the wrong shape before asking the server', async () => {
    const { fixture, http, c } = setup(['fees.read', 'fees.payment.create']);
    http.expectOne('/api/students/s1/fees').flush(ledger());
    await fixture.whenStable();
    c.openPay();
    for (const bad of ['', '0', '12.345', 'abc', '-5']) {
      c.payForm.patchValue({ amount: bad, mode: 'CASH' });
      await c.submitPay();
    }
    http.expectNone((r) => r.method === 'POST');
  });

  it('shows the server message when a payment is refused', async () => {
    const { fixture, http, c } = setup(['fees.read', 'fees.payment.create']);
    http.expectOne('/api/students/s1/fees').flush(ledger());
    await fixture.whenStable();
    c.openPay();
    c.payForm.patchValue({ amount: '999999', mode: 'CASH' });
    const sent = c.submitPay();
    http
      .expectOne('/api/students/s1/payments')
      .flush(
        { message: 'The payment is more than what is owed' },
        { status: 400, statusText: 'Bad Request' },
      );
    await sent;
    expect(c.formError()).toContain('more than what is owed');
  });
});
