import { duesStatus } from './dues.service.js';

const sums = (
  billed: number,
  collected: number,
  pending: number,
  overdue = 0,
) => ({
  billed,
  collected,
  pending,
  overdue,
});

describe('duesStatus', () => {
  it('is NONE when nothing has been billed', () => {
    expect(duesStatus(sums(0, 0, 0))).toBe('NONE');
  });
  it('is PAID when nothing is pending', () => {
    expect(duesStatus(sums(1000, 1000, 0))).toBe('PAID');
  });
  it('is OVERDUE when part of what is pending has passed its date, paid or not', () => {
    expect(duesStatus(sums(1000, 0, 1000, 400))).toBe('OVERDUE');
    expect(duesStatus(sums(1000, 600, 400, 400))).toBe('OVERDUE');
  });
  it('tells part paid from nothing paid when nothing is overdue', () => {
    expect(duesStatus(sums(1000, 100, 900))).toBe('PARTIAL');
    expect(duesStatus(sums(1000, 0, 1000))).toBe('UNPAID');
  });
  it('counts dues carried from before as owing even with nothing billed this year', () => {
    expect(duesStatus(sums(0, 0, 500, 500))).toBe('OVERDUE');
  });
});
