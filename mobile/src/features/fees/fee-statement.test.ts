import { feeTotals, instalmentStatus, invoiceTitle, statement } from './fee-statement';
import type { LedgerInstalment, LedgerInvoice, LedgerPayment, StudentLedger } from './types';

function instalment(over: Partial<LedgerInstalment> = {}): LedgerInstalment {
  return { seq: 1, label: 'Term 1', dueDate: '2026-06-10', due: '16000.00', paid: '0.00', pending: '16000.00', overdue: false, ...over };
}

function invoice(over: Partial<LedgerInvoice> = {}): LedgerInvoice {
  return {
    id: 'inv1',
    kind: 'FEE_STRUCTURE',
    note: null,
    createdAt: '2026-04-02T05:00:00.000Z',
    academicYear: { id: 'y1', name: '2026-27' },
    lines: [
      { description: 'Tuition Fee', amount: '28000.00' },
      { description: 'Books', amount: '4000.00' },
    ],
    concessions: [],
    instalments: [instalment(), instalment({ seq: 2, label: 'Term 2', dueDate: '2026-10-10' })],
    gross: '32000.00',
    concessionTotal: '0.00',
    paid: '0.00',
    pending: '32000.00',
    ...over,
  };
}

function payment(over: Partial<LedgerPayment> = {}): LedgerPayment {
  return {
    id: 'p1',
    receiptNo: '2026-27/00001',
    amount: '12800.00',
    mode: 'CASH',
    reference: null,
    bank: null,
    paidOn: '2026-05-01',
    note: null,
    reversed: null,
    ...over,
  };
}

function ledger(over: Partial<StudentLedger> = {}): StudentLedger {
  return {
    student: { id: 's1', admissionNo: 'DS0005', fullName: 'Ayaan Kiran Khan' },
    totals: { gross: '32000.00', concessions: '0.00', paid: '12800.00', pending: '19200.00' },
    invoices: [invoice()],
    payments: [payment()],
    ...over,
  };
}

describe('feeTotals', () => {
  it('reads the totals in paise and adds up the overdue part', () => {
    const l = ledger({
      invoices: [
        invoice({
          instalments: [
            instalment({ overdue: true, pending: '3200.10' }),
            instalment({ seq: 2, overdue: true, pending: '0.20' }),
            instalment({ seq: 3, overdue: false, pending: '9999.00' }),
          ],
        }),
      ],
    });
    expect(feeTotals(l)).toEqual({ billed: 3200000, paid: 1280000, toPay: 1920000, overdue: 320030 });
  });

  it('does not drift on amounts that floats cannot hold', () => {
    const l = ledger({
      invoices: [invoice({ instalments: [instalment({ overdue: true, pending: '0.10' }), instalment({ seq: 2, overdue: true, pending: '0.20' })] })],
    });
    expect(feeTotals(l).overdue).toBe(30);
  });
});

describe('instalmentStatus', () => {
  it('says paid, part paid, overdue or due', () => {
    expect(instalmentStatus(instalment({ pending: '0.00', paid: '16000.00' }))).toEqual({ label: 'Paid', tone: 'good' });
    expect(instalmentStatus(instalment({ paid: '5000.00', pending: '11000.00' }))).toEqual({ label: 'Part paid', tone: 'warn' });
    expect(instalmentStatus(instalment({ overdue: true }))).toEqual({ label: 'Overdue', tone: 'bad' });
    expect(instalmentStatus(instalment({ overdue: true, paid: '100.00', pending: '15900.00' })).label).toBe('Part paid, overdue');
    expect(instalmentStatus(instalment())).toEqual({ label: 'Due', tone: 'neutral' });
  });
});

describe('invoiceTitle', () => {
  it('names the year, and previous dues', () => {
    expect(invoiceTitle(invoice())).toBe('Fees 2026-27');
    expect(invoiceTitle(invoice({ kind: 'OPENING_BALANCE' }))).toBe('Previous dues (2026-27)');
  });
});

describe('statement', () => {
  it('lists the bill and then the payment with the balance after each', () => {
    const rows = statement(ledger());
    expect(rows.map((r) => [r.description, r.charge, r.credit, r.balance])).toEqual([
      ['Fees 2026-27', 3200000, null, 3200000],
      ['Payment, receipt 2026-27/00001', null, 1280000, 1920000],
    ]);
    expect(rows[0]!.detail).toBe('Tuition Fee, Books');
    expect(rows[1]!.detail).toBe('Cash');
  });

  it('ends at what is still to pay', () => {
    const rows = statement(ledger());
    expect(rows[rows.length - 1]!.balance).toBe(feeTotals(ledger()).toPay);
  });

  it('shows a taken-back payment twice and a reference on cheques', () => {
    const l = ledger({
      payments: [payment({ mode: 'CHEQUE', reference: '000123', reversed: { reason: 'Cheque bounced', on: '2026-05-10' } })],
      totals: { gross: '32000.00', concessions: '0.00', paid: '0.00', pending: '32000.00' },
    });
    const rows = statement(l);
    expect(rows.map((r) => r.description)).toEqual([
      'Fees 2026-27',
      'Payment, receipt 2026-27/00001',
      'Payment taken back, receipt 2026-27/00001',
    ]);
    expect(rows[1]!.detail).toBe('Cheque, 000123');
    expect(rows[2]!.detail).toBe('Cheque bounced');
    expect(rows[2]!.balance).toBe(3200000);
  });

  it('counts concessions, but not revoked ones', () => {
    const l = ledger({
      invoices: [
        invoice({
          concessions: [
            { id: 'c1', amount: '2000.00', reason: 'Sibling', createdAt: '2026-04-05T05:00:00.000Z', revoked: false, revokedReason: null },
            { id: 'c2', amount: '500.00', reason: 'Mistake', createdAt: '2026-04-06T05:00:00.000Z', revoked: true, revokedReason: 'Wrong student' },
          ],
        }),
      ],
      payments: [],
    });
    const rows = statement(l);
    expect(rows.map((r) => r.description)).toEqual(['Fees 2026-27', 'Concession']);
    expect(rows[1]!.balance).toBe(3000000);
  });

  it('puts events on the same day in a fixed order (bill, concession, payment, take back)', () => {
    const l = ledger({
      invoices: [invoice({ createdAt: '2026-05-01T05:00:00.000Z' })],
      payments: [payment({ paidOn: '2026-05-01' })],
    });
    expect(statement(l).map((r) => r.description)[0]).toBe('Fees 2026-27');
  });

  it('dates a bill by the India day, not the UTC day', () => {
    // 20:00 UTC on 1 May is 01:30 on 2 May in India.
    const l = ledger({ invoices: [invoice({ createdAt: '2026-05-01T20:00:00.000Z' })], payments: [payment({ paidOn: '2026-05-01' })] });
    const rows = statement(l);
    expect(rows[0]!.description).toBe('Payment, receipt 2026-27/00001');
    expect(rows[1]!.date).toBe('2026-05-02');
  });
});
