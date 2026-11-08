/**
 * The money rules of the fee ledger, as small pure functions.
 *
 * All amounts here are whole paise (integers), never floating-point rupees, so
 * nothing is ever off by a fraction of a paisa. The database stores Decimal(12,2);
 * `toPaise` and `fromPaise` convert at the edge by reading and writing the digits,
 * without any floating-point arithmetic.
 *
 * Rule of the whole ledger: a balance is never typed in. It is always
 *   invoiced - concessions - payments that count (not reversed).
 */

export class LedgerError extends Error {}

/** "1234.5" or 1234.5 as 123450 paise. Refuses anything with more than two decimals. */
export function toPaise(
  value: string | number | { toString(): string },
): number {
  const text = String(value).trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) throw new LedgerError(`"${text}" is not an amount of money`);
  const paise = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(paise))
    throw new LedgerError('That amount is too large');
  return m[1] ? -paise : paise;
}

/** 123450 as "1234.50". */
export function fromPaise(paise: number): string {
  if (!Number.isInteger(paise)) throw new LedgerError('Paise must be whole');
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** A database amount (which may print as "5000") as text with two decimals ("5000.00"). */
export const money2 = (value: { toString(): string }): string =>
  fromPaise(toPaise(value.toString()));

/**
 * Splits `total` in proportion to `weights`, to the paisa. Every part is rounded down,
 * and whatever is left over goes to the last part, so the parts always add up to `total`.
 */
export function splitByWeights(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (total < 0) throw new LedgerError('Cannot split a negative amount');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // Nothing to be proportional to: share evenly.
    const even = weights.map(() => Math.floor(total / weights.length));
    even[even.length - 1] += total - even.reduce((a, b) => a + b, 0);
    return even;
  }
  // BigInt for the product: total * weight can pass the safe-integer limit.
  const parts = weights.map((w) =>
    Number((BigInt(total) * BigInt(w)) / BigInt(sum)),
  );
  parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

/**
 * What each instalment really asks for once concessions are taken off: the net
 * amount of the invoice, shared across the instalments in proportion to what they
 * were before the concession.
 */
export function netInstalments(
  grossParts: number[],
  concession: number,
): number[] {
  const gross = grossParts.reduce((a, b) => a + b, 0);
  if (concession < 0 || concession > gross)
    throw new LedgerError('The concession cannot be more than the invoice');
  return splitByWeights(gross - concession, grossParts);
}

export interface InstalmentStatus {
  due: number;
  paid: number;
  pending: number;
}

/**
 * Pays instalments in order (earliest first) from the total paid on the invoice.
 * A payment therefore covers part of an instalment, or several instalments.
 */
export function waterfall(
  netParts: number[],
  paid: number,
): InstalmentStatus[] {
  let left = Math.max(0, paid);
  return netParts.map((due) => {
    const take = Math.min(due, left);
    left -= take;
    return { due, paid: take, pending: due - take };
  });
}

export interface Pending {
  id: string;
  pending: number;
}
export interface Allocation {
  invoiceId: string;
  amount: number;
}

/** Spreads a payment over invoices that are still owed, in the order given (oldest first). */
export function allocateOldestFirst(
  invoices: Pending[],
  amount: number,
): Allocation[] {
  if (!Number.isInteger(amount) || amount <= 0)
    throw new LedgerError('The amount must be more than zero');
  const owed = invoices.reduce((a, i) => a + Math.max(0, i.pending), 0);
  if (amount > owed) {
    throw new LedgerError(
      `The payment (${fromPaise(amount)}) is more than what is owed (${fromPaise(owed)})`,
    );
  }
  const out: Allocation[] = [];
  let left = amount;
  for (const inv of invoices) {
    if (left === 0) break;
    const take = Math.min(left, Math.max(0, inv.pending));
    if (take > 0) out.push({ invoiceId: inv.id, amount: take });
    left -= take;
  }
  return out;
}

/** Checks an explicit allocation: it must add up to the payment and never exceed what an invoice owes. */
export function checkAllocations(
  invoices: Pending[],
  allocations: Allocation[],
  amount: number,
): void {
  const byId = new Map(invoices.map((i) => [i.id, i.pending]));
  const seen = new Set<string>();
  let total = 0;
  for (const a of allocations) {
    if (!Number.isInteger(a.amount) || a.amount <= 0)
      throw new LedgerError('Each part of a payment must be more than zero');
    if (seen.has(a.invoiceId))
      throw new LedgerError('An invoice is listed twice');
    seen.add(a.invoiceId);
    const pending = byId.get(a.invoiceId);
    if (pending === undefined)
      throw new LedgerError('That invoice does not belong to this student');
    if (a.amount > pending) {
      throw new LedgerError(
        `${fromPaise(a.amount)} is more than the ${fromPaise(Math.max(0, pending))} still owed on an invoice`,
      );
    }
    total += a.amount;
  }
  if (total !== amount)
    throw new LedgerError(
      `The parts (${fromPaise(total)}) must add up to the payment (${fromPaise(amount)})`,
    );
}

/** The pending balance of one invoice. Never negative: an invoice cannot be overpaid. */
export const pendingBalance = (
  gross: number,
  concessions: number,
  allocatedAndCounted: number,
): number => gross - concessions - allocatedAndCounted;
