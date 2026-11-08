import {
  LedgerError,
  allocateOldestFirst,
  checkAllocations,
  fromPaise,
  netInstalments,
  pendingBalance,
  splitByWeights,
  toPaise,
  waterfall,
} from './ledger.js';

describe('money conversion', () => {
  it('reads and writes amounts without floating point', () => {
    expect(toPaise('1234.5')).toBe(123450);
    expect(toPaise('0.07')).toBe(7);
    expect(toPaise(10)).toBe(1000);
    expect(toPaise('0.1') + toPaise('0.2')).toBe(toPaise('0.3')); // the classic float trap
    expect(fromPaise(123450)).toBe('1234.50');
    expect(fromPaise(5)).toBe('0.05');
    expect(fromPaise(0)).toBe('0.00');
    expect(fromPaise(-250)).toBe('-2.50');
  });

  it('refuses things that are not money', () => {
    for (const bad of ['', 'abc', '1.234', '1,000', '1e3', '--1', '1.']) {
      expect(() => toPaise(bad), bad).toThrow(LedgerError);
    }
    expect(() => toPaise('99999999999999999')).toThrow(/too large/);
  });

  it('round-trips every kind of amount', () => {
    for (const p of [0, 1, 99, 100, 101, 123456789, 99_999_999_999]) {
      expect(toPaise(fromPaise(p))).toBe(p);
    }
  });
});

describe('splitByWeights', () => {
  it('always adds up to the total, with the remainder on the last part', () => {
    const parts = splitByWeights(10000, [1, 1, 1]); // 100.00 in three
    expect(parts).toEqual([3333, 3333, 3334]);
    for (const total of [0, 1, 7, 100, 12345, 999_999_999_999]) {
      for (const weights of [
        [1],
        [1, 1],
        [3333, 3333, 3334],
        [2500, 2500, 5000],
        [1, 2, 3, 4, 5],
      ]) {
        const p = splitByWeights(total, weights);
        expect(p.reduce((a, b) => a + b, 0)).toBe(total);
        expect(p.every((x) => x >= 0)).toBe(true);
      }
    }
  });

  it('is exact even when the product passes the safe-integer limit', () => {
    const p = splitByWeights(99_999_999_999, [9999, 1]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(99_999_999_999);
  });

  it('shares evenly when the weights are all zero, and handles nothing', () => {
    expect(splitByWeights(10, [0, 0, 0])).toEqual([3, 3, 4]);
    expect(splitByWeights(10, [])).toEqual([]);
    expect(() => splitByWeights(-1, [1])).toThrow(LedgerError);
  });
});

describe('netInstalments', () => {
  it('takes a concession off in proportion and keeps the total exact', () => {
    // 3 equal instalments of 1000.00, with 100.00 off
    const net = netInstalments([100000, 100000, 100000], 10000);
    expect(net.reduce((a, b) => a + b, 0)).toBe(290000);
    expect(net).toEqual([96666, 96666, 96668]);
  });

  it('with no concession, leaves the instalments as they were', () => {
    expect(netInstalments([5000, 2500], 0)).toEqual([5000, 2500]);
  });

  it('a concession for the whole invoice leaves nothing to pay; more than that is refused', () => {
    expect(netInstalments([5000, 5000], 10000)).toEqual([0, 0]);
    expect(() => netInstalments([5000, 5000], 10001)).toThrow(LedgerError);
    expect(() => netInstalments([5000], -1)).toThrow(LedgerError);
  });
});

describe('waterfall', () => {
  const net = [1000, 1000, 1000];
  it('a part payment covers part of the first instalment', () => {
    expect(waterfall(net, 400)).toEqual([
      { due: 1000, paid: 400, pending: 600 },
      { due: 1000, paid: 0, pending: 1000 },
      { due: 1000, paid: 0, pending: 1000 },
    ]);
  });
  it('a bigger payment covers several instalments', () => {
    const w = waterfall(net, 2500);
    expect(w.map((x) => x.pending)).toEqual([0, 0, 500]);
  });
  it('paying everything leaves nothing, and nothing paid leaves everything', () => {
    expect(waterfall(net, 3000).every((x) => x.pending === 0)).toBe(true);
    expect(waterfall(net, 0).map((x) => x.pending)).toEqual(net);
  });
});

describe('allocateOldestFirst', () => {
  const invoices = [
    { id: 'old', pending: 3000 },
    { id: 'new', pending: 5000 },
  ];
  it('pays the oldest invoice first, then the next', () => {
    expect(allocateOldestFirst(invoices, 2000)).toEqual([
      { invoiceId: 'old', amount: 2000 },
    ]);
    expect(allocateOldestFirst(invoices, 4500)).toEqual([
      { invoiceId: 'old', amount: 3000 },
      { invoiceId: 'new', amount: 1500 },
    ]);
  });
  it('skips invoices that owe nothing', () => {
    expect(
      allocateOldestFirst([{ id: 'paid', pending: 0 }, ...invoices], 100),
    ).toEqual([{ invoiceId: 'old', amount: 100 }]);
  });
  it('refuses more than is owed, zero, and fractions of a paisa', () => {
    expect(() => allocateOldestFirst(invoices, 8001)).toThrow(
      /more than what is owed/,
    );
    expect(() => allocateOldestFirst(invoices, 0)).toThrow(LedgerError);
    expect(() => allocateOldestFirst(invoices, 10.5)).toThrow(LedgerError);
  });
});

describe('checkAllocations', () => {
  const invoices = [
    { id: 'a', pending: 3000 },
    { id: 'b', pending: 5000 },
  ];
  it('accepts a correct split', () => {
    expect(() =>
      checkAllocations(invoices, [{ invoiceId: 'b', amount: 4000 }], 4000),
    ).not.toThrow();
  });
  it('refuses a split that does not add up, overpays an invoice, repeats one, or names a stranger', () => {
    expect(() =>
      checkAllocations(invoices, [{ invoiceId: 'a', amount: 1000 }], 2000),
    ).toThrow(/add up/);
    expect(() =>
      checkAllocations(invoices, [{ invoiceId: 'a', amount: 3001 }], 3001),
    ).toThrow(/still owed/);
    expect(() =>
      checkAllocations(
        invoices,
        [
          { invoiceId: 'a', amount: 1 },
          { invoiceId: 'a', amount: 1 },
        ],
        2,
      ),
    ).toThrow(/twice/);
    expect(() =>
      checkAllocations(invoices, [{ invoiceId: 'zzz', amount: 1 }], 1),
    ).toThrow(/does not belong/);
    expect(() =>
      checkAllocations(invoices, [{ invoiceId: 'a', amount: 0 }], 0),
    ).toThrow(LedgerError);
  });
});

describe('pendingBalance', () => {
  it('is invoiced minus concessions minus payments that count', () => {
    expect(pendingBalance(100000, 10000, 30000)).toBe(60000);
    expect(pendingBalance(100000, 0, 0)).toBe(100000);
  });
});
