/** `GET /students/:id/fees`. Money arrives as text with two decimals ("1500.00"). */

export type PaymentMode = 'CASH' | 'CHEQUE' | 'UPI' | 'BANK_TRANSFER' | 'ONLINE';

export interface LedgerInstalment {
  seq: number;
  label: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
  /** What this instalment comes to after concessions. */
  due: string;
  paid: string;
  pending: string;
  overdue: boolean;
}

export interface LedgerInvoice {
  id: string;
  kind: 'FEE_STRUCTURE' | 'OPENING_BALANCE';
  note: string | null;
  /** When it was billed. */
  createdAt: string;
  academicYear: { id: string; name: string };
  lines: { description: string; amount: string }[];
  concessions: {
    id: string;
    amount: string;
    reason: string;
    createdAt: string;
    revoked: boolean;
    revokedReason: string | null;
  }[];
  instalments: LedgerInstalment[];
  gross: string;
  concessionTotal: string;
  paid: string;
  pending: string;
}

export interface LedgerPayment {
  id: string;
  receiptNo: string;
  amount: string;
  mode: PaymentMode;
  reference: string | null;
  bank: string | null;
  /** "YYYY-MM-DD" */
  paidOn: string;
  note: string | null;
  reversed: { reason: string; on: string } | null;
}

export interface StudentLedger {
  student: { id: string; admissionNo: string; fullName: string };
  totals: { gross: string; concessions: string; paid: string; pending: string };
  invoices: LedgerInvoice[];
  payments: LedgerPayment[];
}
