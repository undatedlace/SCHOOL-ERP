import { StudentLedger } from '../../core/models';
import {
  daysBetween,
  fromPaise,
  lateText,
  percentText,
  share,
  statement,
  toPaise,
} from './fee-view';

const ledger: StudentLedger = {
  student: { id: 's', admissionNo: '1', fullName: 'Noor Khan' },
  totals: { gross: '31200.50', concessions: '1000.00', paid: '5000.00', pending: '25200.50' },
  invoices: [
    {
      id: 'i1',
      kind: 'FEE_STRUCTURE',
      note: null,
      createdAt: '2026-04-05T10:00:00.000Z',
      academicYear: { id: 'y', name: '2026-27' },
      lines: [
        { description: 'Tuition', amount: '30000.00' },
        { description: 'Books', amount: '1200.50' },
      ],
      concessions: [
        {
          id: 'c1',
          amount: '1000.00',
          reason: 'Sibling',
          createdAt: '2026-05-01T09:00:00.000Z',
          revoked: false,
          revokedReason: null,
        },
        {
          id: 'c2',
          amount: '500.00',
          reason: 'Typed twice',
          createdAt: '2026-05-02T09:00:00.000Z',
          revoked: true,
          revokedReason: 'Mistake',
        },
      ],
      instalments: [],
      gross: '31200.50',
      concessionTotal: '1000.00',
      paid: '5000.00',
      pending: '25200.50',
    },
  ],
  payments: [
    {
      id: 'p2',
      receiptNo: '2026-27/00002',
      amount: '700.00',
      mode: 'CHEQUE',
      reference: '000123',
      bank: null,
      paidOn: '2026-06-01',
      note: null,
      reversed: { reason: 'Cheque bounced', on: '2026-06-10' },
      allocations: [],
    },
    {
      id: 'p1',
      receiptNo: '2026-27/00001',
      amount: '5000.00',
      mode: 'CASH',
      reference: null,
      bank: null,
      paidOn: '2026-05-15',
      note: null,
      reversed: null,
      allocations: [],
    },
  ],
};

describe('fee statement', () => {
  it('lists fees, concessions, payments and a bounced cheque in date order with a running balance', () => {
    const rows = statement(ledger);
    expect(rows.map((r) => [r.date, r.description, r.charge, r.credit, r.balance])).toEqual([
      ['2026-04-05', 'Fees 2026-27', '31200.50', null, '31200.50'],
      ['2026-05-01', 'Concession', null, '1000.00', '30200.50'],
      ['2026-05-15', 'Payment, receipt 2026-27/00001', null, '5000.00', '25200.50'],
      ['2026-06-01', 'Payment, receipt 2026-27/00002', null, '700.00', '24500.50'],
      ['2026-06-10', 'Payment taken back, receipt 2026-27/00002', '700.00', null, '25200.50'],
    ]);
    // It ends where the ledger does.
    expect(rows.at(-1)!.balance).toBe(ledger.totals.pending);
    expect(rows[0].detail).toBe('Tuition, Books');
    expect(rows[3].detail).toBe('Cheque · 000123');
    expect(rows[4].detail).toBe('Cheque bounced');
  });

  it('leaves out a concession that was taken back', () => {
    expect(statement(ledger).some((r) => r.detail === 'Typed twice')).toBe(false);
  });
});

describe('fee helpers', () => {
  it('turns money text into paise and back without rounding errors', () => {
    expect(toPaise('1200.50')).toBe(120050);
    expect(toPaise('0.1')).toBe(10);
    expect(toPaise('-5.05')).toBe(-505);
    expect(fromPaise(120050)).toBe('1200.50');
    expect(fromPaise(-505)).toBe('-5.05');
    expect(fromPaise(toPaise('0.10') + toPaise('0.20'))).toBe('0.30');
  });

  it('works out a share of money and how many days late something is', () => {
    expect(share('1250.50', '3000.00')).toBeCloseTo(0.4168, 3);
    expect(share('5', '0.00')).toBe(0);
    expect(share('5000', '1000')).toBe(1);
    expect(daysBetween('2026-11-01', '2026-11-12')).toBe(11);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(lateText(1)).toBe('1 day late');
    expect(lateText(11)).toBe('11 days late');
    expect(percentText(0)).toBe('0%');
    expect(percentText(0.0008)).toBe('under 1%');
    expect(percentText(0.0912)).toBe('9%');
  });
});
