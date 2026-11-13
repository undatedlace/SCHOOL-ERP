/** The kinds of Excel import, as they appear in the address (/api/imports/<slug>/...). */
export type ImportSlug = 'admissions' | 'fees' | 'student-attendance' | 'staff-attendance';

export type ImportStatus = 'CHECKED' | 'RUNNING' | 'IMPORTED' | 'CANCELLED' | 'EXPIRED';

export interface ImportSummary {
  total: number;
  ready: number;
  withWarnings: number;
  withErrors: number;
  unchanged: number;
  imported?: number;
  failed?: number;
}

export interface ImportRow {
  sheet: string;
  rowNumber: number;
  label: string;
  errors: string[];
  warnings: string[];
  unchanged: boolean;
  outcome: {
    status: 'IMPORTED' | 'FAILED';
    message?: string;
    ref?: { type: 'application' | 'student'; id: string };
  } | null;
}

export interface ImportBatch {
  id: string;
  slug: ImportSlug;
  status: ImportStatus;
  fileName: string;
  createdAt: string;
  importedAt: string | null;
  summary: ImportSummary;
  rows: ImportRow[];
}

export interface ImportListItem {
  id: string;
  slug: ImportSlug;
  status: ImportStatus;
  fileName: string;
  summary: ImportSummary;
  createdAt: string;
  importedAt: string | null;
  createdBy: string;
}

/** One student's year of fees, typed in by hand. Amounts are rupees as text. */
export interface SingleFees {
  studentId: string;
  academicYearId: string;
  billed: string;
  paid?: string;
  paidOn?: string;
  mode?: 'CASH' | 'CHEQUE' | 'UPI' | 'BANK_TRANSFER';
  reference?: string;
  note?: string;
}

export const IMPORT_TITLES: Record<ImportSlug, string> = {
  admissions: 'Admission applications',
  fees: 'Fees billed and paid',
  'student-attendance': 'Student attendance',
  'staff-attendance': 'Staff attendance',
};
