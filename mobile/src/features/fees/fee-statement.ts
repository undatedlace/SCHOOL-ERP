/**
 * The family's view of a fee ledger: balance tiles, the state of each instalment, and a
 * bank-style statement. All money is added as whole paise (see `@/lib/money`), never as floats.
 * The same rules as the web app's statement (`web/.../fees/fee-view.ts`).
 */
import { dayOf, todayIST } from '@/lib/dates';
import { parseRupees, sumRupees, type Paise } from '@/lib/money';
import type { BadgeTone } from '@/ui/Badge';
import type { LedgerInstalment, LedgerInvoice, PaymentMode, StudentLedger } from './types';

export const MODE_LABEL: Record<PaymentMode, string> = {
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  ONLINE: 'Online',
};

export interface FeeTotals {
  billed: Paise;
  paid: Paise;
  toPay: Paise;
  /** The part of what is still to pay whose instalment day has passed. */
  overdue: Paise;
}

export function feeTotals(ledger: StudentLedger): FeeTotals {
  const instalments = ledger.invoices.flatMap((inv) => inv.instalments);
  return {
    billed: parseRupees(ledger.totals.gross) ?? 0,
    paid: parseRupees(ledger.totals.paid) ?? 0,
    toPay: parseRupees(ledger.totals.pending) ?? 0,
    overdue: sumRupees(instalments.filter((i) => i.overdue).map((i) => i.pending)),
  };
}

export const invoiceTitle = (inv: LedgerInvoice) =>
  inv.kind === 'OPENING_BALANCE' ? `Previous dues (${inv.academicYear.name})` : `Fees ${inv.academicYear.name}`;

export interface InstalmentStatus {
  label: string;
  tone: BadgeTone;
}

/** Paid, Part paid, Overdue or Due: the word carries the meaning, the tone only supports it. */
export function instalmentStatus(i: LedgerInstalment): InstalmentStatus {
  const pending = parseRupees(i.pending) ?? 0;
  const paid = parseRupees(i.paid) ?? 0;
  if (pending === 0) return { label: 'Paid', tone: 'good' };
  if (i.overdue) return { label: paid > 0 ? 'Part paid, overdue' : 'Overdue', tone: 'bad' };
  if (paid > 0) return { label: 'Part paid', tone: 'warn' };
  return { label: 'Due', tone: 'neutral' };
}

export interface StatementRow {
  /** "YYYY-MM-DD" */
  date: string;
  description: string;
  detail: string | null;
  /** What adds to the balance (fees billed, a payment taken back), in paise. */
  charge: Paise | null;
  /** What takes away from it (a payment, a concession), in paise. */
  credit: Paise | null;
  /** What is still to pay after this line, in paise. */
  balance: Paise;
}

/** The India day a timestamp falls on (bills and concessions are stamped with a moment, not a day). */
function istDay(moment: string): string {
  const date = new Date(moment);
  return Number.isNaN(date.getTime()) ? '' : todayIST(date);
}

interface Event {
  date: string;
  order: number;
  description: string;
  detail: string | null;
  charge: Paise | null;
  credit: Paise | null;
}

/**
 * Fees billed, concessions, payments and payments taken back, in date order, with the balance
 * after each line. A revoked concession no longer counts and is left out; a payment that was taken
 * back shows twice (paid, then taken back), so the balance always ends at what is still to pay.
 */
export function statement(ledger: StudentLedger): StatementRow[] {
  const events: Event[] = [];
  for (const inv of ledger.invoices) {
    const billedOn = istDay(inv.createdAt);
    events.push({
      date: billedOn,
      order: 0,
      description: invoiceTitle(inv),
      detail: inv.note ?? (inv.lines.map((l) => l.description).join(', ') || null),
      charge: parseRupees(inv.gross) ?? 0,
      credit: null,
    });
    for (const c of inv.concessions.filter((x) => !x.revoked)) {
      events.push({
        date: istDay(c.createdAt) || billedOn,
        order: 1,
        description: 'Concession',
        detail: c.reason,
        charge: null,
        credit: parseRupees(c.amount) ?? 0,
      });
    }
  }
  for (const p of ledger.payments) {
    const paidOn = dayOf(p.paidOn) ?? '';
    const amount = parseRupees(p.amount) ?? 0;
    events.push({
      date: paidOn,
      order: 2,
      description: `Payment, receipt ${p.receiptNo}`,
      detail: MODE_LABEL[p.mode] + (p.reference ? `, ${p.reference}` : ''),
      charge: null,
      credit: amount,
    });
    if (p.reversed) {
      events.push({
        date: dayOf(p.reversed.on) ?? paidOn,
        order: 3,
        description: `Payment taken back, receipt ${p.receiptNo}`,
        detail: p.reversed.reason,
        charge: amount,
        credit: null,
      });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  let balance = 0;
  return events.map((e) => {
    balance += (e.charge ?? 0) - (e.credit ?? 0);
    return { date: e.date, description: e.description, detail: e.detail, charge: e.charge, credit: e.credit, balance };
  });
}
