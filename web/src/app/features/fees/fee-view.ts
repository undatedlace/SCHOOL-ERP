import { DuesStatus, LedgerInvoice, PaymentMode, StudentLedger } from '../../core/models';
import { BadgeTone } from '../../shared/ui/badge';

/** How each fee status is written and coloured. The word always carries the meaning. */
export const DUES_STATUS: Record<DuesStatus, { label: string; tone: BadgeTone }> = {
  PAID: { label: 'Paid', tone: 'good' },
  PARTIAL: { label: 'Part paid', tone: 'warn' },
  UNPAID: { label: 'Not paid', tone: 'neutral' },
  OVERDUE: { label: 'Overdue', tone: 'bad' },
  NONE: { label: 'Not billed', tone: 'neutral' },
};

/** The tabs on Fee dues, in order ('ALL' first). */
export const DUES_TABS: (DuesStatus | 'ALL')[] = ['ALL', 'OVERDUE', 'PARTIAL', 'UNPAID', 'PAID'];

export const MODE_LABEL: Record<PaymentMode, string> = {
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  ONLINE: 'Online',
};

/** Today in India as "YYYY-MM-DD". */
export function todayInIndia(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

/** Whole days from one ISO day to a later one ("2026-11-01" to "2026-11-12" is 11). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export const lateText = (days: number) => (days === 1 ? '1 day late' : `${days} days late`);

/** "1200.50" to 120050 paise, without floating point. */
export function toPaise(amount: string): number {
  const negative = amount.startsWith('-');
  const [whole, frac = ''] = amount.replace('-', '').split('.');
  const p = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return negative ? -p : p;
}

/** 120050 paise to "1200.50". */
export function fromPaise(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  return `${negative ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** A share as a whole percentage; a small share that is not nothing reads "under 1%", never "0%". */
export const percentText = (x: number) =>
  x > 0 && x < 0.005 ? 'under 1%' : `${Math.round(x * 100)}%`;

/** A share from 0 to 1 of two money amounts (0 when the whole is nothing). */
export const share = (part: string, whole: string) => {
  const w = toPaise(whole);
  return w > 0 ? Math.min(toPaise(part) / w, 1) : 0;
};

export const invoiceTitle = (inv: LedgerInvoice) =>
  inv.kind === 'OPENING_BALANCE'
    ? `Previous dues (${inv.academicYear.name})`
    : `Fees ${inv.academicYear.name}`;

export interface StatementRow {
  date: string;
  description: string;
  detail: string | null;
  /** What adds to the balance (fees billed, a payment taken back), as "1200.50" or null. */
  charge: string | null;
  /** What takes away from it (a payment, a concession). */
  credit: string | null;
  balance: string;
}

/**
 * A student's fees as a bank-style statement: fees billed, concessions, payments and payments
 * taken back, in date order, with the balance after each line. Concessions that were revoked are
 * left out (they no longer count), and a reversed payment shows twice: when it was paid and when it
 * was taken back, so the balance always ends at what is still to pay.
 */
export function statement(ledger: StudentLedger): StatementRow[] {
  const events: { date: string; order: number; row: Omit<StatementRow, 'balance'> }[] = [];
  for (const inv of ledger.invoices) {
    events.push({
      date: inv.createdAt.slice(0, 10),
      order: 0,
      row: {
        date: inv.createdAt.slice(0, 10),
        description: invoiceTitle(inv),
        detail: inv.note ?? (inv.lines.map((l) => l.description).join(', ') || null),
        charge: inv.gross,
        credit: null,
      },
    });
    for (const c of inv.concessions.filter((x) => !x.revoked)) {
      events.push({
        date: c.createdAt.slice(0, 10),
        order: 1,
        row: {
          date: c.createdAt.slice(0, 10),
          description: 'Concession',
          detail: c.reason,
          charge: null,
          credit: c.amount,
        },
      });
    }
  }
  for (const p of ledger.payments) {
    events.push({
      date: p.paidOn.slice(0, 10),
      order: 2,
      row: {
        date: p.paidOn.slice(0, 10),
        description: `Payment, receipt ${p.receiptNo}`,
        detail: MODE_LABEL[p.mode] + (p.reference ? ` · ${p.reference}` : ''),
        charge: null,
        credit: p.amount,
      },
    });
    if (p.reversed) {
      events.push({
        date: p.reversed.on.slice(0, 10),
        order: 3,
        row: {
          date: p.reversed.on.slice(0, 10),
          description: `Payment taken back, receipt ${p.receiptNo}`,
          detail: p.reversed.reason,
          charge: p.amount,
          credit: null,
        },
      });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  let balance = 0;
  return events.map(({ row }) => {
    balance += (row.charge ? toPaise(row.charge) : 0) - (row.credit ? toPaise(row.credit) : 0);
    return { ...row, balance: fromPaise(balance) };
  });
}
